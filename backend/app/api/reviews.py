"""
Review 相关 API 路由
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import List, Any
import logging
import time

from sqlalchemy.orm import Session

from app.schemas.review import (
    ReviewResponse,
    ReviewPaperInfo,
    ReviewFullExport,
    ReviewGenerate,
    ReviewGenerateResponse,
    ReviewStatus,
    ReviewExport,
)
from app.models import Review
from app.database import SessionLocal, get_db
from app.config import settings
from app.utils.cache import review_cache
from app.services.review import generate_review as core_generate_review
from app.services.review import SectionReviewPipelineService
from app.services.llm.openai_service import OpenAIService
from app.services.semantic_search import get_semantic_search_service
from app.schemas.review import (
    GenerateSectionClaimsRequest,
    GenerateSectionClaimsResponse,
    AttachEvidenceRequest,
    AttachEvidenceResponse,
    RenderSectionFromClaimsRequest,
    RenderSectionFromClaimsResponse,
    PhdPipelineInitResponse,
)

router = APIRouter(
    prefix="/api/reviews",
    tags=["reviews"],
)


# 依赖项：获取 SectionReviewPipelineService 实例
def get_section_review_pipeline_service(
    db: Session = Depends(get_db),
) -> SectionReviewPipelineService:
    """依赖注入 SectionReviewPipelineService"""
    # 使用项目推荐的单例模式获取服务实例
    llm_service = OpenAIService(settings=settings)
    semantic_search_service = get_semantic_search_service()
    return SectionReviewPipelineService(
        db=db,
        llm_service=llm_service,
        semantic_search_service=semantic_search_service,
    )


@router.post(
    "/phd/init",
    response_model=PhdPipelineInitResponse,
    summary="【PhD Pipeline】初始化：创建综述 -> 生成框架 -> 生成首批论点",
)
async def init_phd_pipeline(
    payload: ReviewGenerate,
    db: Session = Depends(get_db),
    service: SectionReviewPipelineService = Depends(get_section_review_pipeline_service),
):
    """
    PhD Pipeline 的快速入口：
    1. 创建 Review 并生成 Framework (调用 generate_review)
    2. 使用生成的 Framework 作为 outline，生成第一批 Claims
    3. 返回 review_id 和 claims，供前端进入 Step 2
    """
    # 1. 强制设置 phd_pipeline=True, framework_only=True
    payload.phd_pipeline = True
    payload.framework_only = True
    
    # 调用核心生成逻辑
    gen_resp = await core_generate_review(db=db, payload=payload)
    if not gen_resp.success:
        raise HTTPException(status_code=500, detail=f"初始化综述失败: {gen_resp.message}")
    
    review_id = gen_resp.review_id
    framework = gen_resp.preview_markdown
    
    if not framework:
        raise HTTPException(status_code=500, detail="未能生成综述框架")

    # 2. 生成 Claims
    try:
        table = await service.generate_section_claims(
            review_id=review_id,
            section_outline=framework, # 使用整个框架作为 outline
        )
        return PhdPipelineInitResponse(
            review_id=review_id,
            claims=table.claims
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"生成论点失败: {e}")


@router.post(
    "/phd/generate-claims",
    response_model=GenerateSectionClaimsResponse,
    summary="【PhD Pipeline】阶段 1 (高级): 为特定章节生成论点表",
)
async def generate_claims_for_section(
    payload: GenerateSectionClaimsRequest,
    service: SectionReviewPipelineService = Depends(get_section_review_pipeline_service),
):
    """
    根据指定的综述 ID 和章节大纲，调用 LLM 生成一个结构化的“论点-证据”表。
    这是 PhD 级综述管线的第一步。
    """
    try:
        table = await service.generate_section_claims(
            review_id=payload.review_id,
            section_outline=payload.section_outline,
        )
        return GenerateSectionClaimsResponse(section_claim_table=table)
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"生成论点表失败: {e}")


@router.post(
    "/phd/attach-evidence",
    response_model=AttachEvidenceResponse,
    summary="【PhD Pipeline】阶段 2: 为论点附加 RAG 证据",
)
async def attach_evidence_to_claims(
    payload: AttachEvidenceRequest,
    service: SectionReviewPipelineService = Depends(get_section_review_pipeline_service),
):
    """
    接收一个“论点-证据”表，并为其中的每一条论点执行 RAG 检索，
    将找到的文献 ID 和片段附加到表中。
    这是 PhD 级综述管线的第二步。
    """
    try:
        updated_table = await service.attach_evidence_for_claims(
            table=payload.section_claim_table,
            top_k=payload.top_k,
        )
        return AttachEvidenceResponse(section_claim_table=updated_table)
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"附加证据失败: {e}")


@router.post(
    "/phd/render-section",
    response_model=RenderSectionFromClaimsResponse,
    summary="【PhD Pipeline】阶段 3: 从论点表渲染章节正文",
)
async def render_section_from_table(
    payload: RenderSectionFromClaimsRequest,
    service: SectionReviewPipelineService = Depends(get_section_review_pipeline_service),
):
    """
    接收一个已附加证据的“论点-证据”表，调用 LLM 将其渲染成
    一段连贯的、带引用标记的学术段落。
    这是 PhD 级综述管线的最后一步。
    """
    try:
        rendered_section = await service.render_section_from_claims(
            table=payload.section_claim_table,
            language=payload.language,
            citation_start_index=payload.citation_start_index,
            review_id=payload.review_id,
        )
        return RenderSectionFromClaimsResponse(
            section_id=payload.section_claim_table.section_id,
            rendered_section=rendered_section,
        )
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"渲染章节失败: {e}")


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


@router.post(
    "/{review_id}/export",
    response_model=ReviewFullExport,
    summary="导出综述（Markdown/Docx/PDF），同时返回关联文献信息",
)
def export_review(
    review_id: int,
    payload: ReviewExport,
    db: Session = Depends(get_db),
) -> ReviewFullExport:
    """
    通用导出接口（当前主要用于 Markdown 导出）：

    - 输入：ReviewExport（format, include_references）
    - 行为：
      * 读取 Review 及其关联的 Paper 列表
      * 选择导出正文 markdown：
        1) 优先使用 review.analysis_json['markdown']
        2) 否则回退到 review.content
        3) 都没有时返回 400
      * 可选返回关联文献精简信息
    - 输出：ReviewFullExport
    """
    from app.models import ReviewPaper, Paper  # 延迟导入避免循环

    logger = logging.getLogger(__name__)
    t0 = time.time()

    review = db.query(Review).filter(Review.id == review_id).first()
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")

    # 选择 markdown 内容
    markdown = None

    analysis_json = getattr(review, "analysis_json", None)
    if isinstance(analysis_json, dict):
        markdown = analysis_json.get("markdown") or analysis_json.get("content_markdown")

    if not markdown:
        # 回退到 content
        content = getattr(review, "content", None)
        if content:
            markdown = str(content)

    if not markdown:
        # Fallback to framework if available
        framework = getattr(review, "framework", None)
        if framework:
            markdown = str(framework)

    if not markdown:
        raise HTTPException(status_code=400, detail="No markdown or content available for this review")

    # 读取关联文献
    paper_infos: List[ReviewPaperInfo] = []
    paper_count = 0

    if payload.include_references:
        rps = (
            db.query(ReviewPaper)
            .filter(ReviewPaper.review_id == review_id)
            .order_by(ReviewPaper.order_index.asc(), ReviewPaper.id.asc())
            .all()
        )
        paper_ids = [rp.paper_id for rp in rps]

        if paper_ids:
            papers = db.query(Paper).filter(Paper.id.in_(paper_ids)).all()
            for p in papers:
                authors = None
                if getattr(p, "authors", None):
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
            paper_count = len(paper_infos)

    elapsed = time.time() - t0
    logger.info(
        "Review export completed",
        extra={
            "review_id": review_id,
            "paper_count": paper_count,
            "format": payload.format,
            "elapsed_sec": round(elapsed, 3),
        },
    )

    return ReviewFullExport(
        review=ReviewResponse.model_validate(review),
        papers=paper_infos,
        markdown=markdown,
        analysis=analysis_json if isinstance(analysis_json, dict) else None,
    )


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
            status=ReviewStatus.FAILED,
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

