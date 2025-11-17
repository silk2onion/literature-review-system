"""
Crawl Job API 路由

- POST /api/crawl/jobs           创建抓取任务
- POST /api/crawl/jobs/{id}/run_once  执行任务的一步
- GET  /api/crawl/jobs/{id}      查询任务进度
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import CrawlJob
from app.schemas import (
    CrawlJobCreate,
    CrawlJobResponse,
    CrawlJobRunOnceResponse,
    LatestJobStatusResponse,
    JobStatus,
    CrawlJobListResponse,
)
from app.services.crawl_service import (
    create_crawl_job,
    run_crawl_job_once,
    get_latest_crawl_job_status,
    list_crawl_jobs,
    pause_crawl_job,
    resume_crawl_job,
    retry_crawl_job,
)


router = APIRouter(prefix="/api/crawl", tags=["crawl"])


@router.post("/jobs", response_model=CrawlJobResponse)
def create_job(
    payload: CrawlJobCreate,
    db: Session = Depends(get_db),
) -> CrawlJobResponse:
    """
    创建抓取任务，只记录参数，不立即抓完所有数据。
    """
    job = create_crawl_job(db, payload)
    # 直接用 Pydantic 的 from_attributes 能把 ORM 转成响应模型
    return CrawlJobResponse.model_validate(job)


@router.post("/jobs/{job_id}/run_once", response_model=CrawlJobRunOnceResponse)
def run_job_once(
    job_id: int,
    db: Session = Depends(get_db),
) -> CrawlJobRunOnceResponse:
    """
    执行该任务的一“步”：抓下一批数据。

    - 根据 job.page_size 控制本轮抓取数量
    - 更新 current_page / fetched_count / status / log
    """
    try:
        job, new_count = run_crawl_job_once(db, job_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"run_once 失败: {e}")

    return CrawlJobRunOnceResponse(
        success=True,
        job=CrawlJobResponse.model_validate(job),
        new_papers=new_count,
        total_fetched=job.fetched_count,  # type: ignore[arg-type]
        message="run_once 执行完成",
    )


@router.get("/jobs", response_model=CrawlJobListResponse)
def list_jobs(
    status: Optional[JobStatus] = None,
    skip: int = 0,
    limit: int = 20,
    db: Session = Depends(get_db),
) -> CrawlJobListResponse:
    """
    分页获取抓取任务列表，可按状态过滤。
    """
    jobs, total = list_crawl_jobs(db, status=status, skip=skip, limit=limit)
    return CrawlJobListResponse(
        total=total,
        items=[CrawlJobResponse.model_validate(j) for j in jobs],
    )


@router.get("/jobs/latest_status", response_model=Optional[LatestJobStatusResponse])
def get_latest_job_status(
    db: Session = Depends(get_db),
) -> Optional[LatestJobStatusResponse]:
    """
    获取最近一次抓取任务的全局状态

    用于前端全局任务状态栏轮询:
    - 如果当前有进行中的任务, 返回其进度信息
    - 如果没有任务, 返回 null
    """
    status = get_latest_crawl_job_status(db)
    return status


@router.get("/jobs/{job_id}", response_model=CrawlJobResponse)
def get_job(
    job_id: int,
    db: Session = Depends(get_db),
) -> CrawlJobResponse:
    """
    查询指定任务进度：抓取篇数、失败条数、当前状态、参与的数据源。
    """
    job = db.query(CrawlJob).filter(CrawlJob.id == job_id).first()
    if job is None:
        raise HTTPException(status_code=404, detail="抓取任务不存在")
    return CrawlJobResponse.model_validate(job)


@router.post("/jobs/{job_id}/pause", response_model=CrawlJobResponse)
def pause_job(
    job_id: int,
    db: Session = Depends(get_db),
) -> CrawlJobResponse:
    """
    将指定抓取任务标记为 paused。
    """
    try:
        job = pause_crawl_job(db, job_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return CrawlJobResponse.model_validate(job)


@router.post("/jobs/{job_id}/resume", response_model=CrawlJobResponse)
def resume_job(
    job_id: int,
    db: Session = Depends(get_db),
) -> CrawlJobResponse:
    """
    将处于 paused 状态的抓取任务恢复为 pending。
    """
    try:
        job = resume_crawl_job(db, job_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return CrawlJobResponse.model_validate(job)


@router.post("/jobs/{job_id}/retry", response_model=CrawlJobResponse)
def retry_job(
    job_id: int,
    db: Session = Depends(get_db),
) -> CrawlJobResponse:
    """
    重置抓取任务的进度统计并重新开始（不删除已入库文献）。
    """
    try:
        job = retry_crawl_job(db, job_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return CrawlJobResponse.model_validate(job)