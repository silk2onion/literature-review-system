"""
Google Scholar 文献爬虫服务（通过 SerpAPI 代理）
使用 SerpAPI 的 Google Scholar Engine 获取学术文献元数据

SerpAPI 文档: https://serpapi.com/google-scholar-api

特点：
- 需要 SerpAPI API Key（付费，有免费额度）
- 返回 Google Scholar 搜索结果：标题、作者、摘要片段、引用数、年份
- 分页方式：offset-based（start 参数，每页 10-20 条）
- Google Scholar 是最广泛的学术搜索引擎，覆盖各类出版物
- 注意：摘要通常只是片段（snippet），非完整摘要
"""
import logging
import random
import re
import time
from typing import List, Optional

import httpx

from app.config import settings
from app.services.crawler.base_crawler import BaseCrawler
from app.services.crawler.source_models import SourcePaper

logger = logging.getLogger(__name__)


class ScholarSerpapiCrawler(BaseCrawler):
    """
    Google Scholar 文献爬虫（通过 SerpAPI）

    继承 BaseCrawler，实现 search_raw 返回 List[SourcePaper]。
    与 MultiSourceOrchestrator 的无参构造约定一致。

    API 端点: https://serpapi.com/search?engine=google_scholar
    认证方式: api_key 参数
    分页方式: start 参数（offset-based）
    """

    source_name: str = "scholar_serpapi"

    BASE_URL = "https://serpapi.com/search"

    # Google Scholar 单页最多返回 20 条
    MAX_PAGE_SIZE = 20

    def __init__(self, timeout: float = 30.0) -> None:
        self._api_key = getattr(settings, "SERPAPI_API_KEY", "") or ""
        self._enabled = getattr(settings, "SERPAPI_SCHOLAR_ENABLED", False)
        self._engine = getattr(settings, "SERPAPI_SCHOLAR_ENGINE", "google_scholar")

        self.client = httpx.Client(
            timeout=timeout,
            headers={"Accept": "application/json"},
        )

        # SerpAPI 有自己的速率限制（取决于套餐），保守 500ms
        self._min_interval = 0.5
        self._last_request_time = 0.0

    def _rate_limit(self) -> None:
        """简单的速率限制器"""
        elapsed = time.time() - self._last_request_time
        if elapsed < self._min_interval:
            time.sleep(self._min_interval - elapsed)
        self._last_request_time = time.time()

    def search_raw(
        self,
        query: str,
        max_results: int = 50,
        offset: int = 0,
    ) -> List[SourcePaper]:
        """
        实现 BaseCrawler.search_raw 接口

        搜索 Google Scholar（通过 SerpAPI），返回标准化的 SourcePaper 列表。

        当 max_results=0 时进入穷尽模式，但由于 Google Scholar 的限制
        （SerpAPI 最多支持约 100 页 = ~1000-2000 条），
        穷尽模式会有实际上限。

        Args:
            query: 关键词 / 查询表达式
            max_results: 返回的最大结果数（0=穷尽模式）
            offset: 起始偏移量

        Returns:
            List[SourcePaper]
        """
        if not self._enabled:
            logger.info("[ScholarSerpapiCrawler] 未启用 (SERPAPI_SCHOLAR_ENABLED=false)，跳过")
            return []

        if not self._api_key:
            logger.warning("[ScholarSerpapiCrawler] 未配置 SERPAPI_API_KEY，跳过")
            return []

        is_exhaustive = (max_results == 0)

        papers: List[SourcePaper] = []
        current_start = offset
        page_count = 0

        while True:
            if not is_exhaustive and len(papers) >= max_results:
                break

            params = {
                "engine": self._engine,
                "q": query,
                "api_key": self._api_key,
                "start": current_start,
                "num": self.MAX_PAGE_SIZE,
                "hl": "en",  # 英文界面
            }

            logger.info(
                "[ScholarSerpapiCrawler] 请求 page=%d start=%d query=%s",
                page_count, current_start, query[:80],
            )

            resp = self._request_with_retry(params)
            if resp is None:
                logger.error("[ScholarSerpapiCrawler] 请求失败，终止分页")
                break

            data = resp.json()

            # 检查 API 错误
            if "error" in data:
                error_msg = data["error"]
                logger.error("[ScholarSerpapiCrawler] API 错误: %s", error_msg)
                break

            # 解析有机结果（organic_results）
            organic_results = data.get("organic_results", [])

            if not organic_results:
                logger.info("[ScholarSerpapiCrawler] 无更多结果，停止分页")
                break

            for item in organic_results:
                try:
                    paper = self._parse_result(item)
                    if paper:
                        papers.append(paper)
                except Exception as e:
                    logger.error("[ScholarSerpapiCrawler] 解析单条记录失败: %s", e)

                if not is_exhaustive and len(papers) >= max_results:
                    break

            page_count += 1
            current_start += len(organic_results)

            # 检查是否有下一页
            search_info = data.get("search_information", {})
            total_results = search_info.get("total_results", 0)

            # SerpAPI 分页信息
            serpapi_pagination = data.get("serpapi_pagination", {})
            has_next = "next" in serpapi_pagination

            if not has_next:
                logger.info(
                    "[ScholarSerpapiCrawler] 无下一页，分页结束 (共 %d 页, %d 条)",
                    page_count, len(papers),
                )
                break

            # 防止无限循环（Google Scholar 通常最多 ~100 页）
            if page_count > 100:
                logger.warning("[ScholarSerpapiCrawler] 达到 100 页上限，强制停止")
                break

        logger.info(
            "[ScholarSerpapiCrawler] 返回 %d 条文献 (max_results=%s, exhaustive=%s)",
            len(papers), max_results, is_exhaustive,
        )
        return papers

    def _request_with_retry(
        self,
        params: dict,
        max_retries: int = 4,
    ) -> Optional[httpx.Response]:
        """带重试的 HTTP 请求（含随机抖动防撞墙）"""
        from app.services.api_usage_service import log_crawler_usage, ApiTimer

        for attempt in range(max_retries):
            self._rate_limit()
            timer = ApiTimer()
            try:
                resp = self.client.get(self.BASE_URL, params=params)
                resp.raise_for_status()
                log_crawler_usage(
                    source="scholar_serpapi", endpoint=self.BASE_URL, method="GET",
                    status_code=resp.status_code, duration_ms=timer.elapsed_ms(),
                    success=True, caller="ScholarSerpapiCrawler._request_with_retry",
                    metadata_json={"query": params.get("q", "")[:200]},
                )
                return resp
            except httpx.HTTPStatusError as e:
                status = e.response.status_code
                if status == 429:
                    if attempt == max_retries - 1:
                        logger.error("[ScholarSerpapiCrawler] 429 达到最大重试次数，放弃")
                        log_crawler_usage(
                            source="scholar_serpapi", endpoint=self.BASE_URL, method="GET",
                            status_code=429, duration_ms=timer.elapsed_ms(),
                            success=False, error=str(e)[:500],
                            caller="ScholarSerpapiCrawler._request_with_retry",
                        )
                        return None
                    delay = (2 ** attempt) + random.uniform(2.0, 5.0)
                    logger.warning(
                        "[ScholarSerpapiCrawler] 速率限制 (429)，等待 %.1f 秒后重试 (%d/%d)",
                        delay, attempt + 1, max_retries,
                    )
                    time.sleep(delay)
                elif status in (500, 502, 503, 504):
                    delay = (2 ** attempt) + random.uniform(1.0, 3.0)
                    logger.warning(
                        "[ScholarSerpapiCrawler] 服务器错误 (%d)，第 %d 次重试",
                        status, attempt + 1,
                    )
                    if attempt == max_retries - 1:
                        log_crawler_usage(
                            source="scholar_serpapi", endpoint=self.BASE_URL, method="GET",
                            status_code=status, duration_ms=timer.elapsed_ms(),
                            success=False, error=str(e)[:500],
                            caller="ScholarSerpapiCrawler._request_with_retry",
                        )
                        return None
                    time.sleep(delay)
                else:
                    logger.error("[ScholarSerpapiCrawler] HTTP 错误: %s", e)
                    log_crawler_usage(
                        source="scholar_serpapi", endpoint=self.BASE_URL, method="GET",
                        status_code=status, duration_ms=timer.elapsed_ms(),
                        success=False, error=str(e)[:500],
                        caller="ScholarSerpapiCrawler._request_with_retry",
                    )
                    return None
            except Exception as e:
                logger.error("[ScholarSerpapiCrawler] 请求异常: %s", e)
                if attempt < max_retries - 1:
                    time.sleep(random.uniform(1.0, 3.0))
                else:
                    log_crawler_usage(
                        source="scholar_serpapi", endpoint=self.BASE_URL, method="GET",
                        status_code=0, duration_ms=timer.elapsed_ms(),
                        success=False, error=str(e)[:500],
                        caller="ScholarSerpapiCrawler._request_with_retry",
                    )
                    return None

        logger.error("[ScholarSerpapiCrawler] 达到最大重试次数 %d，放弃", max_retries)
        return None

    def _parse_result(self, item: dict) -> Optional[SourcePaper]:
        """
        将 SerpAPI Google Scholar 返回的单条 organic_result 映射为 SourcePaper

        字段映射：
        - title → title
        - publication_info.summary → 作者和期刊信息（需要解析）
        - snippet → abstract（注意：只是摘要片段）
        - inline_links.serpapi_cite_link → 引用信息
        - resources[].link → pdf_url
        - link → url
        """
        title = item.get("title")
        if not title:
            return None

        # 解析作者和出版信息
        pub_info = item.get("publication_info", {})
        summary = pub_info.get("summary", "")
        authors, journal, year = self._parse_publication_summary(summary)

        # 如果 publication_info 有 authors 列表，优先使用
        pub_authors = pub_info.get("authors", [])
        if pub_authors:
            authors = [a.get("name", "") for a in pub_authors if a.get("name")]

        # 摘要（Google Scholar 只给片段）
        abstract = item.get("snippet")

        # URL
        url = item.get("link")

        # PDF 链接
        pdf_url = None
        resources = item.get("resources", [])
        for res in resources:
            res_link = res.get("link", "")
            file_format = res.get("file_format", "")
            if "pdf" in file_format.lower() or res_link.endswith(".pdf"):
                pdf_url = res_link
                break

        # DOI 提取：Google Scholar 不直接返回 DOI，需从 URL 链接中解析
        doi = self._extract_doi_from_urls(url, pdf_url, resources)

        # result_id 作为 source_id
        source_id = item.get("result_id")

        # 引用数
        inline_links = item.get("inline_links", {})
        cited_by = inline_links.get("cited_by", {})
        # cited_count = cited_by.get("total")  # SourcePaper 暂无此字段

        paper = SourcePaper(
            title=title,
            authors=authors,
            source="scholar_serpapi",
            abstract=abstract,
            year=year,
            doi=doi,
            source_id=source_id,
            journal=journal,
            url=url,
            pdf_url=pdf_url,
        )

        return paper

    @staticmethod
    def _extract_doi_from_urls(
        url: Optional[str],
        pdf_url: Optional[str],
        resources: list,
    ) -> Optional[str]:
        """
        从 Google Scholar 结果的各种 URL 中尝试提取 DOI。

        DOI 通常嵌在以下位置：
        - link: "https://doi.org/10.1016/j.ufug.2024.128345"
        - link: "https://www.sciencedirect.com/science/article/pii/..." (无 DOI)
        - resources[].link: PDF 链接有时包含 DOI 路径
        - link: "https://link.springer.com/article/10.1007/s11069-024-..."

        DOI 正则: 10.XXXX/后续任意非空白字符
        """
        doi_pattern = re.compile(r'(10\.\d{4,9}/[^\s&?#]+)')

        # 优先从主链接提取
        for candidate in [url, pdf_url]:
            if candidate:
                match = doi_pattern.search(candidate)
                if match:
                    doi = match.group(1).rstrip(".,;)")
                    return doi

        # 从 resources 链接中提取
        for res in resources:
            res_link = res.get("link", "")
            if res_link:
                match = doi_pattern.search(res_link)
                if match:
                    doi = match.group(1).rstrip(".,;)")
                    return doi

        return None

    @staticmethod
    def _parse_publication_summary(summary: str):
        """
        解析 Google Scholar publication_info.summary 字符串

        典型格式：
        "J Smith, A Johnson, B Williams - Journal of Urban Studies, 2024 - Elsevier"
        "J Smith, A Johnson - arXiv preprint arXiv:2401.12345, 2024 - arxiv.org"
        "J Smith - 2024 - publisher.com"

        Returns:
            (authors: List[str], journal: Optional[str], year: Optional[int])
        """
        authors: List[str] = []
        journal: Optional[str] = None
        year: Optional[int] = None

        if not summary:
            return authors, journal, year

        # 按 " - " 分割
        parts = summary.split(" - ")

        if len(parts) >= 1:
            # 第一部分通常是作者列表
            author_part = parts[0].strip()
            # 有时候是 "…" 结尾表示作者被截断
            raw_authors = [a.strip() for a in author_part.split(",") if a.strip()]
            authors = [a for a in raw_authors if a and a != "…"]

        if len(parts) >= 2:
            # 第二部分通常是 "Journal Name, Year"
            journal_year_part = parts[1].strip()

            # 尝试提取年份（四位数字）
            year_match = re.search(r'\b(19|20)\d{2}\b', journal_year_part)
            if year_match:
                year = int(year_match.group())
                # 年份之前的部分是期刊名
                journal_part = journal_year_part[:year_match.start()].strip().rstrip(",").strip()
                if journal_part:
                    journal = journal_part

        if len(parts) >= 3 and year is None:
            # 第三部分有时包含年份
            year_match = re.search(r'\b(19|20)\d{2}\b', parts[2])
            if year_match:
                year = int(year_match.group())

        return authors, journal, year