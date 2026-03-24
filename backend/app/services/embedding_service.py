"""
Embedding 服务
- 为 Paper 生成文本向量
- 为 PaperChunk 生成文本向量（片段级 RAG）
- 提供批量回填 Paper.embedding / PaperChunk.embedding 的能力
"""

from __future__ import annotations

import logging
from typing import List, Optional

from openai import AsyncOpenAI
from sqlalchemy.orm import Session

from app.config import settings
from app.models.paper import Paper
from app.models.paper_chunk import PaperChunk

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

    async def embed_texts(self, texts: List[str]) -> List[Optional[List[float]]]:
        """
        批量生成文本向量。
        """
        if not texts:
            return []
            
        # 简单裁剪
        cleaned_texts = [t[:6000] for t in texts]
        
        try:
            model_name = getattr(settings, "EMBEDDING_MODEL", None) or self.default_model
            resp = await self.client.embeddings.create(
                model=model_name,
                input=cleaned_texts,
            )
            
            # 按顺序提取结果
            embeddings = [None] * len(texts)
            for item in resp.data:
                embeddings[item.index] = list(item.embedding) # type: ignore
                
            return embeddings
            
        except Exception as exc:
            logger.error("批量调用 embedding 接口失败: %s", exc)
            return [None] * len(texts)

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

    async def embed_chunk(self, chunk: PaperChunk) -> Optional[List[float]]:
        """
        为单个 PaperChunk 生成 embedding 向量。
        """
        content = getattr(chunk, "content", "") or ""
        if not content.strip():
            return None
        return await self.embed_text(content)

    async def embed_chunks_batch(
        self, chunks: List[PaperChunk], batch_size: int = 20
    ) -> int:
        """
        批量为 PaperChunk 列表生成 embedding。
        
        Args:
            chunks: 需要生成 embedding 的 PaperChunk 列表
            batch_size: 每批调用 API 的数量
            
        Returns:
            成功生成 embedding 的 chunk 数量
        """
        if not chunks:
            return 0
        
        updated = 0
        for i in range(0, len(chunks), batch_size):
            batch = chunks[i:i + batch_size]
            texts = [(getattr(c, "content", "") or "").strip() for c in batch]
            
            # 过滤空文本
            valid_indices = [j for j, t in enumerate(texts) if t]
            if not valid_indices:
                continue
            
            valid_texts = [texts[j] for j in valid_indices]
            
            try:
                embeddings = await self.embed_texts(valid_texts)
                for idx, emb in zip(valid_indices, embeddings):
                    if emb is not None:
                        batch[idx].embedding = emb  # type: ignore[assignment]
                        updated += 1
            except Exception as e:
                logger.error(f"Batch chunk embedding failed (batch {i // batch_size}): {e}")
                # 降级为逐个处理
                for j, text in zip(valid_indices, valid_texts):
                    try:
                        vec = await self.embed_text(text)
                        if vec:
                            batch[j].embedding = vec  # type: ignore[assignment]
                            updated += 1
                    except Exception as inner_e:
                        logger.warning(f"Individual chunk embedding failed: {inner_e}")
        
        logger.info(f"Batch chunk embedding: {updated}/{len(chunks)} succeeded")
        return updated

    async def backfill_missing_embeddings(self, db: Session, limit: int = 100) -> int:
        """
        为缺少 embedding 的 Paper 批量生成向量并回填。
        
        Args:
            db: SQLAlchemy Session
            limit: 本次最多处理多少条记录（避免一次性跑太久）
        
        Returns:
            实际成功写入 embedding 的 Paper 数量
        """
        # 查询所有 papers，在 Python 中过滤（因为 JSON 字段的空值判断在 SQL 中比较复杂）
        all_papers = db.query(Paper).order_by(Paper.id.asc()).all()
        
        logger.info(f"Total papers in database: {len(all_papers)}")
        
        papers_without_embedding = []
        for p in all_papers:
            emb = getattr(p, "embedding", None)
            # 检查是否为 None、空列表、空字典、空字符串
            if not emb or emb in ([], {}, "", "null", "[]", "{}"):
                logger.debug(f"Paper {p.id} has no embedding (type: {type(emb)}, value: {repr(emb)})")
                papers_without_embedding.append(p)
                if len(papers_without_embedding) >= limit:
                    break
            else:
                logger.debug(f"Paper {p.id} HAS embedding (type: {type(emb)}, len: {len(emb) if isinstance(emb, (list, dict, str)) else 'N/A'})")
        
        logger.info(f"Papers without embedding: {len(papers_without_embedding)}")
        
        if not papers_without_embedding:
            logger.info("没有需要回填 embedding 的 Paper 记录")
            return 0
            
        logger.info("准备为 %d 篇 Paper 生成 embedding（上限 %d）", len(papers_without_embedding), limit)
        updated = 0
        for paper in papers_without_embedding:
            vec = await self.embed_paper(paper)
            if vec is None:
                logger.warning(f"Failed to generate embedding for paper {paper.id}")
                continue
            paper.embedding = vec  # type: ignore[assignment]
            updated += 1
            
        if updated > 0:
            db.commit()
            logger.info("成功回填 %d 条 Paper.embedding", updated)
        else:
            logger.info("本次未成功回填任何 Paper.embedding")
        return updated

    async def backfill_missing_chunk_embeddings(
        self, db: Session, limit: int = 500, batch_size: int = 20
    ) -> int:
        """
        为缺少 embedding 的 PaperChunk 批量生成向量并回填。
        
        Args:
            db: SQLAlchemy Session
            limit: 本次最多处理多少条 chunk
            batch_size: 每批调用 API 的数量
            
        Returns:
            成功写入 embedding 的 PaperChunk 数量
        """
        # 查询缺少 embedding 的 chunks
        all_chunks = (
            db.query(PaperChunk)
            .order_by(PaperChunk.id.asc())
            .limit(limit * 2)  # 多取一些，因为有些可能已有 embedding
            .all()
        )
        
        chunks_without_embedding = []
        for c in all_chunks:
            emb = getattr(c, "embedding", None)
            if not emb or emb in ([], {}, "", "null", "[]", "{}"):
                chunks_without_embedding.append(c)
                if len(chunks_without_embedding) >= limit:
                    break
        
        if not chunks_without_embedding:
            logger.info("没有需要回填 embedding 的 PaperChunk 记录")
            return 0
        
        logger.info(
            "准备为 %d 个 PaperChunk 生成 embedding（上限 %d）",
            len(chunks_without_embedding), limit
        )
        
        updated = await self.embed_chunks_batch(chunks_without_embedding, batch_size=batch_size)
        
        if updated > 0:
            db.commit()
            logger.info("成功回填 %d 条 PaperChunk.embedding", updated)
        
        return updated


_embedding_service: Optional[EmbeddingService] = None


def get_embedding_service() -> EmbeddingService:
    """返回进程内共享的 EmbeddingService 实例。"""
    global _embedding_service
    if _embedding_service is None:
        _embedding_service = EmbeddingService()
    return _embedding_service