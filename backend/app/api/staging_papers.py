"""
StagingPaper 暂存文献 API 路由
"""
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.database import get_db
from app.models.staging_paper import StagingPaper
from app.schemas.staging_paper import (
    StagingPaperResponse,
    StagingPaperSearch,
    StagingPaperSearchResponse,
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