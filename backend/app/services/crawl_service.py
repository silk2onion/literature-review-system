from datetime import datetime
from typing import Tuple

from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import CrawlJob, Paper
from app.schemas import CrawlJobCreate
from app.services.crawler import search_across_sources

settings = get_settings()


def create_crawl_job(db: Session, payload: CrawlJobCreate) -> CrawlJob:
    """
    创建抓取任务，只记录参数，不立即抓完所有数据。
    """
    job = CrawlJob(
        keywords=payload.keywords,
        sources=payload.sources,
        year_from=payload.year_from,
        year_to=payload.year_to,
        max_results=payload.max_results,
        page_size=payload.page_size,
        status="pending",
        current_page=0,
        fetched_count=0,
        failed_count=0,
        log={"entries": []},
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


def _sync_papers_into_db(db: Session, papers) -> int:
    """
    将多源返回的 Paper 列表同步入库，参考 /api/papers/search 中的去重逻辑。

    返回本次新增入库的文献数。
    """
    new_count = 0

    for p in papers:
        existing = None

        # 优先按 DOI 匹配
        doi = getattr(p, "doi", None)
        if doi:
            existing = db.query(Paper).filter(Paper.doi == doi).first()

        # 退化到 arxiv_id 匹配（兼容旧逻辑）
        if existing is None:
            arxiv_id = getattr(p, "arxiv_id", None)
            if arxiv_id:
                existing = db.query(Paper).filter(Paper.arxiv_id == arxiv_id).first()

        if existing is None:
            db.add(p)
            new_count += 1

    return new_count


def run_crawl_job_once(db: Session, job_id: int) -> Tuple[CrawlJob, int]:
    """
    执行一次抓取任务的“步进”。

    步骤：
    1. 读取并校验 CrawlJob：
       - 若不存在 → ValueError
       - 若状态为 completed/failed → 不再抓取，返回 (job, 0)
    2. 计算本轮要抓的数量：min(page_size, max_results - fetched_count)
       - 若 remaining <= 0 → 标记 completed，返回 (job, 0)
    3. 调用 search_across_sources 获取一批文献（当前不做严格 offset，仅做分批 limit）
    4. 将结果通过 _sync_papers_into_db 去重入库，得到 new_count
    5. 更新 job.current_page / job.fetched_count / job.status / job.log / job.updated_at
    6. 返回 (job, new_count)
    """
    job = db.query(CrawlJob).filter(CrawlJob.id == job_id).first()
    if job is None:
        raise ValueError(f"CrawlJob {job_id} 不存在")

    if job.status in ("completed", "failed"):
        # 已经终止的任务，不再执行抓取
        return job, 0

    # 标记为 running
    job.status = "running"
    job.updated_at = datetime.utcnow()
    db.commit()

    # 计算剩余数量
    remaining = max(job.max_results - job.fetched_count, 0)
    if remaining <= 0:
        job.status = "completed"
        job.append_log({
            "ts": datetime.utcnow().isoformat(),
            "level": "info",
            "msg": "已达到 max_results，任务标记为 completed",
        })
        db.commit()
        db.refresh(job)
        return job, 0

    limit_this_round = min(job.page_size, remaining)

    # 调用多源搜索（目前不做严格分页，仅按 limit 分批）
    try:
        papers = search_across_sources(
            keywords=job.keywords,
            sources=job.sources,
            limit=limit_this_round,
            year_from=job.year_from,
            year_to=job.year_to,
        )
    except Exception as e:
        job.status = "failed"
        job.failed_count += 1
        job.append_log({
            "ts": datetime.utcnow().isoformat(),
            "level": "error",
            "msg": f"search_across_sources 调用失败: {e}",
        })
        db.commit()
        db.refresh(job)
        raise

    # 入库去重
    new_count = _sync_papers_into_db(db, papers)

    job.fetched_count += new_count
    job.current_page += 1
    job.updated_at = datetime.utcnow()
    job.append_log({
        "ts": datetime.utcnow().isoformat(),
        "level": "info",
        "msg": "run_once 完成",
        "new_papers": new_count,
        "fetched_count": job.fetched_count,
        "current_page": job.current_page,
    })

    # 判断是否完成
    if job.fetched_count >= job.max_results:
        job.status = "completed"
    else:
        job.status = "pending"

    db.commit()
    db.refresh(job)
    return job, new_count