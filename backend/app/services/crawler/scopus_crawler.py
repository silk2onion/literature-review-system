from typing import List

from app.config import settings
from app.services.crawler.base_crawler import BaseCrawler
from app.services.crawler.source_models import SourcePaper


class ScopusCrawler(BaseCrawler):
    """
    使用 Scopus API 的占位爬虫实现。

    说明：
    - 当前实现只是一个占位 stub，不会真正调用外部 HTTP 接口；
    - 主要作用是让 MultiSourceOrchestrator 的导入链完整，不影响 FastAPI 启动；
    - 后续可以在此基础上补充真实的 Scopus 调用与返回结果解析逻辑。
    """

    source_name: str = "scopus"

    def search_raw(self, query: str, max_results: int = 10, offset: int = 0) -> List[SourcePaper]:
        """
        目前的占位实现：
        - 如果在配置中未启用 SCOPUS_ENABLED，直接返回空列表；
        - 即使启用了，也先返回空列表，后续再逐步接入真实 HTTP 调用。
        """
        # 如果配置里关闭了该数据源，直接返回空
        if not getattr(settings, "SCOPUS_ENABLED", False):
            return []

        # TODO: 后续在此处补充真正的 Scopus API 调用逻辑：
        # 1. 读取 settings.SCOPUS_API_KEY / SCOPUS_API_BASE_URL
        # 2. 构造请求参数，调用 Scopus HTTP 接口
        # 3. 将返回结果解析为 SourcePaper 列表

        # 目前先返回空列表，保证系统可运行
        return []