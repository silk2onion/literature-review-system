"""
CrossRef 文献爬虫服务
通过官方 CrossRef REST API 获取正式出版物元数据

支持两种模式：
1. BaseCrawler.search_raw() — 新管线接口，返回 SourcePaper，cursor 深度分页
2. search() — 旧管线向后兼容接口，返回 Paper ORM 对象

CrossRef API 文档: https://api.crossref.org/swagger-ui/index.html

期刊与收录信息支持边界：
- CrossRef 提供期刊/会议名称 container-title 及部分出版商信息；
- 不直接提供影响因子、JCR 分区或 SCI/SSCI 等收录平台标记，
  这些高级期刊指标需要通过外部 Journal/Index 数据库进行补充。
"""
import logging
import random
import re
import time
from datetime import date as date_type
from typing import List, Optional

import httpx

from app.models.paper import Paper
from app.config import Settings, settings as global_settings
from app.services.crawler.base_crawler import BaseCrawler
from app.services.crawler.source_models import SourcePaper

logger = logging.getLogger(__name__)


class CrossRefCrawler(BaseCrawler):
    """
    CrossRef 文献爬虫

    同时实现：
    - BaseCrawler.search_raw() — 新管线（SourcePaper + cursor 分页 + 穷尽模式）
    - search() — 旧管线向后兼容（Paper ORM 对象）

    设计原则：
    - 只调用 CrossRef 官方 API（https://api.crossref.org/works）
    - cursor-based 深度分页（突破 offset 10000 上限）
    - 支持穷尽模式（max_results=0）
    """

    source_name: str = "crossref"

    BASE_URL = "https://api.crossref.org/works"

    # CrossRef 单次请求最大返回条数
    MAX_PAGE_SIZE = 100

    def __init__(self, settings: Optional[Settings] = None, timeout: float = 30.0):
        self._settings = settings or global_settings

        # CrossRef 官方建议提供一个有联系邮箱的 User-Agent（进入 polite pool）
        ua_email = getattr(self._settings, "ADMIN_EMAIL", None) or "unknown@example.com"
        self.client = httpx.Client(
            timeout=timeout,
            headers={
                "User-Agent": f"lit-review-system/1.0 (mailto:{ua_email})",
                "Accept": "application/json",
            },
        )

        # CrossRef polite pool: 无速率限制；非 polite: ~50 req/sec
        # 保守设置 150ms 间隔
        self._min_interval = 0.15
        self._last_request_time = 0.0

    def _rate_limit(self) -> None:
        """简单的速率限制器"""
        elapsed = time.time() - self._last_request_time
        if elapsed < self._min_interval:
            time.sleep(self._min_interval - elapsed)
        self._last_request_time = time.time()

    # ──────────────────────────────────────────────────────────
    # 新管线接口：BaseCrawler.search_raw()
    # ──────────────────────────────────────────────────────────

    def search_raw(
        self,
        query: str,
        max_results: int = 50,
        offset: int = 0,
    ) -> List[SourcePaper]:
        """
        实现 BaseCrawler.search_raw 接口

        使用 CrossRef cursor-based 分页获取文献。
        当 max_results=0 时进入穷尽模式，获取所有匹配结果。

        Args:
            query: 关键词 / 查询表达式
            max_results: 返回的最大结果数（0=穷尽模式）
            offset: 分页偏移量（cursor 模式下忽略）

        Returns:
            List[SourcePaper]
        """
        is_exhaustive = (max_results == 0)

        papers: List[SourcePaper] = []
        cursor = "*"  # CrossRef cursor 初始值
        page_count = 0
        total_results = None

        while True:
            if not is_exhaustive and len(papers) >= max_results:
                break

            rows = self.MAX_PAGE_SIZE

            params: dict = {
                "query": query,
                "rows": rows,
                "cursor": cursor,
                "select": ",".join([
                    "DOI",
                    "title",
                    "author",
                    "abstract",
                    "published-print",
                    "published-online",
                    "container-title",
                    "URL",
                    "ISSN",
                    "publisher",
                    "type",
                    "subject",
                    "link",
                ]),
            }

            logger.info(
                "[CrossRefCrawler] 请求 page=%d cursor=%s query=%s",
                page_count,
                cursor[:20] + "..." if len(cursor) > 20 else cursor,
                query[:80],
            )

            resp = self._request_with_retry(params)
            if resp is None:
                logger.error("[CrossRefCrawler] 请求失败，终止分页")
                break

            data = resp.json()
            message = data.get("message", {})
            items = message.get("items", []) or []

            # 首次获取总结果数
            if total_results is None:
                total_results = message.get("total-results", 0)
                logger.info(
                    "[CrossRefCrawler] 总匹配结果: %d", total_results,
                )

            if not items:
                logger.info("[CrossRefCrawler] 无更多结果，停止分页")
                break

            for item in items:
                try:
                    paper = self._parse_item_to_source(item)
                    if paper:
                        papers.append(paper)
                except Exception as e:
                    logger.error("[CrossRefCrawler] 解析单条记录失败: %s", e)

                if not is_exhaustive and len(papers) >= max_results:
                    break

            page_count += 1

            # 获取下一页 cursor
            next_cursor = message.get("next-cursor")
            if not next_cursor:
                logger.info(
                    "[CrossRefCrawler] 无下一页 cursor，分页结束 (共 %d 页, %d 条)",
                    page_count, len(papers),
                )
                break

            cursor = next_cursor

            # 安全阈值
            if total_results and len(papers) >= total_results:
                logger.info(
                    "[CrossRefCrawler] 已获取全部 %d/%d 条结果",
                    len(papers), total_results,
                )
                break

            # 防止无限循环硬上限
            if page_count > 500:
                logger.warning("[CrossRefCrawler] 达到 500 页硬上限，强制停止")
                break

        logger.info(
            "[CrossRefCrawler] 返回 %d 条文献 (max_results=%s, exhaustive=%s)",
            len(papers), max_results, is_exhaustive,
        )
        return papers

    def _request_with_retry(
        self,
        params: dict,
        max_retries: int = 4,
    ) -> Optional[httpx.Response]:
        """带随机抖动重试的 HTTP 请求"""
        from app.services.api_usage_service import log_crawler_usage, ApiTimer

        for attempt in range(max_retries):
            self._rate_limit()
            timer = ApiTimer()
            try:
                resp = self.client.get(self.BASE_URL, params=params)
                resp.raise_for_status()
                log_crawler_usage(
                    source="crossref", endpoint=self.BASE_URL, method="GET",
                    status_code=resp.status_code, duration_ms=timer.elapsed_ms(),
                    success=True, caller="CrossRefCrawler._request_with_retry",
                    metadata_json={"query": params.get("query", "")[:200]},
                )
                return resp
            except httpx.HTTPStatusError as e:
                status = e.response.status_code
                if status == 429:
                    retry_after_raw = e.response.headers.get("Retry-After", "5")
                    retry_after = int(retry_after_raw) if retry_after_raw.isdigit() else 5
                    delay = min(retry_after, 60) + random.uniform(1.0, 3.0)
                    logger.warning(
                        "[CrossRefCrawler] 速率限制 (429)，第 %d/%d 次重试，等待 %.1f 秒",
                        attempt + 1, max_retries, delay,
                    )
                    if attempt == max_retries - 1:
                        logger.error("[CrossRefCrawler] 429 达到最大重试次数，放弃")
                        log_crawler_usage(
                            source="crossref", endpoint=self.BASE_URL, method="GET",
                            status_code=429, duration_ms=timer.elapsed_ms(),
                            success=False, error=str(e)[:500],
                            caller="CrossRefCrawler._request_with_retry",
                        )
                        return None
                    time.sleep(delay)
                elif status in (500, 502, 503, 504):
                    delay = (2 ** attempt) + random.uniform(1.0, 3.0)
                    logger.warning(
                        "[CrossRefCrawler] 服务器错误 (%d)，第 %d/%d 次重试，等待 %.1f 秒",
                        status, attempt + 1, max_retries, delay,
                    )
                    if attempt == max_retries - 1:
                        logger.error("[CrossRefCrawler] 达到最大重试次数，放弃")
                        log_crawler_usage(
                            source="crossref", endpoint=self.BASE_URL, method="GET",
                            status_code=status, duration_ms=timer.elapsed_ms(),
                            success=False, error=str(e)[:500],
                            caller="CrossRefCrawler._request_with_retry",
                        )
                        return None
                    time.sleep(delay)
                else:
                    logger.error("[CrossRefCrawler] HTTP 错误: %s", e)
                    log_crawler_usage(
                        source="crossref", endpoint=self.BASE_URL, method="GET",
                        status_code=status, duration_ms=timer.elapsed_ms(),
                        success=False, error=str(e)[:500],
                        caller="CrossRefCrawler._request_with_retry",
                    )
                    return None
            except Exception as e:
                logger.error("[CrossRefCrawler] 请求异常: %s", e)
                if attempt < max_retries - 1:
                    time.sleep(2 + random.uniform(0.5, 1.5))
                else:
                    log_crawler_usage(
                        source="crossref", endpoint=self.BASE_URL, method="GET",
                        status_code=0, duration_ms=timer.elapsed_ms(),
                        success=False, error=str(e)[:500],
                        caller="CrossRefCrawler._request_with_retry",
                    )
                    return None

        logger.error("[CrossRefCrawler] 达到最大重试次数 %d，放弃", max_retries)
        return None

    def _parse_item_to_source(self, item: dict) -> Optional[SourcePaper]:
        """
        将 CrossRef 返回的单条 item 映射为 SourcePaper 对象
        """
        # 标题
        titles = item.get("title") or []
        title = titles[0] if titles else None
        if not title:
            return None

        # 作者
        authors_raw = item.get("author") or []
        authors: List[str] = []
        for a in authors_raw:
            given = a.get("given") or ""
            family = a.get("family") or ""
            full = " ".join(part for part in [given, family] if part).strip()
            if full:
                authors.append(full)

        # 年份
        year = self._extract_year(item, "published-print") or self._extract_year(item, "published-online")

        # 发布日期
        published_date = None
        for key in ("published-print", "published-online"):
            v = item.get(key)
            if v:
                parts = v.get("date-parts", [[]])[0]
                if parts and len(parts) >= 3:
                    try:
                        published_date = date_type(int(parts[0]), int(parts[1]), int(parts[2]))
                        break
                    except (ValueError, IndexError):
                        pass

        # 摘要：CrossRef 的 abstract 通常是 XML 片段
        abstract = item.get("abstract")
        if abstract:
            abstract = re.sub(r'<[^>]+>', '', abstract)
            abstract = re.sub(r'\s+', ' ', abstract).strip()

        # DOI & URL
        doi = item.get("DOI")
        url = item.get("URL")

        # 期刊/会议名
        container_titles = item.get("container-title") or []
        journal = container_titles[0] if container_titles else None

        # ISSN
        issns = item.get("ISSN") or []
        issn = issns[0] if issns else None

        # 出版商
        publisher = item.get("publisher")

        # 主题分类
        subjects = item.get("subject") or []

        # PDF 链接（从 link 数组中寻找）
        pdf_url = None
        links = item.get("link") or []
        for link in links:
            content_type = link.get("content-type", "")
            if "pdf" in content_type.lower():
                pdf_url = link.get("URL")
                break

        paper = SourcePaper(
            title=title,
            authors=authors,
            source="crossref",
            abstract=abstract,
            year=year,
            doi=doi,
            journal=journal,
            publisher=publisher,
            issn=issn,
            published_date=published_date,
            url=url,
            pdf_url=pdf_url,
            keywords=subjects if subjects else None,
        )

        return paper

    @staticmethod
    def _extract_year(item: dict, key: str) -> Optional[int]:
        """从 CrossRef 日期字段中提取年份"""
        v = item.get(key)
        if not v:
            return None
        parts = v.get("date-parts") or []
        if not parts or not parts[0]:
            return None
        y = parts[0][0]
        return int(y) if isinstance(y, int) else None

    # ──────────────────────────────────────────────────────────
    # 旧管线向后兼容接口
    # ──────────────────────────────────────────────────────────

    @staticmethod
    def _source_paper_to_paper(sp: SourcePaper) -> Paper:
        """将 SourcePaper 转换为 Paper ORM 对象（不入库）"""
        return Paper(
            title=sp.title,
            authors=sp.authors,
            abstract=sp.abstract,
            year=sp.year,
            doi=sp.doi,
            journal=sp.journal,
            url=sp.url,
            pdf_url=sp.pdf_url,
            source=sp.source,
        )

    def search(
        self,
        keywords: List[str],
        max_results: int = 20,
        year_from: Optional[int] = None,
        year_to: Optional[int] = None,
    ) -> List[Paper]:
        """
        向后兼容的搜索接口，供 search_across_sources 等旧管线调用。

        内部委托给 search_raw，然后将 SourcePaper 转换为 Paper 对象。
        """
        normalized = [kw.strip() for kw in keywords if kw and kw.strip()]
        query = " ".join(normalized) if normalized else "urban design"

        # 旧管线不需要穷尽，直接传 max_results
        source_papers = self.search_raw(query=query, max_results=max_results)

        # 客户端侧年份过滤
        if year_from or year_to:
            filtered = []
            for sp in source_papers:
                if sp.year is None:
                    filtered.append(sp)
                    continue
                if year_from and sp.year < year_from:
                    continue
                if year_to and sp.year > year_to:
                    continue
                filtered.append(sp)
            source_papers = filtered

        return [self._source_paper_to_paper(sp) for sp in source_papers]

    def get_paper_by_doi(self, doi: str) -> Optional[Paper]:
        """
        通过 DOI 直接获取文献元数据（向后兼容）
        """
        if not doi:
            return None

        url = f"{self.BASE_URL}/{doi}"
        logger.info("[CrossRefCrawler] 请求 DOI 元数据: %s", url)

        self._rate_limit()

        try:
            resp = self.client.get(url)
            if resp.status_code == 404:
                logger.warning("[CrossRefCrawler] DOI 未找到: %s", doi)
                return None
            resp.raise_for_status()

            data = resp.json()
            item = data.get("message", {})
            sp = self._parse_item_to_source(item)
            if sp:
                return self._source_paper_to_paper(sp)
            return None

        except Exception as e:
            logger.error("[CrossRefCrawler] 获取 DOI 失败: %s", e)
            return None