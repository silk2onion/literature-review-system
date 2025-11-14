"""
Review 相关 API 路由
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import List, Any

from sqlalchemy.orm import Session

from app.schemas.review import (
    ReviewResponse,
    ReviewPaperInfo,
    ReviewFullExport,
    ReviewGenerate,
    ReviewGenerateResponse,
    ReviewStatus,
)
from app.models import Review
from app.database import SessionLocal, get_db
from app.config import settings
from app.utils.cache import review_cache

router = APIRouter(
    prefix="/api/reviews",
    tags=["reviews"],
)


def get_db_local():
    """
    保留一个本文件内的 Session 获取器（兼容你现在的写法）。
    但后续新的导出接口会优先使用全局的 get_db 依赖。
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.get("/latest", response_model=ReviewResponse)
def get_latest_review():
    """
    获取最新一条综述（按 created_at 排序）
    """
    db = next(get_db_local())
    review = db.query(Review).order_by(Review.created_at.desc()).first()
    if not review:
        raise HTTPException(status_code=404, detail="No reviews found")
    return review


@router.post("/generate", response_model=ReviewGenerateResponse)
async def generate_review(payload: ReviewGenerate, db: Session = Depends(get_db)) -> ReviewGenerateResponse:
    """
    生成文献综述（前端“生成文献综述”按钮调用的接口）

    开发策略：
    1. 先按当前逻辑创建一条占位 Review，保证 DB 结构不变；
    2. 调用 OpenAIService.generate_lit_review 接入 LLM；
    3. 用 LLM 的 markdown 覆盖原来的占位 framework；
    4. 捕获异常，返回 success=False，而不是抛出 500，从而避免 CORS 报错。
    """
    from datetime import datetime
    from app.models.paper import Paper
    from app.services.llm.openai_service import OpenAIService
    from app.schemas.review import LitReviewLLMResult

    # 0. 构造缓存 key，先看是否已有完成的综述可直接复用
    # 只要生成参数完全相同，就视为同一任务
    cache_key = review_cache.make_key(
        "review_generate",
        tuple(sorted(payload.keywords or [])),
        int(payload.paper_limit),
        int(payload.year_from) if payload.year_from else None,
        int(payload.year_to) if payload.year_to else None,
        payload.custom_prompt or "",
    )

    cached = review_cache.get(cache_key)
    if cached is not None:
        # 直接复用缓存中的 ReviewGenerateResponse
        return cached

    # 1. 先按旧逻辑创建占位框架，避免破坏现有行为
    framework_md = "```markdown\n"
    framework_md += "# 自动生成的城市设计文献综述占位框架\n\n"
    framework_md += f"- 关键词: {', '.join(payload.keywords)}\n"
    framework_md += f"- 文献数量上限: {payload.paper_limit}\n"
    framework_md += "```"

    review = Review(
        title=" / ".join(payload.keywords),
        keywords="; ".join(payload.keywords),
        framework=framework_md,  # type: ignore[arg-type]
        content=None,
        # 注意：这里直接写字符串状态，保持和当前 Review 模型一致
        status="generating",
        paper_count=0,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(review)
    db.commit()
    db.refresh(review)

    # 2. 接入 LLM：即便失败也要用 try/except 包住，避免 500
    llm_service = OpenAIService(settings=settings)

    # TODO：后续按 ToDo 把真正检索到的 Paper 列表接进来，目前先传空列表以保证流程可用
    papers: list[Paper] = []

    try:
        llm_result: LitReviewLLMResult = await llm_service.generate_lit_review(
            keywords=payload.keywords,
            papers=papers,
            custom_prompt=payload.custom_prompt,
            year_from=payload.year_from,
            year_to=payload.year_to,
        )

        # 用 LLM 生成的 markdown 覆盖原来的占位框架
        # 这里通过 getattr/setattr 避免 Pylance 把 ORM Column 类型误判为字段类型
        setattr(review, "framework", llm_result.markdown)
        setattr(review, "updated_at", datetime.utcnow())
        db.commit()
        db.refresh(review)

        # 将部分关键信息直接返回给前端，便于即时预览
        summary_stats: dict[str, Any] = {
            "timeline": [t.model_dump() for t in llm_result.timeline],
            "topics": [t.model_dump() for t in llm_result.topics],
        }

        resp = ReviewGenerateResponse(
            success=True,
            review_id=int(getattr(review, "id")),
            # 这里直接返回字符串，避免依赖枚举具体成员名，类型检查用 ignore
            status="generating",  # type: ignore[arg-type]
            message="LLM 文献综述生成成功",
            preview_markdown=llm_result.markdown,
            summary_stats=summary_stats,
        )

        # 写入缓存，下次相同参数可以直接复用
        review_cache.set(cache_key, resp)

        return resp
    except Exception as e:
        # 这里不抛出异常，避免 500 + 没有 CORS 头，前端只需看 success 字段
        return ReviewGenerateResponse(
            success=False,
            review_id=int(getattr(review, "id")),
            status="error",  # type: ignore[arg-type]
            message=f"LLM 生成失败: {e}",
        )


@router.get("/{review_id}/export/full", response_model=ReviewFullExport)
def export_review_full(review_id: int, db: Session = Depends(get_db)):
    """
    第二条路：一次性导出
    1) 文献原始 JSON 信息（标题等）
    2) 对应的 markdown 综述结果
    """
    from app.models import ReviewPaper, Paper  # 延迟导入避免循环

    # 1. 拿综述
    review = db.query(Review).filter(Review.id == review_id).first()
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")

    framework_value = getattr(review, "framework")
    if not framework_value:
        raise HTTPException(status_code=400, detail="Review framework is empty")

    # 2. 拿当前综述关联的所有 paper
    rps = (
        db.query(ReviewPaper)
        .filter(ReviewPaper.review_id == review_id)
        .order_by(ReviewPaper.order_index.asc(), ReviewPaper.id.asc())
        .all()
    )
    paper_ids = [rp.paper_id for rp in rps]

    papers = []
    if paper_ids:
        papers = (
            db.query(Paper)
            .filter(Paper.id.in_(paper_ids))
            .all()
        )

    # 3. 映射成 JSON 友好的结构
    paper_infos: List[ReviewPaperInfo] = []
    for p in papers:
        authors = None
        if getattr(p, "authors", None):
            # 支持 "A; B; C" 或 "A, B, C" 的作者串
            authors = [
                a.strip()
                for a in str(p.authors).replace(";", ",").split(",")
                if a.strip()
            ]
        paper_infos.append(
            ReviewPaperInfo(
                id=int(getattr(p, "id")),
                title=str(getattr(p, "title")),
                authors=authors,
                year=getattr(p, "year", None),
                journal=getattr(p, "journal", None),
                arxiv_id=getattr(p, "arxiv_id", None),
                doi=getattr(p, "doi", None),
                pdf_url=getattr(p, "pdf_url", None),
                abs_url=getattr(p, "abs_url", None),
            )
        )

    return ReviewFullExport(
        review=ReviewResponse.model_validate(review),
        papers=paper_infos,
        markdown=str(framework_value),
    )


@router.get("/{review_id}", response_model=ReviewResponse)
def get_review_by_id(review_id: int):
    """
    根据 ID 获取单条综述信息（包括 framework）
    方便你在没有前端页面的情况下，直接通过 /api/docs 查看 JSON 结果。
    """
    # 手动管理 session，避免依赖额外的 DI 代码
    db = next(get_db_local())
    review = db.query(Review).filter(Review.id == review_id).first()
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")
    return review

