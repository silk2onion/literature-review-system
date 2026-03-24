"""
Scopus 文献爬虫服务
通过 Elsevier Scopus Search API 获取学术文献元数据

Scopus Search API 文档: https://dev.elsevier.com/documentation/ScopusSearchAPI.wadl

特点：
- 需要 Elsevier Developer API Key（机构订阅或个人申请）
- 低权限 Key 可获取: 标题、作者、DOI、期刊、年份、摘要（取决于订阅等级）
- 支持布尔查询（AND/OR/AND NOT）、字段限定（TITLE-ABS-KEY 等）
- cursor-based 分页，支持穷尽检索
- 单次最多返回 25 条（count 参数上限 25）
"""
import logging
import re
import time
from typing import List, Optional

import httpx

from app.config import settings
from app.services.crawler.base_crawler import BaseCrawler, CrawlerError
from app.services.crawler.source_models import SourcePaper

logger = logging.getLogger(__name__)


class ScopusCrawler(BaseCrawler):
    """
    Scopus Search API 文献爬虫

    继承 BaseCrawler，实现 search_raw 返回 List[SourcePaper]。
    与 MultiSourceOrchestrator 的无参构造约定一致。

    API 端点: https://api.elsevier.com/content/search/scopus
    认证方式: X-ELS-APIKey header
    分页方式: cursor-based（推荐）或 start/count offset-based
    """

    source_name: str = "scopus"

    BASE_URL = "https://api.elsevier.com/content/search/scopus"

    # Scopus 单次请求最大返回条数
    MAX_PAGE_SIZE = 25

    def __init__(self, timeout: float = 30.0) -> None:
        self._api_key = getattr(settings, "SCOPUS_API_KEY", "") or ""
        self._enabled = getattr(settings, "SCOPUS_ENABLED", False)

        headers = {
            "Accept": "application/json",
            "X-ELS-APIKey": self._api_key,
        }

        self.client = httpx.Client(
            timeout=timeout,
            headers=headers,
        )

        # Scopus API 速率限制: 通常 2-9 req/sec（取决于 Key 等级）
        # 保守设置 200ms 间隔
        self._min_interval = 0.2
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

        搜索 Scopus 文献，返回标准化的 SourcePaper 列表。

        当 max_results=0 时进入穷尽模式，获取所有匹配结果。

        Args:
            query: 关键词 / Scopus 查询表达式
            max_results: 返回的最大结果数（0=穷尽模式）
            offset: 分页偏移量（cursor 模式下忽略）

        Returns:
            List[SourcePaper]
        """
        if not self._enabled:
            logger.info("[ScopusCrawler] 未启用 (SCOPUS_ENABLED=false)，跳过")
            return []

        if not self._api_key:
            logger.warning("[ScopusCrawler] 未配置 SCOPUS_API_KEY，跳过")
            return []

        is_exhaustive = (max_results == 0)

        # 构造 Scopus 查询表达式
        scopus_query = self._build_scopus_query(query)

        papers: List[SourcePaper] = []
        cursor = "*"  # 初始 cursor
        page_count = 0

        while True:
            # 穷尽模式或还未达到 max_results
            if not is_exhaustive and len(papers) >= max_results:
                break

            count = self.MAX_PAGE_SIZE

            params = {
                "query": scopus_query,
                "count": count,
                "cursor": cursor,
                "field": ",".join([
                    "dc:title",
                    "dc:creator",
                    "dc:description",     # 摘要（可能受权限限制）
                    "prism:doi",
                    "prism:coverDate",
                    "prism:publicationName",
                    "prism:aggregationType",
                    "prism:url",
                    "eid",
                    "citedby-count",
                    "authkeywords",
                    "prism:issn",
                    "source-id",
                    "subtypeDescription",
                    "author",             # 完整作者列表
                    "prism:isbn",
                    "openaccess",
                    "link",               # 包含 self/scopus/full-text 等链接
                ]),
            }

            logger.info(
                "[ScopusCrawler] 请求 page=%d cursor=%s query=%s",
                page_count, cursor[:20] + "..." if len(cursor) > 20 else cursor,
                scopus_query[:80],
            )

            resp = self._request_with_retry(params)
            if resp is None:
                logger.error("[ScopusCrawler] 请求失败，终止分页")
                break

            data = resp.json()
            search_results = data.get("search-results", {})
            entries = search_results.get("entry", [])
            total_results_str = search_results.get("opensearch:totalResults", "0")
            total_results = int(total_results_str) if total_results_str else 0

            # 检查是否返回了错误条目（Scopus 在无结果时返回 error 条目）
            if entries and len(entries) == 1 and "error" in entries[0]:
                error_msg = entries[0].get("error", "Unknown error")
                logger.warning("[ScopusCrawler] API 返回错误: %s", error_msg)
                break

            if not entries:
                logger.info("[ScopusCrawler] 无更多结果，停止分页")
                break

            for entry in entries:
                try:
                    paper = self._parse_entry(entry)
                    if paper:
                        papers.append(paper)
                except Exception as e:
                    logger.error("[ScopusCrawler] 解析单条记录失败: %s", e)

                if not is_exhaustive and len(papers) >= max_results:
                    break

            page_count += 1

            # 获取下一页 cursor
            next_cursor = self._extract_next_cursor(search_results)
            if not next_cursor:
                logger.info(
                    "[ScopusCrawler] 无下一页 cursor，分页结束 (共 %d 页, %d 条)",
                    page_count, len(papers),
                )
                break

            cursor = next_cursor

            # 安全阈值：穷尽模式下也不超过 total_results
            if len(papers) >= total_results:
                logger.info(
                    "[ScopusCrawler] 已获取全部 %d/%d 条结果",
                    len(papers), total_results,
                )
                break

            # 防止无限循环的硬上限
            if page_count > 500:
                logger.warning("[ScopusCrawler] 达到 500 页硬上限，强制停止")
                break

        logger.info(
            "[ScopusCrawler] 返回 %d 条文献 (max_results=%s, exhaustive=%s)",
            len(papers), max_results, is_exhaustive,
        )
        return papers

    def _request_with_retry(
        self,
        params: dict,
        max_retries: int = 3,
    ) -> Optional[httpx.Response]:
        """带重试的 HTTP 请求"""
        for attempt in range(max_retries):
            self._rate_limit()
            try:
                resp = self.client.get(self.BASE_URL, params=params)

                # Scopus 特殊状态码处理
                if resp.status_code == 401:
                    logger.error("[ScopusCrawler] API Key 无效或已过期 (401)")
                    return None
                if resp.status_code == 403:
                    logger.error(
                        "[ScopusCrawler] 权限不足 (403)，可能需要更高级的 API Key"
                    )
                    return None

                resp.raise_for_status()
                return resp

            except httpx.HTTPStatusError as e:
                status = e.response.status_code
                if status == 429:
                    # 速率限制，从响应头获取重试时间
                    retry_after = e.response.headers.get("Retry-After", "5")
                    delay = int(retry_after) if retry_after.isdigit() else 5
                    logger.warning(
                        "[ScopusCrawler] 速率限制 (429)，等待 %d 秒后重试",
                        delay,
                    )
                    time.sleep(delay)
                elif status in (500, 502, 503, 504):
                    delay = (2 ** attempt) + 2
                    logger.warning(
                        "[ScopusCrawler] 服务器错误 (%d)，第 %d 次重试，等待 %d 秒",
                        status, attempt + 1, delay,
                    )
                    time.sleep(delay)
                else:
                    logger.error("[ScopusCrawler] HTTP 错误: %s", e)
                    return None
            except Exception as e:
                logger.error("[ScopusCrawler] 请求异常: %s", e)
                if attempt < max_retries - 1:
                    time.sleep(2)
                else:
                    return None

        logger.error("[ScopusCrawler] 达到最大重试次数 %d，放弃", max_retries)
        return None

    def _build_scopus_query(self, query: str) -> str:
        """
        将通用查询字符串转换为 Scopus 查询表达式

        如果查询已经包含 Scopus 字段限定符（如 TITLE-ABS-KEY），直接使用；
        否则包装为 TITLE-ABS-KEY(query) 进行标题+摘要+关键词搜索。

        Args:
            query: 通用查询字符串

        Returns:
            Scopus 查询表达式
        """
        # 检测是否已经是 Scopus 查询语法
        scopus_field_pattern = re.compile(
            r'\b(TITLE-ABS-KEY|TITLE|ABS|KEY|AUTH|AFFILCITY|SRCTITLE)\s*\(',
            re.IGNORECASE,
        )
        if scopus_field_pattern.search(query):
            return query

        # 通用查询 → TITLE-ABS-KEY 包装
        # 清理查询字符串中的特殊字符
        cleaned = query.strip()
        if not cleaned:
            cleaned = "urban design"

        return f"TITLE-ABS-KEY({cleaned})"

    def _extract_next_cursor(self, search_results: dict) -> Optional[str]:
        """
        从 Scopus 响应中提取下一页 cursor

        Scopus 在 link 数组中通过 @ref="next" 提供下一页 URL，
        URL 中包含 cursor 参数。
        """
        links = search_results.get("link", [])
        for link in links:
            if link.get("@ref") == "next":
                href = link.get("@href", "")
                # 从 URL 中提取 cursor 参数
                # 例如: ...&cursor=AoE...==&...
                import urllib.parse
                parsed = urllib.parse.urlparse(href)
                qs = urllib.parse.parse_qs(parsed.query)
                cursor_values = qs.get("cursor", [])
                if cursor_values:
                    return cursor_values[0]
        return None

    def _parse_entry(self, entry: dict) -> Optional[SourcePaper]:
        """
        将 Scopus 返回的单条 entry 映射为 SourcePaper 对象

        字段映射：
        - dc:title → title
        - dc:creator → authors (主作者)
        - author → authors (完整列表，优先使用)
        - dc:description → abstract
        - prism:doi → doi
        - prism:coverDate → year, published_date
        - prism:publicationName → journal
        - eid → source_id
        - prism:url → url
        - prism:issn → issn
        - authkeywords → keywords
        """
        title = entry.get("dc:title")
        if not title:
            return None

        # 作者：优先使用完整 author 列表，退化到 dc:creator 单作者
        authors: List[str] = []
        author_list = entry.get("author", [])
        if author_list and isinstance(author_list, list):
            for a in author_list:
                name = a.get("authname") or a.get("given-name", "")
                if not name:
                    given = a.get("given-name", "")
                    surname = a.get("surname", "")
                    name = f"{given} {surname}".strip()
                if name:
                    authors.append(name)

        if not authors:
            creator = entry.get("dc:creator")
            if creator:
                authors = [creator]

        # 摘要（低权限 Key 可能返回空或截断）
        abstract = entry.get("dc:description")

        # 年份和日期
        cover_date = entry.get("prism:coverDate")  # 格式: "2024-01-15"
        year = None
        published_date = None
        if cover_date:
            try:
                from datetime import date as date_type
                parts = cover_date.split("-")
                year = int(parts[0])
                if len(parts) >= 3:
                    published_date = date_type(int(parts[0]), int(parts[1]), int(parts[2]))
            except (ValueError, IndexError):
                pass

        # DOI
        doi = entry.get("prism:doi")

        # EID 作为 source_id
        eid = entry.get("eid")

        # 期刊/会议名
        journal = entry.get("prism:publicationName")

        # 出版类型（Journal / Conference Proceeding / Book 等）
        aggregation_type = entry.get("prism:aggregationType")
        conference = None
        if aggregation_type and aggregation_type.lower() == "conference proceeding":
            conference = journal
            journal = None

        # URL（Scopus 详情页）
        url = entry.get("prism:url")
        # 也可从 link 中获取 scopus 页面链接
        links = entry.get("link", [])
        for link in links:
            if link.get("@ref") == "scopus":
                url = link.get("@href", url)
                break

        # ISSN
        issn = entry.get("prism:issn")

        # 关键词
        keywords_str = entry.get("authkeywords")
        keywords = []
        if keywords_str:
            keywords = [kw.strip() for kw in keywords_str.split("|") if kw.strip()]

        # 引用数（仅用于日志/调试，SourcePaper 暂不支持）
        cited_by = entry.get("citedby-count")

        # 开放获取
        open_access = entry.get("openaccess")

        paper = SourcePaper(
            title=title,
            authors=authors,
            source="scopus",
            abstract=abstract,
            year=year,
            doi=doi,
            source_id=eid,
            journal=journal,
            conference=conference,
            issn=issn,
            published_date=published_date,
            url=url,
            keywords=keywords if keywords else None,
        )

        return paper