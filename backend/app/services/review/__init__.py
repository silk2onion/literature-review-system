"""
综述服务模块
"""

import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

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
    生成综述（支持两种模式）：
    1. 默认模式：一次性结构化综述（generate_lit_review）
    2. PhD 级多阶段管线：先生成框架，再生成章节级综述内容

    最终都会：
    - 保存到数据库（包括 analysis_json）
    - 返回综述 ID 和状态
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
        bool(getattr(payload, "framework_only", False)),
        bool(getattr(payload, "phd_pipeline", False)),
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
        model_name = getattr(llm_service, "model_name", None)

        # 根据请求选择生成模式
        framework_md: Optional[str] = None
        content_md: Optional[str] = None
        summary_stats: Dict[str, Any] = {}

        if getattr(payload, "phd_pipeline", False):
            # PhD 级多阶段管线：先生成框架，再写章节级综述
            framework_md = await llm_service.generate_review_framework(
                keywords=payload.keywords,
                papers=papers,
            )

            # 如果只需要框架，则直接保存框架并返回
            if payload.framework_only:
                pipeline_stats: Dict[str, Any] = {
                    "pipeline": {
                        "mode": "phd_pipeline",
                        "only_framework": True,
                    }
                }

                review = Review(
                    title=" / ".join(payload.keywords),
                    keywords=payload.keywords,
                    framework=framework_md,
                    content=None,
                    abstract=None,
                    status=ReviewStatus.COMPLETED.value
                    if isinstance(ReviewStatus.COMPLETED.value, str)
                    else "completed",
                    language="zh-CN",
                    model_config={"model": model_name} if model_name else None,
                    paper_count=len(papers),
                    word_count=len(framework_md or ""),
                    analysis_json=pipeline_stats,
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
                    message="PhD 级多阶段综述框架生成成功",
                    preview_markdown=framework_md,
                    used_prompt=None,
                    summary_stats=pipeline_stats,
                )

                review_cache.set(cache_key, resp)
                return resp

            # 完整多阶段：在框架基础上生成详细内容
            content_md = await llm_service.generate_review_content(
                framework=framework_md,
                papers=papers,
            )

            summary_stats = {
                "pipeline": {
                    "mode": "phd_pipeline",
                    "steps": [
                        {
                            "name": "framework",
                            "description": "基于候选文献生成综述框架",
                        },
                        {
                            "name": "content",
                            "description": "基于框架撰写章节级综述与总结",
                        },
                    ],
                }
            }

        else:
            # 默认：一步式结构化综述（带 timeline / topics）
            llm_result: LitReviewLLMResult = await llm_service.generate_lit_review(
                keywords=payload.keywords,
                papers=papers,
                custom_prompt=payload.custom_prompt,
                year_from=payload.year_from,
                year_to=payload.year_to,
            )

            framework_md = None
            content_md = llm_result.markdown

            # 组装结构化分析数据，便于前端直接用于时间轴 / 主题统计
            summary_stats = {
                "timeline": [t.model_dump() for t in llm_result.timeline],
                "topics": [t.model_dump() for t in llm_result.topics],
            }

        review = Review(
            title=" / ".join(payload.keywords),
            # 注意：Review.keywords 列类型在模型中是 JSON / Text，具体以模型为准
            keywords=payload.keywords,  # 若模型为 Text，可在模型层统一转成字符串
            framework=framework_md,
            content=content_md,
            abstract=None,
            status=ReviewStatus.COMPLETED.value
            if isinstance(ReviewStatus.COMPLETED.value, str)
            else "completed",
            language="zh-CN",
            model_config={"model": model_name} if model_name else None,
            paper_count=len(papers),
            word_count=len(content_md or ""),
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
            preview_markdown=content_md,
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