"""
综述服务模块
"""

from datetime import datetime
from typing import Any, Dict, List

from sqlalchemy.orm import Session

from app.config import settings
from app.models import Review
from app.schemas.review import (
    LitReviewLLMResult,
    ReviewGenerate,
    ReviewGenerateResponse,
    ReviewStatus,
)
from app.services.llm.openai_service import OpenAIService
from app.utils.cache import review_cache


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
    )
    cached = review_cache.get(cache_key)
    if cached is not None:
        return cached

    llm_service = OpenAIService(settings=settings)

    # TODO：后续把真正检索到的 Paper 列表传入，这里先用空列表占位
    papers: List[Any] = []

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
            model_config={"model": llm_service.model_name},
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
            status=ReviewStatus.ERROR
            if hasattr(ReviewStatus, "ERROR")
            else ReviewStatus.COMPLETED,
            message=f"LLM 生成失败: {e}",
        )