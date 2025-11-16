"""
综述服务模块
"""

import logging
from datetime import datetime
from typing import Any, Dict, List

from sqlalchemy.orm import Session

from app.config import settings
from app.models import Review, RecallLog
from app.schemas.review import (
    LitReviewLLMResult,
    ReviewGenerate,
    ReviewGenerateResponse,
    ReviewStatus,
)
from app.services.crawler import search_across_sources
from app.services.llm.openai_service import OpenAIService
from app.utils.cache import review_cache

logger = logging.getLogger(__name__)


async def generate_review(
    db: Session,
    payload: ReviewGenerate,
) -> ReviewGenerateResponse:
    """
    生成综述：
    1. 调用 LLM 生成综述
    2. 保存到数据库（包括 analysis_json）
    3. 返回综述 ID 和状态
    """
    # 0. 构造缓存 key，先看是否已有完成的综述可直接复用
    cache_key = review_cache.make_key(
        "review_generate_core",
        tuple(sorted(payload.keywords or [])),
        int(payload.paper_limit),
        int(payload.year_from) if payload.year_from else None,
        int(payload.year_to) if payload.year_to else None,
        payload.custom_prompt or "",
        tuple(sorted(payload.sources or [])),
    )
    cached = review_cache.get(cache_key)
    if cached is not None:
        return cached

    llm_service = OpenAIService(settings=settings)

    # 1. 基于请求参数检索一批候选文献（当前使用 search_across_sources）
    sources = payload.sources or ["arxiv"]
    papers: List[Any] = search_across_sources(
        keywords=payload.keywords,
        sources=sources,
        limit=payload.paper_limit,
        year_from=payload.year_from,
        year_to=payload.year_to,
    )

    # 1.1 记录召回相关日志（综述生成使用的候选文献）
    try:
        papers_summary = []
        for idx, p in enumerate(papers[:50]):
            if isinstance(p, dict):
                papers_summary.append(
                    {
                        "idx": idx,
                        "title": p.get("title"),
                        "year": p.get("year"),
                        "source": p.get("source"),
                        "doi": p.get("doi"),
                        "arxiv_id": p.get("arxiv_id"),
                    }
                )
            else:
                papers_summary.append(
                    {
                        "idx": idx,
                        "repr": repr(p),
                    }
                )

        recall_log = RecallLog(
            event_type="query",
            source="review_generate",
            query_keywords=payload.keywords,
            group_keys=None,
            paper_id=None,
            rank=None,
            score=None,
            extra={
                "sources": sources,
                "paper_limit": payload.paper_limit,
                "year_from": payload.year_from,
                "year_to": payload.year_to,
                "papers_summary": papers_summary,
            },
        )
        db.add(recall_log)
        db.commit()
    except Exception:
        logger.exception("记录综述生成召回日志失败", exc_info=True)

    try:
        llm_result: LitReviewLLMResult = await llm_service.generate_lit_review(
            keywords=payload.keywords,
            papers=papers,
            custom_prompt=payload.custom_prompt,
            year_from=payload.year_from,
            year_to=payload.year_to,
        )

        # 组装结构化分析数据，便于前端直接用于时间轴 / 主题统计
        summary_stats: Dict[str, Any] = {
            "timeline": [t.model_dump() for t in llm_result.timeline],
            "topics": [t.model_dump() for t in llm_result.topics],
        }

        model_name = getattr(llm_service, "model_name", None)

        review = Review(
            title=" / ".join(payload.keywords),
            # 注意：Review.keywords 列类型在模型中是 JSON / Text，具体以模型为准
            keywords=payload.keywords,  # 若模型为 Text，可在模型层统一转成字符串
            framework=None,  # 大纲后续可单独抽取
            content=llm_result.markdown,
            abstract=None,
            status=ReviewStatus.COMPLETED.value
            if isinstance(ReviewStatus.COMPLETED.value, str)
            else "completed",
            language="zh-CN",
            model_config={"model": model_name} if model_name else None,
            paper_count=payload.paper_limit,
            word_count=len(llm_result.markdown or ""),
            analysis_json=summary_stats,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
            completed_at=datetime.utcnow(),
        )
        db.add(review)
        db.commit()
        db.refresh(review)

        resp = ReviewGenerateResponse(
            success=True,
            review_id=int(getattr(review, "id")),
            status=ReviewStatus.COMPLETED,
            message="综述生成成功",
            preview_markdown=llm_result.markdown,
            used_prompt=None,  # 若后续有 PromptConfig，再填充
            summary_stats=summary_stats,
        )

        review_cache.set(cache_key, resp)
        return resp
    except Exception as e:
        return ReviewGenerateResponse(
            success=False,
            review_id=0,
            status=getattr(ReviewStatus, "ERROR", ReviewStatus.COMPLETED),
            message=f"LLM 生成失败: {e}",
        )