import logging
from datetime import date
from typing import Dict, List, Optional, Tuple

from sqlalchemy.orm import Session

from app.models.paper import Paper
from app.models.staging_paper import StagingPaper
from app.services.crawler.source_models import SourcePaper
from app.services.embedding_service import get_embedding_service

logger = logging.getLogger(__name__)

# 与 crawler.__init__ 中保持一致的来源优先级
SOURCE_PRIORITY: Dict[str, int] = {
    "scopus": 1,
    "web_of_science": 2,
    "crossref": 3,
    "google_scholar": 4,
    "pubmed": 5,
    "arxiv": 10,
    "unknown": 100,
}


def _get_source_priority(source: Optional[str]) -> int:
    if not source:
        return SOURCE_PRIORITY["unknown"]
    return SOURCE_PRIORITY.get(source.lower(), SOURCE_PRIORITY["unknown"])


def _normalize_str(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    value = str(value).strip()
    return value or None


def _normalize_date(d: Optional[date]) -> Optional[date]:
    # 目前保持原样，后续如果需要可以在这里做截断 / 时区处理
    return d


def _source_paper_to_dict(sp: SourcePaper) -> Dict:
    """
    将 SourcePaper 映射为用于创建 Paper 实例的字典（不含 id、created_at 等）
    """
    return {
        "title": sp.title,
        "authors": sp.authors or [],
        "abstract": sp.abstract,
        "publication_date": _normalize_date(sp.published_date),
        "year": sp.year,
        "journal": sp.journal or sp.conference,
        "venue": sp.conference or sp.journal,
        "journal_issn": _normalize_str(sp.issn),
        "journal_impact_factor": sp.journal_impact_factor,
        "journal_quartile": _normalize_str(sp.journal_quartile),
        "indexing": sp.indexing or [],
        "doi": _normalize_str(sp.doi),
        "arxiv_id": _normalize_str(sp.arxiv_id),
        "pmid": None,
        "url": sp.url,
        "pdf_url": sp.pdf_url,
        "pdf_path": None,
        "source": sp.source,
        "categories": sp.categories or [],
        "keywords": sp.keywords or [],
        "citations_count": 0,
        "embedding": None,
    }


def _source_paper_to_staging_dict(sp: SourcePaper) -> Dict:
    """
    将 SourcePaper 映射为用于创建 StagingPaper 实例的字典（不含 id、created_at 等）
    """
    return {
        "title": sp.title,
        "authors": sp.authors or [],
        "abstract": sp.abstract,
        "publication_date": _normalize_date(sp.published_date),
        "year": sp.year,
        "journal": sp.journal or sp.conference,
        "venue": sp.conference or sp.journal,
        "journal_impact_factor": sp.journal_impact_factor,
        "journal_quartile": _normalize_str(sp.journal_quartile),
        "indexing": sp.indexing or [],
        "doi": _normalize_str(sp.doi),
        "arxiv_id": _normalize_str(sp.arxiv_id),
        "pmid": None,
        "url": sp.url,
        "pdf_url": sp.pdf_url,
        "pdf_path": None,
        "source": sp.source,
        "source_id": sp.source_id,
        "categories": sp.categories or [],
        "keywords": sp.keywords or [],
        "citations_count": 0,
        # 暂存库工作流相关字段默认值
        "crawl_job_id": None,
        "status": "pending",
        "llm_tags": None,
        "llm_score": None,
        "final_paper_id": None,
    }


def paper_to_source_paper(paper: Paper) -> SourcePaper:
    """
    将旧管线中直接返回的 Paper 转换为 SourcePaper，用于统一走暂存库入库流程。
    """
    title = getattr(paper, "title", "") or ""
    abstract = getattr(paper, "abstract", None)
    year = getattr(paper, "year", None)

    # 标识字段
    doi = _normalize_str(getattr(paper, "doi", None))
    arxiv_id = _normalize_str(getattr(paper, "arxiv_id", None))

    # 来源与出版信息
    source = getattr(paper, "source", None) or "unknown"
    journal = getattr(paper, "journal", None)
    conference = getattr(paper, "venue", None)
    
    # 期刊评价指标
    journal_impact_factor = getattr(paper, "journal_impact_factor", None)
    journal_quartile = getattr(paper, "journal_quartile", None)
    indexing = getattr(paper, "indexing", None)
    if indexing and not isinstance(indexing, list):
        indexing = [] # Ensure list

    published_date = _normalize_date(getattr(paper, "publication_date", None))
    url = getattr(paper, "url", None)
    pdf_url = getattr(paper, "pdf_url", None)

    # 作者列表标准化为 List[str]
    authors_raw = getattr(paper, "authors", None)
    if isinstance(authors_raw, list):
        authors: List[str] = [str(a) for a in authors_raw]
    elif isinstance(authors_raw, str):
        authors = [s.strip() for s in authors_raw.split(",") if s.strip()]
    elif authors_raw is None:
        authors = []
    else:
        authors = [str(authors_raw)]

    # 关键词标准化为 List[str]
    keywords_raw = getattr(paper, "keywords", None)
    if isinstance(keywords_raw, list):
        keywords: List[str] = [str(k) for k in keywords_raw]
    elif isinstance(keywords_raw, str):
        keywords = [s.strip() for s in keywords_raw.split(",") if s.strip()]
    elif keywords_raw is None:
        keywords = []
    else:
        keywords = [str(keywords_raw)]

    # 分类标准化为 List[str]
    categories_raw = getattr(paper, "categories", None)
    if isinstance(categories_raw, list):
        categories: List[str] = [str(c) for c in categories_raw]
    elif isinstance(categories_raw, str):
        categories = [s.strip() for s in categories_raw.split(",") if s.strip()]
    elif categories_raw is None:
        categories = []
    else:
        categories = [str(categories_raw)]

    return SourcePaper(
        title=title,
        authors=authors,
        abstract=abstract,
        year=year,
        doi=doi,
        arxiv_id=arxiv_id,
        source=source,
        source_id=None,
        journal=journal,
        conference=conference,
        publisher=None,
        journal_impact_factor=journal_impact_factor,
        journal_quartile=journal_quartile,
        indexing=indexing,
        published_date=published_date,
        url=url,
        pdf_url=pdf_url,
        keywords=keywords,
        categories=categories,
    )


def insert_or_update_papers_from_sources(
    db: Session, source_papers: List[SourcePaper]
) -> Tuple[List[Paper], int]:
    """
    将一批 SourcePaper 入库到 Paper 表，带去重和“主版本”选择逻辑。

    去重 / 合并规则（与 crawler.search_across_sources 保持一致）：
    1. 按“作品 identity” 分桶：
       - 有 DOI 的： key = ("doi", doi.lower())
       - 无 DOI：    key = ("title_year", f"{title.lower()}_{year}")
    2. 桶内如果库里已有 Paper：
       - 直接选库里这条作为主版本（不覆盖，避免破坏已有字段）
       - 可根据需要做轻量字段补全（目前不做，避免引入复杂度）
    3. 桶内只有新抓取的 SourcePaper：
       - 从中按 SOURCE_PRIORITY 选择优先级最高的 source 作为主版本
       - 创建一条新的 Paper 记录

    返回：
        (本次涉及的“主版本 Paper” 列表（包括已有和新建的）, 本次新建的 Paper 数量)
    """
    if not source_papers:
        return [], 0

    # 第一步：按 identity 对 SourcePaper 分桶
    buckets: Dict[Tuple[str, str], List[SourcePaper]] = {}

    for sp in source_papers:
        doi = _normalize_str(sp.doi)
        title = (sp.title or "").strip().lower()
        year_str = str(sp.year) if sp.year is not None else "none"

        if doi:
            key = ("doi", doi.lower())
        else:
            key = ("title_year", f"{title}_{year_str}")

        buckets.setdefault(key, []).append(sp)

    result_papers: List[Paper] = []
    created_count = 0

    # 第二步：对于每个 identity，检查数据库中是否已有对应 Paper
    for key, candidates in buckets.items():
        if not candidates:
            continue

        id_type, id_value = key

        existing: Optional[Paper] = None
        if id_type == "doi":
            existing = (
                db.query(Paper)
                .filter(Paper.doi.isnot(None))
                .filter(Paper.doi.ilike(id_value))
                .first()
            )
        else:
            # title_year 的情况下，用相同 title.lower() + year 尝试匹配
            title, year_str = id_value.rsplit("_", 1)
            try:
                year = int(year_str) if year_str != "none" else None
            except ValueError:
                year = None

            q = db.query(Paper).filter(
                Paper.title.isnot(None),
            )
            if title:
                q = q.filter(Paper.title.ilike(title))
            if year is not None:
                q = q.filter(Paper.year == year)
            existing = q.first()

        if existing:
            # 已有记录，当前策略：优先保留库里数据，不做覆盖，只返回它
            logger.debug(
                "[paper_ingest] identity=%s 已存在 Paper(id=%s, source=%s)",
                key,
                existing.id,
                existing.source,
            )
            result_papers.append(existing)
            continue

        # 第三步：库中没有，需从 candidates 里按来源优先级选择一条主记录
        candidates_sorted = sorted(
            candidates, key=lambda sp: _get_source_priority(sp.source)
        )
        primary_sp = candidates_sorted[0]

        # 创建新的 Paper
        data = _source_paper_to_dict(primary_sp)
        paper = Paper(**data)
        db.add(paper)
        db.flush()  # 提前拿到 id，方便日志和后续使用
        created_count += 1

        logger.info(
            "[paper_ingest] create new Paper(id=%s, source=%s, identity=%s)",
            paper.id,
            paper.source,
            key,
        )
        result_papers.append(paper)
        
    db.commit()
    return result_papers, created_count


def insert_or_update_staging_from_sources(
    db: Session, source_papers: List[SourcePaper], crawl_job_id: Optional[int] = None
) -> Tuple[List[StagingPaper], int]:
    """
    将一批 SourcePaper 入库到 StagingPaper 暂存表，带 identity 级去重。

    说明：
    - 不直接写入正式 Paper 表，满足“任何渠道抓取的文献元数据都不直接入库”的约束
    - 同一 identity（DOI 或 title+year）只保留一条 StagingPaper 作为主版本
    """
    if not source_papers:
        return [], 0

    # 第一步：按 identity 对 SourcePaper 分桶（与 insert_or_update_papers_from_sources 保持一致）
    buckets: Dict[Tuple[str, str], List[SourcePaper]] = {}

    for sp in source_papers:
        doi = _normalize_str(sp.doi)
        title = (sp.title or "").strip().lower()
        year_str = str(sp.year) if sp.year is not None else "none"

        if doi:
            key = ("doi", doi.lower())
        else:
            key = ("title_year", f"{title}_{year_str}")

        buckets.setdefault(key, []).append(sp)

    result_papers: List[StagingPaper] = []
    created_count = 0

    # 第二步：检查暂存表中是否已有对应 identity 的 StagingPaper
    for key, candidates in buckets.items():
        if not candidates:
            continue

        id_type, id_value = key

        existing: Optional[StagingPaper] = None
        if id_type == "doi":
            existing = (
                db.query(StagingPaper)
                .filter(StagingPaper.doi.isnot(None))
                .filter(StagingPaper.doi.ilike(id_value))
                .first()
            )
        else:
            # title_year 的情况下，用相同 title.lower() + year 尝试匹配
            title, year_str = id_value.rsplit("_", 1)
            try:
                year = int(year_str) if year_str != "none" else None
            except ValueError:
                year = None

            q = db.query(StagingPaper).filter(StagingPaper.title.isnot(None))
            if title:
                q = q.filter(StagingPaper.title.ilike(title))
            if year is not None:
                q = q.filter(StagingPaper.year == year)
            existing = q.first()

        if existing:
            logger.debug(
                "[paper_ingest] identity=%s 已存在 StagingPaper(id=%s, source=%s)",
                key,
                existing.id,
                existing.source,
            )
            result_papers.append(existing)
            continue

        # 暂存表中没有该 identity，新建 StagingPaper
        candidates_sorted = sorted(
            candidates, key=lambda sp: _get_source_priority(sp.source)
        )
        primary_sp = candidates_sorted[0]

        data = _source_paper_to_staging_dict(primary_sp)
        if crawl_job_id is not None:
            data["crawl_job_id"] = crawl_job_id

        staging = StagingPaper(**data)
        db.add(staging)
        db.flush()
        created_count += 1

        logger.info(
            "[paper_ingest] create new StagingPaper(id=%s, source=%s, identity=%s)",
            staging.id,
            staging.source,
            key,
        )
        result_papers.append(staging)

    db.commit()
    return result_papers, created_count