import logging
from typing import Dict, List, Callable, Optional

from app.services.crawler.base_crawler import BaseCrawler
from app.services.crawler.source_models import SourcePaper
from app.services.crawler.scholar_serpapi_crawler import ScholarSerpapiCrawler
from app.services.crawler.scopus_crawler import ScopusCrawler

logger = logging.getLogger(__name__)


class MultiSourceOrchestrator:
    """
    基于 BaseCrawler + SourcePaper 的多源爬虫 Orchestrator（不负责入库）

    用法示例：
        orchestrator = MultiSourceOrchestrator()
        papers = orchestrator.search_all(
            query="urban design",
            sources=["scholar_serpapi", "scopus"],
            max_results_per_source=10,
        )

    注意：
    - 这里只做“调用各个数据源并合并 SourcePaper 列表”，不做去重/入库；
    - 各具体 crawler 内部已经有自己的启用开关（enabled flag + API key 判定）；
    """

    def __init__(self) -> None:
        # 当前已支持的 crawler 映射；后续接入新的 BaseCrawler 时在这里注册即可
        self._crawler_factories: Dict[str, Callable[[], BaseCrawler]] = {
            "scholar_serpapi": ScholarSerpapiCrawler,
            "scopus": ScopusCrawler,
        }

    def _create_crawler(self, name: str) -> Optional[BaseCrawler]:
        factory = self._crawler_factories.get(name)
        if not factory:
            logger.warning("[MultiSourceOrchestrator] unknown source: %s", name)
            return None
        try:
            return factory()
        except Exception as e:
            logger.error(
                "[MultiSourceOrchestrator] failed to init crawler %s: %s", name, e
            )
            return None

    def search_all(
        self,
        query: str,
        sources: List[str],
        max_results_per_source: int = 10,
    ) -> Dict[str, List[SourcePaper]]:
        """
        按给定 sources 列表并行（顺序）调用各个 crawler，返回按 source 分组的结果。

        返回结构：
        {
          "scholar_serpapi": [...],
          "scopus": [...],
        }
        """
        normalized_sources = [s.strip().lower() for s in sources if s and s.strip()]
        if not normalized_sources:
            logger.warning("[MultiSourceOrchestrator] no sources specified")
            return {}

        results: Dict[str, List[SourcePaper]] = {}
        for s in normalized_sources:
            crawler = self._create_crawler(s)
            if not crawler:
                continue
            try:
                logger.info(
                    "[MultiSourceOrchestrator] search source=%s query=%s limit=%s",
                    s,
                    query,
                    max_results_per_source,
                )
                papers = crawler.search_raw(
                    query=query,
                    max_results=max_results_per_source,
                    offset=0,
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
                results[s] = []
        return results