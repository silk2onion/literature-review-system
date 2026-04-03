"""
Web of Science 爬虫

通过机构认证的 Selenium session 访问 Web of Science，
执行搜索并解析结果页面，提取文献信息。

WoS 无免费公开 API，需要机构订阅访问权限。
本爬虫使用 requests.Session（带有机构认证 cookie）直接请求 WoS API 端点。

WoS Lite API 端点（无需单独 API Key，使用机构 session 即可）:
- 搜索: https://www.webofscience.com/api/wosnx/core/search
- 也可使用旧版 WoS 导出接口
"""

import logging
import re
import time
from datetime import date as date_type
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)


class WebOfScienceCrawler:
    """
    Web of Science 文献爬虫

    使用机构认证 session 访问 WoS 搜索。
    不继承 BaseCrawler 因为它需要特殊的初始化流程（依赖机构认证）。
    但提供相同的 search_raw 接口。
    """

    source_name: str = "wos"

    # WoS 搜索 API 端点
    WOS_SEARCH_URL = "https://www.webofscience.com/api/wosnx/core/executeSearch"
    WOS_RECORDS_URL = "https://www.webofscience.com/api/wosnx/core/records"

    def __init__(self) -> None:
        from app.config import settings

        self._enabled = getattr(settings, "WOS_ENABLED", False)
        self._min_interval = 1.0  # WoS 更保守的速率限制
        self._last_request_time = 0.0

    def _rate_limit(self) -> None:
        elapsed = time.time() - self._last_request_time
        if elapsed < self._min_interval:
            time.sleep(self._min_interval - elapsed)
        self._last_request_time = time.time()

    def search_raw(
        self,
        query: str,
        max_results: int = 50,
        offset: int = 0,
    ) -> list:
        """
        搜索 Web of Science

        Args:
            query: 检索表达式
            max_results: 最大结果数
            offset: 偏移量

        Returns:
            List[SourcePaper]
        """
        from app.services.crawler.source_models import SourcePaper

        if not self._enabled:
            logger.info("[WoSCrawler] 未启用 (WOS_ENABLED=false)，跳过")
            return []

        from app.config import settings

        if not getattr(settings, "INSTITUTIONAL_ENABLED", False):
            logger.info("[WoSCrawler] 机构访问未启用，无法访问 WoS")
            return []

        from app.services.institutional_auth import get_institutional_auth_service

        auth_service = get_institutional_auth_service()

        # 确保已认证
        if not auth_service.is_authenticated:
            login_success = auth_service.login(
                login_url=settings.INSTITUTIONAL_LOGIN_URL,
                username=settings.INSTITUTIONAL_USERNAME,
                password=settings.INSTITUTIONAL_PASSWORD,
                auth_type=settings.INSTITUTIONAL_AUTH_TYPE,
                headless=settings.SELENIUM_HEADLESS,
            )
            if not login_success:
                logger.warning("[WoSCrawler] 机构登录失败，无法访问 WoS")
                return []

        session = auth_service.get_authenticated_session()
        if not session:
            return []

        papers: List[SourcePaper] = []

        try:
            # WoS 新版前端使用 JSON API
            # 先通过 EZProxy 访问 WoS
            ezproxy_prefix = getattr(settings, "INSTITUTIONAL_EZPROXY_PREFIX", "")

            # 构建 WoS 搜索请求
            wos_url = "https://www.webofscience.com/wos/woscc/basic-search"
            if ezproxy_prefix:
                wos_url = auth_service.get_proxied_url(wos_url, ezproxy_prefix)

            # 使用 WoS 导出 API — 更可靠的方式
            # 通过搜索页面获取 SID，然后用导出接口拿结构化数据
            search_results = self._search_via_api(
                session, query, max_results, offset, ezproxy_prefix
            )

            if search_results:
                for record in search_results:
                    paper = self._parse_wos_record(record)
                    if paper:
                        papers.append(paper)

            logger.info("[WoSCrawler] 搜索完成: %d 条结果", len(papers))

        except Exception as e:
            logger.error("[WoSCrawler] 搜索异常: %s", e)

        return papers

    def _search_via_api(
        self,
        session,
        query: str,
        max_results: int,
        offset: int,
        ezproxy_prefix: str,
    ) -> List[Dict]:
        """
        通过 WoS API 搜索

        WoS 新版使用内部 API，需要先获取页面 CSRF token。
        """
        from app.services.institutional_auth import get_institutional_auth_service

        auth_service = get_institutional_auth_service()

        # 步骤 1: 访问 WoS 首页获取必要的 cookie/token
        base_url = "https://www.webofscience.com"
        if ezproxy_prefix:
            base_url = auth_service.get_proxied_url(base_url, ezproxy_prefix)

        self._rate_limit()
        try:
            home_resp = session.get(f"{base_url}/wos/woscc/basic-search", timeout=30)
            if home_resp.status_code != 200:
                logger.warning(
                    "[WoSCrawler] 无法访问 WoS 首页: status=%d", home_resp.status_code
                )
                return []
        except Exception as e:
            logger.error("[WoSCrawler] 访问 WoS 首页失败: %s", e)
            return []

        # 步骤 2: 使用 WoS 内部搜索 API
        search_api_url = f"{base_url}/api/wosnx/core/executeSearch"

        # WoS 搜索 payload
        search_payload = {
            "search_mode": "GeneralSearch",
            "update_group_id": "default_group",
            "product": "WOS",
            "search": {
                "mode": "general",
                "sets": [
                    {
                        "field": "TS",  # Topic Search
                        "value": query,
                        "operation": "AND",
                    }
                ],
            },
            "retrieve": {
                "count": min(max_results, 50),  # WoS 单次最多 50
                "offset": offset,
                "sort": "relevance",
            },
        }

        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Referer": f"{base_url}/wos/woscc/basic-search",
        }

        self._rate_limit()
        try:
            resp = session.post(
                search_api_url,
                json=search_payload,
                headers=headers,
                timeout=30,
            )

            if resp.status_code != 200:
                logger.warning(
                    "[WoSCrawler] 搜索 API 返回 %d, 尝试解析页面方式",
                    resp.status_code,
                )
                return self._search_via_page_scraping(
                    session, query, max_results, base_url
                )

            data = resp.json()
            records = data.get("records", data.get("Data", {}).get("Records", []))

            if isinstance(records, list):
                return records

            logger.debug("[WoSCrawler] API 响应结构不符合预期，尝试页面解析")
            return self._search_via_page_scraping(
                session, query, max_results, base_url
            )

        except Exception as e:
            logger.warning("[WoSCrawler] 搜索 API 调用失败: %s, 尝试页面解析", e)
            return self._search_via_page_scraping(
                session, query, max_results, base_url
            )

    def _search_via_page_scraping(
        self,
        session,
        query: str,
        max_results: int,
        base_url: str,
    ) -> List[Dict]:
        """
        通过解析 WoS 搜索结果页面提取数据（fallback）

        当内部 API 不可用时，直接解析 HTML 页面。
        """
        from bs4 import BeautifulSoup

        search_url = (
            f"{base_url}/wos/woscc/summary/"
            f"?q=TS%3D%28{query.replace(' ', '+')}%29"
        )

        self._rate_limit()
        try:
            resp = session.get(search_url, timeout=30)
            if resp.status_code != 200:
                logger.warning(
                    "[WoSCrawler] 搜索页面返回 %d", resp.status_code
                )
                return []

            soup = BeautifulSoup(resp.text, "html.parser")
            records = []

            # WoS 搜索结果通常在特定的 div/article 元素中
            result_items = soup.select(
                "app-record, .search-results-item, [data-ta='search-results-item']"
            )

            if not result_items:
                # 尝试其他选择器
                result_items = soup.select("div.record-container, tr.record")

            for item in result_items[:max_results]:
                record = {}

                # 提取标题
                title_el = item.select_one(
                    "a.title, .title-link, [data-ta='title-link']"
                )
                if title_el:
                    record["title"] = title_el.get_text(strip=True)

                # 提取作者
                authors_el = item.select_one(".authors, .font-size-14")
                if authors_el:
                    record["authors"] = authors_el.get_text(strip=True)

                # 提取来源（期刊名）
                source_el = item.select_one(".source, .journal")
                if source_el:
                    record["source"] = source_el.get_text(strip=True)

                # 提取年份
                year_el = item.select_one(".year, .pub-year")
                if year_el:
                    record["year"] = year_el.get_text(strip=True)

                # 提取 DOI
                doi_el = item.select_one("a[href*='doi.org']")
                if doi_el:
                    href = doi_el.get("href", "")
                    doi_match = re.search(r"doi\.org/(10\.\d+/.+?)(?:\?|$)", href)
                    if doi_match:
                        record["doi"] = doi_match.group(1)

                if record.get("title"):
                    records.append(record)

            logger.info(
                "[WoSCrawler] 页面解析提取 %d 条记录", len(records)
            )
            return records

        except Exception as e:
            logger.error("[WoSCrawler] 页面解析失败: %s", e)
            return []

    def _parse_wos_record(self, record: Dict) -> Optional["SourcePaper"]:
        """将 WoS 记录转为 SourcePaper"""
        from app.services.crawler.source_models import SourcePaper

        title = record.get("title") or record.get("Title", "")
        if not title:
            return None

        # 解析作者
        authors_raw = record.get("authors") or record.get("Authors", "")
        if isinstance(authors_raw, str):
            authors = [a.strip() for a in authors_raw.split(";") if a.strip()]
            if not authors:
                authors = [a.strip() for a in authors_raw.split(",") if a.strip()]
        elif isinstance(authors_raw, list):
            authors = authors_raw
        else:
            authors = []

        # 年份
        year_raw = record.get("year") or record.get("Year", "")
        year = None
        if year_raw:
            year_match = re.search(r"(\d{4})", str(year_raw))
            if year_match:
                year = int(year_match.group(1))

        # DOI
        doi = record.get("doi") or record.get("DOI", "")

        # 期刊
        journal = record.get("source") or record.get("Source", "")

        # 摘要
        abstract = record.get("abstract") or record.get("Abstract", "")

        # URL
        url = None
        if doi:
            url = f"https://doi.org/{doi}"

        # WoS UT (唯一标识)
        wos_ut = record.get("ut") or record.get("UT", "")

        return SourcePaper(
            source="wos",
            source_id=wos_ut if wos_ut else None,
            title=title.strip(),
            authors=authors[:20],  # 限制作者数量
            abstract=abstract.strip() if abstract else None,
            year=year,
            doi=doi.strip() if doi else None,
            url=url,
            journal=journal.strip() if journal else None,
        )

    def close(self) -> None:
        """清理资源（无需关闭，session 由 InstitutionalAuthService 管理）"""
        pass
