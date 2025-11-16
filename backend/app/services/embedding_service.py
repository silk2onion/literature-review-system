"""
Embedding 服务
- 为 Paper 生成文本向量
- 提供批量回填 Paper.embedding 的能力
"""

from __future__ import annotations

import logging
from typing import List, Optional

from openai import AsyncOpenAI
from sqlalchemy.orm import Session

from app.config import settings
from app.models.paper import Paper

logger = logging.getLogger(__name__)

# 尝试从 Settings 读取 EMBEDDING_MODEL，若无则回退到一个常见默认值
EMBEDDING_MODEL_NAME = getattr(settings, "EMBEDDING_MODEL", "text-embedding-3-small")


class EmbeddingService:
    """
    基于 OpenAI 兼容接口的向量服务。
    
    当前主要用于：
    - 将 Paper 的 标题 + 摘要 编码为向量，写入 Paper.embedding 字段
    - 提供简单的批量回填能力，后续可作为 RAG 检索的基础
    """

    def __init__(self) -> None:
        if not settings.OPENAI_API_KEY or not settings.OPENAI_BASE_URL:
            logger.warning("EmbeddingService 初始化时未检测到 OPENAI_API_KEY / OPENAI_BASE_URL，向量生成功能将不可用")
        self.client = AsyncOpenAI(
            api_key=settings.OPENAI_API_KEY,
            base_url=settings.OPENAI_BASE_URL,
        )
        # 默认使用当前 settings 中的 EMBEDDING_MODEL，后续也可以在运行时通过 settings 更新
        self.default_model = EMBEDDING_MODEL_NAME

    async def embed_text(self, text: str) -> Optional[List[float]]:
        """
        对任意文本生成 embedding 向量。
        返回 None 表示调用失败（同时会打日志）。
        """
        text = (text or "").strip()
        if not text:
            logger.warning("embed_text 被调用时文本为空，直接返回 None")
            return None
        # 简单裁剪，避免输入过长导致超限
        if len(text) > 6000:
            text = text[:6000]
        try:
            # 每次调用时优先读取最新的 settings.EMBEDDING_MODEL，以支持运行时模型切换
            model_name = getattr(settings, "EMBEDDING_MODEL", None) or self.default_model
            resp = await self.client.embeddings.create(
                model=model_name,
                input=[text],
            )
        except Exception as exc:
            logger.error("调用 embedding 接口失败: %s", exc)
            return None
        try:
            vector = resp.data[0].embedding  # type: ignore[attr-defined]
        except Exception as exc:
            logger.error("解析 embedding 返回结果失败: %s", exc)
            return None
        return list(vector)

    async def embed_paper(self, paper: Paper) -> Optional[List[float]]:
        """
        将单篇 Paper 的 标题 + 摘要 编码为向量。
        使用 getattr 避免静态类型检查将 ORM 字段视为 Column 对象。
        """
        title = getattr(paper, "title", "") or ""
        abstract = getattr(paper, "abstract", "") or ""
        # 标题权重略高一些，可以放在前面；同时通过 strip 处理没有摘要的情况
        text: str = f"{title}\n\n{abstract}".strip()
        return await self.embed_text(text)

    async def backfill_missing_embeddings(self, db: Session, limit: int = 100) -> int:
        """
        为缺少 embedding 的 Paper 批量生成向量并回填。
        
        Args:
            db: SQLAlchemy Session
            limit: 本次最多处理多少条记录（避免一次性跑太久）
        
        Returns:
            实际成功写入 embedding 的 Paper 数量
        """
        # 仅选择 embedding 字段为空的记录
        qs = (
            db.query(Paper)
            .filter(Paper.embedding.is_(None))
            .order_by(Paper.id.asc())
            .limit(limit)
        )
        papers = qs.all()
        if not papers:
            logger.info("没有需要回填 embedding 的 Paper 记录")
            return 0
        logger.info("准备为 %d 篇 Paper 生成 embedding（上限 %d）", len(papers), limit)
        updated = 0
        for paper in papers:
            vec = await self.embed_paper(paper)
            if vec is None:
                continue
            paper.embedding = vec  # type: ignore[assignment]
            updated += 1
        if updated > 0:
            db.commit()
            logger.info("成功回填 %d 条 Paper.embedding", updated)
        else:
            logger.info("本次未成功回填任何 Paper.embedding")
        return updated


_embedding_service: Optional[EmbeddingService] = None


def get_embedding_service() -> EmbeddingService:
    """返回进程内共享的 EmbeddingService 实例。"""
    global _embedding_service
    if _embedding_service is None:
        _embedding_service = EmbeddingService()
    return _embedding_service