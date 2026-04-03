"""
StagingPaper 暂存文献 API 路由
"""
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_, func

from app.database import get_db
from app.models.staging_paper import StagingPaper
from app.models.crawl_job import CrawlJob
from app.schemas.staging_paper import (
    StagingPaperResponse,
    StagingPaperSearch,
    StagingPaperSearchResponse,
    StagingPaperPromoteRequest,
    ScreeningUpdateRequest,
    BatchScreeningRequest,
    PrismaStageCount,
    PrismaStatsResponse,
    AIScreenRequest,
    AIScreenResultItem,
    AIScreenResponse,
)
from pydantic import BaseModel
from app.schemas.paper import PaperResponse
from app.services.paper_service import promote_staging_papers as promote_staging_papers_service
from app.services.prisma_state_machine import (
    PRISMA_STAGES,
    EXCLUSION_REASON_TEMPLATES,
    validate_transition,
)

router = APIRouter(prefix="/api/staging-papers", tags=["staging_papers"])


@router.post("/search", response_model=StagingPaperSearchResponse)
def search_staging_papers(
    payload: StagingPaperSearch,
    db: Session = Depends(get_db),
) -> StagingPaperSearchResponse:
    """
    暂存文献库检索

    支持：
    - 关键词模糊搜索：title / abstract
    - 状态过滤：status
    - 来源过滤：source
    - 抓取任务过滤：crawl_job_id
    - 年份区间过滤：year_from / year_to
    - 分页：page / page_size
    """
    query = db.query(StagingPaper)

    # 关键词模糊匹配
    if payload.q:
        like_pattern = f"%{payload.q.strip()}%"
        query = query.filter(
            or_(
                StagingPaper.title.ilike(like_pattern),
                StagingPaper.abstract.ilike(like_pattern),
            )
        )

    # 状态过滤
    if payload.status:
        query = query.filter(StagingPaper.status == payload.status)

    # PRISMA 筛选阶段过滤
    if payload.screening_stage:
        query = query.filter(StagingPaper.screening_stage == payload.screening_stage)

    # 来源过滤
    if payload.source:
        query = query.filter(StagingPaper.source == payload.source)

    # 抓取任务过滤
    if payload.crawl_job_id is not None:
        query = query.filter(StagingPaper.crawl_job_id == payload.crawl_job_id)

    # 年份过滤
    if payload.year_from is not None:
        query = query.filter(StagingPaper.year >= payload.year_from)
    if payload.year_to is not None:
        query = query.filter(StagingPaper.year <= payload.year_to)

    total = query.count()

    page = payload.page
    page_size = payload.page_size
    offset = (page - 1) * page_size

    records: List[StagingPaper] = (
        query.order_by(
            StagingPaper.year.desc().nullslast(),
            StagingPaper.id.desc(),
        )
        .offset(offset)
        .limit(page_size)
        .all()
    )

    items = [StagingPaperResponse.model_validate(p) for p in records]

    return StagingPaperSearchResponse(
        success=True,
        total=total,
        items=items,
        message=f"暂存文献库检索成功，当前页 {page}，共 {total} 条记录",
    )


@router.post("/promote", response_model=List[PaperResponse])
async def promote_staging_papers_endpoint(
    payload: StagingPaperPromoteRequest,
    db: Session = Depends(get_db),
) -> List[PaperResponse]:
    """
    将一批暂存文献提升为正式文献。

    - 根据传入的 StagingPaper ID 列表查询暂存库
    - 调用服务层进行去重合并与 embedding 生成
    - 返回对应的正式库 Paper 列表
    """
    records: List[StagingPaper] = (
        db.query(StagingPaper)
        .filter(StagingPaper.id.in_(payload.ids))
        .all()
    )
    if not records:
        raise HTTPException(status_code=404, detail="未找到要提升的暂存文献")

    papers = await promote_staging_papers_service(db, records)
    return [PaperResponse.model_validate(p) for p in papers]


class StagingPaperIdsRequest(BaseModel):
    """通用 ID 列表请求"""
    ids: List[int]
    exclusion_reason: Optional[str] = None


@router.post("/reject")
def reject_staging_papers(
    payload: StagingPaperIdsRequest,
    db: Session = Depends(get_db),
):
    """
    将指定暂存文献标记为 rejected（软删除）。
    可选传入 exclusion_reason 作为 PRISMA 排除原因。
    """
    update_values: Dict[str, Optional[str]] = {"status": "rejected"}
    if payload.exclusion_reason and payload.exclusion_reason.strip():
        update_values["exclusion_reason"] = payload.exclusion_reason.strip()

    count = (
        db.query(StagingPaper)
        .filter(StagingPaper.id.in_(payload.ids))
        .update(update_values, synchronize_session="fetch")
    )
    db.commit()
    return {"success": True, "rejected_count": count}


@router.post("/delete")
def delete_staging_papers(
    payload: StagingPaperIdsRequest,
    db: Session = Depends(get_db),
):
    """
    永久删除指定暂存文献记录
    """
    count = (
        db.query(StagingPaper)
        .filter(StagingPaper.id.in_(payload.ids))
        .delete(synchronize_session="fetch")
    )
    db.commit()
    return {"success": True, "deleted_count": count}


# ========== PRISMA 筛选附属功能端点 ==========

VALID_SCREENING_STAGES = set(PRISMA_STAGES)


@router.get("/exclusion-templates")
def get_exclusion_templates():
    """返回预定义的 PRISMA 排除原因模板列表。"""
    return {"success": True, "templates": EXCLUSION_REASON_TEMPLATES}


@router.patch("/{staging_paper_id}/screening")
def update_screening_stage(
    staging_paper_id: int,
    payload: ScreeningUpdateRequest,
    db: Session = Depends(get_db),
):
    """
    更新单条暂存文献的 PRISMA 筛选阶段。
    与 status（pending/accepted/rejected）完全独立，互不影响。
    包含状态机校验：只允许相邻阶段间转换。
    """
    if payload.screening_stage not in VALID_SCREENING_STAGES:
        raise HTTPException(
            status_code=400,
            detail=f"无效的筛选阶段: {payload.screening_stage}，"
                   f"允许值: {', '.join(sorted(VALID_SCREENING_STAGES))}",
        )

    paper = db.query(StagingPaper).filter(StagingPaper.id == staging_paper_id).first()
    if not paper:
        raise HTTPException(status_code=404, detail="暂存文献不存在")

    # 状态机校验
    valid, err = validate_transition(paper.screening_stage or "identification", payload.screening_stage)
    if not valid:
        raise HTTPException(status_code=400, detail=err)

    paper.screening_stage = payload.screening_stage
    paper.exclusion_reason = payload.exclusion_reason
    db.commit()
    db.refresh(paper)

    return {
        "success": True,
        "id": paper.id,
        "screening_stage": paper.screening_stage,
        "exclusion_reason": paper.exclusion_reason,
    }


@router.post("/batch-screening")
def batch_update_screening(
    payload: BatchScreeningRequest,
    db: Session = Depends(get_db),
):
    """
    批量更新 PRISMA 筛选阶段。
    包含状态机校验：合法的更新，非法的跳过并汇报。
    """
    if payload.screening_stage not in VALID_SCREENING_STAGES:
        raise HTTPException(
            status_code=400,
            detail=f"无效的筛选阶段: {payload.screening_stage}，"
                   f"允许值: {', '.join(sorted(VALID_SCREENING_STAGES))}",
        )

    papers = db.query(StagingPaper).filter(StagingPaper.id.in_(payload.ids)).all()

    updated_count = 0
    skipped_ids = []

    for paper in papers:
        current = paper.screening_stage or "identification"
        valid, _ = validate_transition(current, payload.screening_stage)
        if not valid:
            skipped_ids.append(paper.id)
            continue
        paper.screening_stage = payload.screening_stage
        if payload.exclusion_reason is not None:
            paper.exclusion_reason = payload.exclusion_reason
        updated_count += 1

    db.commit()

    return {
        "success": True,
        "updated_count": updated_count,
        "skipped_count": len(skipped_ids),
        "skipped_ids": skipped_ids,
        "screening_stage": payload.screening_stage,
    }


@router.get("/prisma-stats", response_model=PrismaStatsResponse)
def get_prisma_stats(
    crawl_job_id: Optional[int] = Query(default=None, description="按抓取任务 ID 过滤"),
    db: Session = Depends(get_db),
) -> PrismaStatsResponse:
    """
    获取 PRISMA 流程统计：每个阶段的文献数量 + 排除原因分布。
    可选按 crawl_job_id 过滤，用于查看单次搜索策略的筛选情况。
    """
    base_query = db.query(StagingPaper)
    if crawl_job_id is not None:
        base_query = base_query.filter(StagingPaper.crawl_job_id == crawl_job_id)

    total = base_query.count()

    # 每阶段计数
    stage_counts = (
        base_query
        .with_entities(
            StagingPaper.screening_stage,
            func.count(StagingPaper.id),
        )
        .group_by(StagingPaper.screening_stage)
        .all()
    )

    # 每阶段中被排除的计数（有 exclusion_reason 的）
    excluded_counts = (
        base_query
        .filter(StagingPaper.exclusion_reason.isnot(None))
        .filter(StagingPaper.exclusion_reason != "")
        .with_entities(
            StagingPaper.screening_stage,
            func.count(StagingPaper.id),
        )
        .group_by(StagingPaper.screening_stage)
        .all()
    )
    excluded_map = {stage: cnt for stage, cnt in excluded_counts}

    # 构建阶段统计列表（保证四个阶段都出现）
    stage_count_map = {stage: cnt for stage, cnt in stage_counts}
    stages: List[PrismaStageCount] = []
    for stage_name in ["identification", "screening", "eligibility", "included"]:
        stages.append(PrismaStageCount(
            stage=stage_name,
            count=stage_count_map.get(stage_name, 0),
            excluded_count=excluded_map.get(stage_name, 0),
        ))

    # 排除原因分布
    reason_counts = (
        base_query
        .filter(StagingPaper.exclusion_reason.isnot(None))
        .filter(StagingPaper.exclusion_reason != "")
        .with_entities(
            StagingPaper.exclusion_reason,
            func.count(StagingPaper.id),
        )
        .group_by(StagingPaper.exclusion_reason)
        .all()
    )
    exclusion_reasons: Dict[str, int] = {reason: cnt for reason, cnt in reason_counts}

    # 获取关联的搜索策略
    search_strategy = None
    if crawl_job_id is not None:
        crawl_job = db.query(CrawlJob).filter(CrawlJob.id == crawl_job_id).first()
        if crawl_job and hasattr(crawl_job, "search_strategy"):
            search_strategy = crawl_job.search_strategy

    return PrismaStatsResponse(
        success=True,
        crawl_job_id=crawl_job_id,
        total=total,
        stages=stages,
        exclusion_reasons=exclusion_reasons,
        search_strategy=search_strategy,
    )


# ========== AI 筛选端点 ==========

@router.post("/ai-screen", response_model=AIScreenResponse)
async def ai_screen_staging_papers(
    payload: AIScreenRequest,
    db: Session = Depends(get_db),
) -> AIScreenResponse:
    """
    AI 批量筛选暂存文献。

    对 pending 状态的暂存文献调用 LLM 进行相关度打分（0-10），
    根据分数自动分为三档：
    - >= 7: promote（推荐入库，screening_stage → screening）
    - 4-6:  pending_review（待人工复核，screening_stage → screening）
    - < 4:  reject（自动拒绝，附带 AI 排除原因）
    """
    from app.services.screening_service import screen_staging_papers

    result = await screen_staging_papers(
        db=db,
        topic=payload.topic,
        paper_ids=payload.ids,
        crawl_job_ids=payload.crawl_job_ids,
        keyword_filter=payload.q,
        auto_apply=True,
    )

    return AIScreenResponse(
        success=True,
        total=result.total,
        scored=result.scored,
        promoted=result.promoted,
        pending_review=result.pending_review,
        rejected=result.rejected,
        pre_filtered=result.pre_filtered,
        failed=result.failed,
        details=[
            AIScreenResultItem(
                staging_paper_id=d.staging_paper_id,
                score=d.score,
                reason=d.reason,
                decision=d.decision,
            )
            for d in result.details
        ],
    )


# ========== 信息补齐端点 ==========

from app.schemas.staging_paper import EnrichRequest, EnrichResultItem, EnrichResponse


@router.post("/enrich", response_model=EnrichResponse)
async def enrich_staging_papers_endpoint(
    payload: EnrichRequest,
    db: Session = Depends(get_db),
) -> EnrichResponse:
    """
    批量补齐暂存文献的 abstract 和其他元数据。

    通过 DOI 从 CrossRef / Semantic Scholar 拉取缺失的 abstract、authors、
    year、journal、pdf_url 等信息。只补齐缺失字段，不覆盖已有值。
    """
    from app.services.enrichment_service import enrich_staging_papers

    result = await enrich_staging_papers(
        db=db,
        paper_ids=payload.ids,
        only_missing_abstract=payload.only_missing_abstract,
    )

    return EnrichResponse(
        success=True,
        total=result.total,
        enriched=result.enriched,
        skipped_no_doi=result.skipped_no_doi,
        failed=result.failed,
        details=[
            EnrichResultItem(
                paper_id=d.paper_id,
                enriched_fields=d.enriched_fields,
                source=d.source,
            )
            for d in result.details
        ],
    )


# ========== 动态路径端点（必须放在所有固定路径之后） ==========

@router.get("/{staging_paper_id}", response_model=StagingPaperResponse)
def get_staging_paper(
    staging_paper_id: int,
    db: Session = Depends(get_db),
) -> StagingPaperResponse:
    """
    获取单条暂存文献详情
    """
    paper = (
        db.query(StagingPaper)
        .filter(StagingPaper.id == staging_paper_id)
        .first()
    )
    if not paper:
        raise HTTPException(status_code=404, detail="暂存文献不存在")

    return StagingPaperResponse.model_validate(paper)