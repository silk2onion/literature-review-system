import logging
from typing import Dict, List, Callable, Optional

from app.services.crawler.base_crawler import BaseCrawler
from app.services.crawler.source_models import SourcePaper
from app.services.crawler.scholar_serpapi_crawler import ScholarSerpapiCrawler
from app.services.crawler.scopus_crawler import ScopusCrawler
from app.services.crawler.semantic_scholar_crawler import SemanticScholarCrawler
from app.services.crawler.openalex_crawler import OpenAlexCrawler
from app.services.crawler.crossref_crawler import CrossRefCrawler
from app.services.crawler.wos_crawler import WebOfScienceCrawler

logger = logging.getLogger(__name__)


class MultiSourceOrchestrator:
    """
    基于 BaseCrawler + SourcePaper 的多源爬虫 Orchestrator（不负责入库）

    用法示例：
        orchestrator = MultiSourceOrchestrator()
        try:
            papers = orchestrator.search_all(
                query="urban design",
                sources=["scholar_serpapi", "scopus"],
                max_results_per_source=10,
            )
        finally:
            orchestrator.close()

    注意：
    - 这里只做"调用各个数据源并合并 SourcePaper 列表"，不做去重/入库；
    - 各具体 crawler 内部已经有自己的启用开关（enabled flag + API key 判定）；
    - crawler 实例会被缓存复用，调用 close() 释放所有 HTTP 连接。
    """

    def __init__(self) -> None:
        # 当前已支持的 crawler 映射；后续接入新的 BaseCrawler 时在这里注册即可
        self._crawler_factories: Dict[str, Callable[[], BaseCrawler]] = {
            "scholar_serpapi": ScholarSerpapiCrawler,
            "scopus": ScopusCrawler,
            "semantic_scholar": SemanticScholarCrawler,
            "openalex": OpenAlexCrawler,
            "crossref": CrossRefCrawler,
            "wos": WebOfScienceCrawler,
        }
        # 缓存已创建的 crawler 实例，避免重复创建 httpx.Client
        self._crawler_cache: Dict[str, BaseCrawler] = {}

    def _get_crawler(self, name: str) -> Optional[BaseCrawler]:
        """获取 crawler 实例（缓存复用）"""
        if name in self._crawler_cache:
            return self._crawler_cache[name]

        factory = self._crawler_factories.get(name)
        if not factory:
            logger.warning("[MultiSourceOrchestrator] unknown source: %s", name)
            return None
        try:
            crawler = factory()
            self._crawler_cache[name] = crawler
            return crawler
        except Exception as e:
            logger.error(
                "[MultiSourceOrchestrator] failed to init crawler %s: %s", name, e
            )
            return None

    def close(self) -> None:
        """关闭所有缓存的 crawler 实例，释放 HTTP 连接"""
        for name, crawler in self._crawler_cache.items():
            try:
                crawler.close()
            except Exception as e:
                logger.debug("[MultiSourceOrchestrator] close crawler %s: %s", name, e)
        self._crawler_cache.clear()

    def search_all(
        self,
        query: str,
        sources: List[str],
        max_results_per_source: int = 10,
        offset: int = 0,
    ) -> Dict[str, List[SourcePaper]]:
        """
        按给定 sources 列表顺序调用各个 crawler，返回按 source 分组的结果。

        返回结构：
        {
          "scholar_serpapi": [...],
          "scopus": [...],
        }

        调用后可通过 self.source_errors 查看各数据源的错误信息。
        """
        normalized_sources = [s.strip().lower() for s in sources if s and s.strip()]
        # 重置每次 search_all 的错误记录
        self.source_errors: Dict[str, str] = {}

        if not normalized_sources:
            logger.warning("[MultiSourceOrchestrator] no sources specified")
            return {}

        results: Dict[str, List[SourcePaper]] = {}
        for s in normalized_sources:
            crawler = self._get_crawler(s)
            if not crawler:
                self.source_errors[s] = "crawler not available or failed to initialize"
                continue
            try:
                logger.info(
                    "[MultiSourceOrchestrator] search source=%s query=%s limit=%s offset=%s",
                    s,
                    query,
                    max_results_per_source,
                    offset,
                )
                papers = crawler.search_raw(
                    query=query,
                    max_results=max_results_per_source,
                    offset=offset,
                )
                results[s] = papers
                logger.info(
                    "[MultiSourceOrchestrator] source=%s returned %d items",
                    s,
                    len(papers),
                )
            except Exception as e:
                logger.error(
                    "[MultiSourceOrchestrator] search failed for source=%s: %s", s, e
                )
                self.source_errors[s] = str(e)
                results[s] = []
        return results