from abc import ABC, abstractmethod
from typing import List

from app.services.crawler.source_models import SourcePaper


class CrawlerError(Exception):
    """爬虫基础异常"""
    pass


class BaseCrawler(ABC):
    """
    统一的爬虫抽象基类

    说明：
    - 为“新一代多源管线”服务，返回的是标准化的 SourcePaper 列表
    - 不强制改造现有直接返回 Paper 的 ArxivCrawler / CrossRefCrawler
      这两者可以逐步在内部增加一个“导出 SourcePaper”的方法，或者后续新建对应的 *SourceCrawler

    约定：
    - 每个具体实现需要设置类属性 source_name，例如 "arxiv" / "crossref" / "scopus" / "scholar_serpapi"
    - search_raw 只负责请求外部数据源并做字段标准化，不负责入库
    """

    source_name: str = "unknown"

    @abstractmethod
    def search_raw(
        self,
        query: str,
        max_results: int = 50,
        offset: int = 0,
    ) -> List[SourcePaper]:
        """
        执行检索，返回标准化的 SourcePaper 列表

        参数：
            query:   关键词 / 查询表达式（由上层统一构造）
            max_results: 限制最大返回条数（每个源）
            offset:  分页偏移量（如果底层 API 支持）

        返回：
            List[SourcePaper]
        """
        raise NotImplementedError