"""
爬虫服务模块

Legacy pipeline（search_across_sources）仅保留 ArxivCrawler。
CrossRef / SemanticScholar / Scopus / OpenAlex / ScholarSerpAPI
已迁移至 MultiSourceOrchestrator 新管线（BaseCrawler + SourcePaper）。
"""
from typing import List, Optional, Dict, Tuple
import logging

from app.config import settings
from app.models.paper import Paper
from app.services.crawler.arxiv_crawler import ArxivCrawler


# 数据源优先级配置：数值越小优先级越高
SOURCE_PRIORITY: Dict[str, int] = {
    "scopus": 1,
    "web_of_science": 2,
    "crossref": 3,
    "semantic_scholar": 3,
    "google_scholar": 4,
    "pubmed": 5,
    "arxiv": 10,  # 预印本，优先级较低
    "unknown": 100,
}


def _get_source_priority(source: Optional[str]) -> int:
    """获取数据源优先级"""
    if not source:
        return SOURCE_PRIORITY["unknown"]
    return SOURCE_PRIORITY.get(source.lower(), SOURCE_PRIORITY["unknown"])

logger = logging.getLogger(__name__)


def search_across_sources(
    keywords: List[str],
    sources: List[str],
    limit: int,
    year_from: Optional[int] = None,
    year_to: Optional[int] = None,
) -> List[Paper]:
    """
    Legacy pipeline — 仅支持 ArxivCrawler。

    CrossRef / SemanticScholar 等已迁移至 MultiSourceOrchestrator，
    通过 crawl_service.py 路由调用。
    """
    normalized_sources = [s.lower() for s in (sources or ["arxiv"])]
    crawlers = []

    if "arxiv" in normalized_sources:
        crawlers.append(ArxivCrawler(settings=settings))

    # CrossRef / SemanticScholar 已迁移至新管线，此处不再初始化
    unsupported = [s for s in normalized_sources if s not in ("arxiv",)]
    if unsupported:
        logger.info(
            "search_across_sources: 源 %s 已迁移至 MultiSourceOrchestrator，跳过",
            unsupported,
        )

    if not crawlers:
        logger.warning("search_across_sources: 未指定合法的 legacy 数据源 %s", sources)
        return []

    raw_results: List[Paper] = []
    for crawler in crawlers:
        try:
            part = crawler.search(
                keywords=keywords,
                max_results=limit,
                year_from=year_from,
                year_to=year_to,
            )
            raw_results.extend(part)
        except Exception as e:
            logger.error("Crawler %s 调用失败: %s", type(crawler).__name__, e)
            raise

    # 轻量去重 + 主版本选择
    buckets: Dict[Tuple[str, str], List[Paper]] = {}
    for p in raw_results:
        doi = getattr(p, "doi", None)
        title = str(getattr(p, "title", "") or "").strip().lower()
        year = getattr(p, "year", None)

        if doi:
            key: Tuple[str, str] = ("doi", str(doi).lower())
        else:
            key = ("title_year", f"{title}_{year}")

        buckets.setdefault(key, []).append(p)

    deduped: List[Paper] = []
    for key, candidates in buckets.items():
        if not candidates:
            continue
        candidates_sorted = sorted(
            candidates,
            key=lambda p: _get_source_priority(getattr(p, "source", None)),
        )
        deduped.append(candidates_sorted[0])

    if len(deduped) > limit:
        return deduped[:limit]
    return deduped

__all__ = ["ArxivCrawler", "search_across_sources"]