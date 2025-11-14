"""
Crawl Job API 路由

- POST /api/crawl/jobs           创建抓取任务
- POST /api/crawl/jobs/{id}/run_once  执行任务的一步
- GET  /api/crawl/jobs/{id}      查询任务进度
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import CrawlJob
from app.schemas import (
    CrawlJobCreate,
    CrawlJobResponse,
    CrawlJobRunOnceResponse,
)
from app.services.crawl_service import (
    create_crawl_job,
    run_crawl_job_once,
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


@router.get("/jobs/{job_id}", response_model=CrawlJobResponse)
def get_job(
    job_id: int,
    db: Session = Depends(get_db),
) -> CrawlJobResponse:
    """
    查询任务进度：抓取篇数、失败条数、当前状态、参与的数据源。
    """
    job = db.query(CrawlJob).filter(CrawlJob.id == job_id).first()
    if job is None:
        raise HTTPException(status_code=404, detail="抓取任务不存在")
    return CrawlJobResponse.model_validate(job)