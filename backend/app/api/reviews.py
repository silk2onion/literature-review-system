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
from app.services.review import generate_review as core_generate_review

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

    新版实现：
    - 直接调用核心服务 app.services.review.generate_review
    - 在核心服务内部：
      * 调用 LLM 生成 markdown + timeline + topics
      * 将 summary_stats 持久化到 Review.analysis_json
      * 返回包含 summary_stats 的 ReviewGenerateResponse
    - 此处只负责接入 FastAPI 依赖注入和异常处理
    """
    try:
        resp = await core_generate_review(db=db, payload=payload)
        return resp
    except Exception as e:
        # 兜底保护，避免直接抛出 500 导致前端 CORS 错误
        return ReviewGenerateResponse(
            success=False,
            review_id=0,
            status="error",  # type: ignore[arg-type]
            message=f"综述生成接口失败: {e}",
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

