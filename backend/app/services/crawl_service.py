from datetime import datetime
from typing import Any, Tuple, Optional, List, cast

from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import CrawlJob, Paper
from app.schemas import CrawlJobCreate, LatestJobStatusResponse
from app.services.crawler import search_across_sources
from app.services.crawler.multi_source_orchestrator import MultiSourceOrchestrator
from app.services.crawler.source_models import SourcePaper
from app.services.crawler.query_parser import parse_boolean_query
from app.services.paper_ingest import (
    insert_or_update_staging_from_sources,
    paper_to_source_paper,
)

settings = get_settings()
orchestrator = MultiSourceOrchestrator()


def create_crawl_job(db: Session, payload: CrawlJobCreate) -> CrawlJob:
    """
    创建抓取任务，只记录参数，不立即抓完所有数据。
    同时记录 PRISMA 搜索策略元数据，用于 Scoping Review 的可复现性。
    """
    # 构建搜索策略元数据（PRISMA 附属功能）
    search_strategy = {
        "query_keywords": payload.keywords,
        "sources": payload.sources,
        "year_range": {
            "from": payload.year_from,
            "to": payload.year_to,
        },
        "max_results": payload.max_results,
        "exhaustive": payload.exhaustive,
        "boolean_syntax": " ".join(payload.keywords) if payload.keywords else "",
        "timestamp": datetime.utcnow().isoformat(),
    }

    job = CrawlJob(
        keywords=payload.keywords,
        sources=payload.sources,
        year_from=payload.year_from,
        year_to=payload.year_to,
        max_results=payload.max_results,
        page_size=payload.page_size,
        exhaustive=payload.exhaustive,
        search_strategy=search_strategy,
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
    3. 调用 search_across_sources / MultiSourceOrchestrator 获取一批文献
       （当前不做严格 offset，仅做分批 limit）
    4. 将所有来源的结果统一转换为 SourcePaper，并写入 StagingPaper 暂存库
       （insert_or_update_staging_from_sources），得到本轮新增暂存记录数 new_count
    5. 更新 job.current_page / job.fetched_count / job.status / job.log / job.updated_at
    6. 返回 (job, new_count)
    """
    job = db.query(CrawlJob).filter(CrawlJob.id == job_id).first()
    if job is None:
        raise ValueError(f"CrawlJob {job_id} 不存在")

    if job.status in ("completed", "failed"):
        # 已经终止的任务，不再执行抓取
        return job, 0

    if job.status == "paused":
        # 暂停状态下不执行抓取，直接返回
        return job, 0

    # 标记为 running
    job.status = "running"
    job.updated_at = datetime.utcnow()
    db.commit()

    # ━━━ 穷尽检索模式判定 ━━━
    is_exhaustive = bool(getattr(job, "exhaustive", False))

    # 计算剩余数量（穷尽模式下跳过 max_results 上限检查）
    max_results = job.max_results or 0
    fetched_count = job.fetched_count or 0

    if not is_exhaustive:
        remaining = max(max_results - fetched_count, 0)
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
        limit_this_round = min(job.page_size or 50, remaining)
    else:
        # 穷尽模式：每轮固定抓 page_size，不设上限
        limit_this_round = job.page_size or 200

    # 调用多源搜索（旧管线 + 新管线），目前不做严格分页，仅按 limit 分批
    try:
        # 显式转换为 Python 类型以避免 Pylance 错误
        keywords: List[str] = job.keywords or []
        sources_all: List[str] = job.sources or []

        # ━━━ 布尔查询解析 ━━━
        # 将关键词列表拼接为一个查询字符串，然后通过 QueryParser 解析布尔表达式
        # 例如 ["TOD OR transit oriented development AND qingdao"]
        #   → 子查询: ["TOD qingdao", "transit oriented development qingdao"]
        raw_query = " ".join(kw.strip() for kw in keywords if kw and kw.strip())
        sub_queries = parse_boolean_query(raw_query) if raw_query else [raw_query or ""]

        if len(sub_queries) > 1:
            job.append_log({
                "ts": datetime.utcnow().isoformat(),
                "level": "info",
                "msg": f"布尔查询解析: 拆分为 {len(sub_queries)} 个子查询",
                "sub_queries": sub_queries,
            })

        # 将原有 sources 分为两类：
        # - legacy_sources: 仍然走旧的 search_across_sources (arxiv / crossref)
        # - multi_sources: 走新的 MultiSourceOrchestrator + paper_ingest 管线
        normalized_sources = [s.strip().lower() for s in (sources_all or []) if s and s.strip()]
        if not normalized_sources:
            # 兼容旧逻辑：未显式指定时默认只用 semantic_scholar 和 crossref
            legacy_sources = ["semantic_scholar", "crossref"]
            multi_sources: List[str] = []
        else:
            legacy_supported = {"arxiv"}
            multi_supported = {"scholar_serpapi", "scopus", "openalex", "crossref", "semantic_scholar"}
            legacy_sources = [s for s in normalized_sources if s in legacy_supported]
            multi_sources = [s for s in normalized_sources if s in multi_supported]

        total_new_count = 0
        all_source_papers: List[SourcePaper] = []

        # ━━━ 对每个子查询分别搜索，合并结果 ━━━
        if is_exhaustive:
            # 穷尽模式下，每个子查询传 max_results=0 让爬虫自行耗尽
            per_query_limit = 0
        else:
            per_query_limit = max(limit_this_round // len(sub_queries), 10) if sub_queries else limit_this_round

        for sq_idx, sub_query in enumerate(sub_queries):
            sq_keywords = [sub_query]  # 将子查询作为单个关键词传入

            # 1) 旧管线：使用 search_across_sources 返回 Paper，再转换为 SourcePaper
            if legacy_sources:
                legacy_papers: List[Paper] = search_across_sources(
                    keywords=sq_keywords,
                    sources=legacy_sources,
                    limit=per_query_limit,
                    year_from=job.year_from,
                    year_to=job.year_to,
                )
                for p in legacy_papers:
                    sp = paper_to_source_paper(p)
                    all_source_papers.append(sp)

            # 2) 新多源管线：返回 SourcePaper 的爬虫（SerpAPI / Scopus）
            if multi_sources:
                multi_results = orchestrator.search_all(
                    query=sub_query,
                    sources=multi_sources,
                    max_results_per_source=per_query_limit,
                )
                for _, items in multi_results.items():
                    all_source_papers.extend(items)

        if all_source_papers:
            # 将多源抓取结果统一写入 StagingPaper 暂存库，由后续审核/提升流程决定是否进入正式库
            _, new_from_sources = insert_or_update_staging_from_sources(
                db, all_source_papers, crawl_job_id=job.id
            )
            total_new_count += new_from_sources

        # 记录本轮实际从 API 获取到的论文总数（含重复项），用于判断是否已穷尽可用结果
        total_source_count = len(all_source_papers)

    except Exception as e:
        job.status = "failed"
        job.failed_count = (job.failed_count or 0) + 1
        job.append_log({
            "ts": datetime.utcnow().isoformat(),
            "level": "error",
            "msg": f"多源抓取管线执行失败: {e}",
        })
        db.commit()
        db.refresh(job)
        raise

    # 本轮新增数量（包含旧管线与新管线）
    new_count = total_new_count

    # 进度使用实际从 API 获取的论文数（而非去重后的新增数），避免反复获取相同论文而进度停滞
    fetched_increment = max(total_source_count, new_count)
    job.fetched_count = (job.fetched_count or 0) + fetched_increment
    job.current_page = (job.current_page or 0) + 1
    job.updated_at = datetime.utcnow()
    job.append_log({
        "ts": datetime.utcnow().isoformat(),
        "level": "info",
        "msg": "run_once 完成",
        "new_papers": new_count,
        "source_papers": total_source_count,
        "fetched_count": job.fetched_count,
        "current_page": job.current_page,
    })
    
    # 判断是否完成
    if not is_exhaustive and (job.fetched_count or 0) >= (job.max_results or 0):
        job.status = "completed"
    elif total_source_count == 0:
        # API 未返回任何结果，说明已穷尽可用论文
        job.status = "completed"
        job.append_log({
            "ts": datetime.utcnow().isoformat(),
            "level": "info",
            "msg": "数据源未返回更多结果，任务自动标记为 completed",
        })
    else:
        job.status = "pending"

    db.commit()
    db.refresh(job)
    return job, new_count


def get_latest_crawl_job_status(db: Session) -> Optional[LatestJobStatusResponse]:
    """
    获取最新的处于非终止状态（或最近完成/失败）的 CrawlJob 状态。
    """
    # 查找最近更新的 job
    job = (
        db.query(CrawlJob)
        .order_by(CrawlJob.updated_at.desc())
        .first()
    )

    if not job:
        return None

    # 对于已经结束很久的任务（completed / failed），不再返回状态，避免前端反复弹出提示
    now = datetime.utcnow()
    if job.updated_at is not None and job.status in ("completed", "failed"):
        try:
            # 使用 10 秒作为“最近完成”的阈值
            delta = now - job.updated_at
            if delta.total_seconds() > 10:
                return None
        except TypeError:
            # 极端情况下 updated_at 不是 datetime，忽略时间判断
            pass

    # 显式获取属性值并处理类型以避免 Pylance 错误
    max_results = job.max_results or 0
    fetched_count = job.fetched_count or 0
    status = job.status
    keywords: List[str] = job.keywords or []

    # 计算进度百分比
    progress_percent: Optional[float] = None
    if max_results > 0:
        progress_percent = (fetched_count / max_results) * 100

    # 确定任务消息
    keywords_preview = ', '.join(keywords[:2]) if keywords else '无关键词'

    if status == "running":
        message = f"正在抓取关键词: {keywords_preview}..."
    elif status == "pending":
        message = f"任务等待中：{keywords_preview}..."
    elif status == "completed":
        message = f"任务完成！共抓取 {fetched_count} 篇文献。"
    elif status == "failed":
        message = f"任务失败。请检查日志。"
    else:
        message = f"任务状态: {status}"

    return LatestJobStatusResponse(
        job_id=job.id,
        type='crawl',
        status=status,
        message=message,
        progress_percent=progress_percent,
    )


def list_crawl_jobs(
    db: Session,
    status: Optional[str] = None,
    skip: int = 0,
    limit: int = 20,
) -> Tuple[List[CrawlJob], int]:
    """
    按条件分页返回 CrawlJob 列表，用于前端任务列表页。
    """
    query = db.query(CrawlJob)
    if status:
        query = query.filter(CrawlJob.status == status)

    total = query.count()
    jobs = (
        query.order_by(CrawlJob.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    return jobs, total


def pause_crawl_job(db: Session, job_id: int) -> CrawlJob:
    """
    将指定 CrawlJob 标记为 paused。

    - 仅当状态为 pending/running 时才会真正更新为 paused
    - 其它状态下调用将直接返回当前任务
    """
    job = db.query(CrawlJob).filter(CrawlJob.id == job_id).first()
    if job is None:
        raise ValueError(f"CrawlJob {job_id} 不存在")

    if job.status not in ("pending", "running"):
        return job

    job.status = "paused"
    job.updated_at = datetime.utcnow()
    job.append_log(
        {
            "ts": datetime.utcnow().isoformat(),
            "level": "info",
            "msg": "任务已被标记为 paused",
        }
    )

    db.commit()
    db.refresh(job)
    return job


def resume_crawl_job(db: Session, job_id: int) -> CrawlJob:
    """
    将处于 paused 状态的 CrawlJob 恢复为 pending。
    """
    job = db.query(CrawlJob).filter(CrawlJob.id == job_id).first()
    if job is None:
        raise ValueError(f"CrawlJob {job_id} 不存在")

    if job.status != "paused":
        return job

    job.status = "pending"
    job.updated_at = datetime.utcnow()
    job.append_log(
        {
            "ts": datetime.utcnow().isoformat(),
            "level": "info",
            "msg": "任务已从 paused 恢复为 pending，等待下一次 run_once",
        }
    )

    db.commit()
    db.refresh(job)
    return job


def retry_crawl_job(db: Session, job_id: int) -> CrawlJob:
    """
    重新尝试执行 CrawlJob，将其状态重置为 pending，并清零统计计数。

    注意：不会删除已入库的文献，只是重置任务自身的进度统计。
    """
    job = db.query(CrawlJob).filter(CrawlJob.id == job_id).first()
    if job is None:
        raise ValueError(f"CrawlJob {job_id} 不存在")

    job.current_page = 0
    job.fetched_count = 0
    job.failed_count = 0
    job.status = "pending"
    job.updated_at = datetime.utcnow()
    job.append_log(
        {
            "ts": datetime.utcnow().isoformat(),
            "level": "info",
            "msg": "任务已被 retry，进度统计已重置为 0",
        }
    )

    db.commit()
    db.refresh(job)
    return job