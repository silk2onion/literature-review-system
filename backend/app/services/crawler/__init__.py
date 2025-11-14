"""
爬虫服务模块
"""
from typing import List, Optional, Dict, Tuple
import logging

from app.config import settings
from app.models.paper import Paper
from app.services.crawler.arxiv_crawler import ArxivCrawler
from app.services.crawler.crossref_crawler import CrossRefCrawler


# 数据源优先级配置：数值越小优先级越高
SOURCE_PRIORITY: Dict[str, int] = {
    "scopus": 1,
    "web_of_science": 2,
    "crossref": 3,
    "google_scholar": 4,
    "pubmed": 5,
    "arxiv": 10,  # 预印本，优先级较低
    "unknown": 100,
}


def _get_source_priority(source: Optional[str]) -> int:
    """
    获取数据源优先级
    """
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
    在多个数据源上统一检索文献的 Orchestrator

    - 根据 sources 列表选择具体 crawler（arxiv, crossref 等）
    - 聚合各源结果并做轻量去重（优先使用 DOI，其次使用 title+year）
    - 截断为指定的 limit 数量

    注意：本函数只负责“跨源检索策略”，不执行入库操作。
    """
    normalized_sources = [s.lower() for s in (sources or ["arxiv"])]
    crawlers = []

    if "arxiv" in normalized_sources:
        crawlers.append(ArxivCrawler(settings=settings))
    if "crossref" in normalized_sources:
        try:
            crawlers.append(CrossRefCrawler(settings=settings))
        except Exception as e:
            logger.error("初始化 CrossRefCrawler 失败: %s", e)

    if not crawlers:
        # 如果没有任何合法的数据源，直接返回空列表
        logger.warning("search_across_sources: 未指定合法的数据源 %s", sources)
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

    # 轻量去重 + 主版本选择：
    # - 先按 "作品 identity" 聚合（优先使用 DOI；若无 DOI，则用 (title.lower(), year)）
    # - 同一作品可能有多个来源（arxiv / crossref / scholar 等）
    # - 从中选择“来源优先级最高”的那条作为主版本
    #   （例如 crossref > google_scholar > arxiv）
    buckets: Dict[Tuple[str, str], List[Paper]] = {}

    # 将不同来源的记录按 identity 分桶
    for p in raw_results:
        doi = getattr(p, "doi", None)
        title = str(getattr(p, "title", "") or "").strip().lower()
        year = getattr(p, "year", None)

        if doi:
            key: Tuple[str, str] = ("doi", str(doi).lower())
        else:
            key = ("title_year", f"{title}_{year}")

        buckets.setdefault(key, []).append(p)

    # 在每个桶内，根据 SOURCE_PRIORITY 选择主版本
    deduped: List[Paper] = []
    for key, candidates in buckets.items():
        if not candidates:
            continue

        # 按来源优先级排序，优先级数值越小越优先
        candidates_sorted = sorted(
            candidates,
            key=lambda p: _get_source_priority(getattr(p, "source", None)),
        )
        primary = candidates_sorted[0]
        deduped.append(primary)

    if len(deduped) > limit:
        return deduped[:limit]
    return deduped

__all__ = ["ArxivCrawler", "CrossRefCrawler", "search_across_sources"]