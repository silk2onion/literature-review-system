"""
OpenAlex 文献爬虫服务
通过 OpenAlex API 获取学术论文元数据

特点：
- 完全免费、无需 API Key
- 覆盖 2.5 亿+ 篇学术文献（包含 Scopus/CrossRef/PubMed 等多源数据）
- 提供 cursor-based 分页，支持穷尽检索
- 请求头加 mailto 可进入 polite pool（10 req/sec → 无限制）
- 支持复杂过滤器：年份、语言、文档类型、开放获取状态等

API 文档：https://docs.openalex.org/api-entities/works
"""
import logging
import random
import time
from datetime import date as date_type
from typing import List, Optional, Dict, Any

import httpx

from app.config import settings
from app.services.crawler.base_crawler import BaseCrawler
from app.services.crawler.source_models import SourcePaper

logger = logging.getLogger(__name__)


class OpenAlexCrawler(BaseCrawler):
    """
    OpenAlex Works API 文献爬虫

    设计原则：
    - 继承 BaseCrawler，实现 search_raw 返回 List[SourcePaper]
    - 支持两种模式：
      1. 普通模式：受 max_results 上限约束
      2. 穷尽模式：通过 search_exhaustive() 方法，cursor 分页直到无更多结果
    - 与 MultiSourceOrchestrator 的无参构造约定一致
    """

    source_name: str = "openalex"

    BASE_URL = "https://api.openalex.org/works"

    # 单页最大返回数（OpenAlex 上限 200）
    MAX_PER_PAGE = 200

    def __init__(self, timeout: float = 30.0) -> None:
        # OpenAlex polite pool：请求头加 mailto 可提升速率
        email = getattr(settings, "OPENALEX_EMAIL", "") or ""
        headers: Dict[str, str] = {
            "Accept": "application/json",
            "User-Agent": f"ScholarNative/1.0 (mailto:{email})" if email else "ScholarNative/1.0",
        }

        self.client = httpx.Client(
            timeout=timeout,
            headers=headers,
        )

        self._has_email = bool(email)
        # polite pool: 无显式限制；无 email 时限制 10 req/sec
        self._min_interval = 0.0 if self._has_email else 0.12
        self._last_request_time = 0.0

    def _rate_limit(self) -> None:
        """简单的速率限制器"""
        if self._min_interval <= 0:
            return
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

        使用 OpenAlex 的 search 参数进行语义搜索。
        通过 cursor-based 分页获取结果，直到达到 max_results 上限。

        Args:
            query: 搜索关键词/查询表达式
            max_results: 返回的最大结果数（0 表示穷尽检索）
            offset: 保留参数（OpenAlex 使用 cursor 而非 offset，此参数被忽略）

        Returns:
            List[SourcePaper]
        """
        # 检查是否启用
        if not getattr(settings, "OPENALEX_ENABLED", True):
            logger.info("[OpenAlexCrawler] 未启用，跳过")
            return []

        exhaustive = (max_results <= 0)
        papers: List[SourcePaper] = []
        cursor = "*"  # OpenAlex cursor 分页起始标记
        page_count = 0

        while True:
            per_page = self.MAX_PER_PAGE
            if not exhaustive:
                remaining = max_results - len(papers)
                if remaining <= 0:
                    break
                per_page = min(per_page, remaining)

            params: Dict[str, Any] = {
                "search": query,
                "per_page": per_page,
                "cursor": cursor,
            }

            # 构建过滤器（年份、类型等由上层通过 search_with_filters 传入）
            # search_raw 只做最基本的搜索

            logger.info(
                "[OpenAlexCrawler] 请求 page=%d cursor=%s per_page=%d",
                page_count + 1, cursor[:20] if cursor else "None", per_page,
            )

            resp = self._request_with_retry(params)
            if resp is None:
                logger.error("[OpenAlexCrawler] 请求失败，终止分页")
                break

            data = resp.json()
            results = data.get("results", []) or []
            meta = data.get("meta", {}) or {}
            next_cursor = meta.get("next_cursor")
            total_count = meta.get("count", 0)

            if page_count == 0:
                logger.info(
                    "[OpenAlexCrawler] 总计匹配 %d 篇文献",
                    total_count,
                )

            if not results:
                logger.info("[OpenAlexCrawler] 无更多结果，分页结束")
                break

            for item in results:
                try:
                    paper = self._parse_item(item)
                    if paper:
                        papers.append(paper)
                except Exception as e:
                    logger.error("[OpenAlexCrawler] 解析单条记录失败: %s", e)

                if not exhaustive and len(papers) >= max_results:
                    break

            page_count += 1

            # 检查是否继续分页
            if not exhaustive and len(papers) >= max_results:
                break

            if not next_cursor:
                logger.info("[OpenAlexCrawler] 无 next_cursor，分页结束")
                break

            cursor = next_cursor

        logger.info(
            "[OpenAlexCrawler] 返回 %d 条文献（请求 max_results=%s, 分页 %d 页）",
            len(papers), "穷尽" if exhaustive else str(max_results), page_count,
        )
        return papers

    def search_with_filters(
        self,
        query: str,
        max_results: int = 50,
        year_from: Optional[int] = None,
        year_to: Optional[int] = None,
        doc_type: Optional[str] = None,
        language: Optional[str] = None,
        open_access: Optional[bool] = None,
    ) -> List[SourcePaper]:
        """
        带过滤器的搜索（为 Scoping Review 穷尽检索设计）

        Args:
            query: 搜索关键词
            max_results: 最大结果数（0 表示穷尽检索）
            year_from: 起始年份
            year_to: 结束年份
            doc_type: 文档类型 (article, review, book-chapter 等)
            language: 语言过滤 (en, zh 等)
            open_access: 是否仅开放获取

        Returns:
            List[SourcePaper]
        """
        if not getattr(settings, "OPENALEX_ENABLED", True):
            logger.info("[OpenAlexCrawler] 未启用，跳过")
            return []

        exhaustive = (max_results <= 0)
        papers: List[SourcePaper] = []
        cursor = "*"
        page_count = 0

        # 构建 filter 参数
        filters: List[str] = []
        if year_from and year_to:
            filters.append(f"publication_year:{year_from}-{year_to}")
        elif year_from:
            filters.append(f"publication_year:>{year_from - 1}")
        elif year_to:
            filters.append(f"publication_year:<{year_to + 1}")

        if doc_type:
            filters.append(f"type:{doc_type}")

        if language:
            filters.append(f"language:{language}")

        if open_access is not None:
            filters.append(f"open_access.is_oa:{'true' if open_access else 'false'}")

        filter_str = ",".join(filters) if filters else None

        while True:
            per_page = self.MAX_PER_PAGE
            if not exhaustive:
                remaining = max_results - len(papers)
                if remaining <= 0:
                    break
                per_page = min(per_page, remaining)

            params: Dict[str, Any] = {
                "search": query,
                "per_page": per_page,
                "cursor": cursor,
            }

            if filter_str:
                params["filter"] = filter_str

            logger.info(
                "[OpenAlexCrawler] filtered search page=%d cursor=%s per_page=%d filter=%s",
                page_count + 1, cursor[:20] if cursor else "None", per_page,
                filter_str or "none",
            )

            resp = self._request_with_retry(params)
            if resp is None:
                break

            data = resp.json()
            results = data.get("results", []) or []
            meta = data.get("meta", {}) or {}
            next_cursor = meta.get("next_cursor")
            total_count = meta.get("count", 0)

            if page_count == 0:
                logger.info(
                    "[OpenAlexCrawler] 总计匹配 %d 篇文献（过滤后）",
                    total_count,
                )

            if not results:
                break

            for item in results:
                try:
                    paper = self._parse_item(item)
                    if paper:
                        papers.append(paper)
                except Exception as e:
                    logger.error("[OpenAlexCrawler] 解析单条记录失败: %s", e)

                if not exhaustive and len(papers) >= max_results:
                    break

            page_count += 1

            if not exhaustive and len(papers) >= max_results:
                break

            if not next_cursor:
                break

            cursor = next_cursor

        logger.info(
            "[OpenAlexCrawler] filtered search 返回 %d 条文献（%d 页）",
            len(papers), page_count,
        )
        return papers

    def _request_with_retry(
        self,
        params: Dict[str, Any],
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
                # 埋点：成功
                log_crawler_usage(
                    source="openalex",
                    endpoint=self.BASE_URL,
                    method="GET",
                    status_code=resp.status_code,
                    duration_ms=timer.elapsed_ms(),
                    success=True,
                    caller="OpenAlexCrawler._request_with_retry",
                    metadata_json={"query": params.get("search", "")[:200]},
                )
                return resp
            except httpx.HTTPStatusError as e:
                status = e.response.status_code
                if status in (429, 500, 502, 503, 504):
                    delay = (2 ** attempt) + random.uniform(1.0, 3.0)
                    logger.warning(
                        "[OpenAlexCrawler] HTTP %d，第 %d/%d 次重试，等待 %.1fs",
                        status, attempt + 1, max_retries, delay,
                    )
                    if attempt == max_retries - 1:
                        logger.error("[OpenAlexCrawler] 达到最大重试次数")
                        # 埋点：最终失败
                        log_crawler_usage(
                            source="openalex",
                            endpoint=self.BASE_URL,
                            method="GET",
                            status_code=status,
                            duration_ms=timer.elapsed_ms(),
                            success=False,
                            error=str(e)[:500],
                            caller="OpenAlexCrawler._request_with_retry",
                        )
                        return None
                    time.sleep(delay)
                else:
                    logger.error("[OpenAlexCrawler] HTTP 请求失败: %s", e)
                    log_crawler_usage(
                        source="openalex",
                        endpoint=self.BASE_URL,
                        method="GET",
                        status_code=status,
                        duration_ms=timer.elapsed_ms(),
                        success=False,
                        error=str(e)[:500],
                        caller="OpenAlexCrawler._request_with_retry",
                    )
                    return None
            except Exception as e:
                logger.error("[OpenAlexCrawler] 请求异常: %s", e)
                log_crawler_usage(
                    source="openalex",
                    endpoint=self.BASE_URL,
                    method="GET",
                    status_code=0,
                    duration_ms=timer.elapsed_ms(),
                    success=False,
                    error=str(e)[:500],
                    caller="OpenAlexCrawler._request_with_retry",
                )
                return None
        return None

    def _parse_item(self, item: dict) -> Optional[SourcePaper]:
        """
        将 OpenAlex 返回的单条 Work 映射为 SourcePaper 对象

        OpenAlex Work 字段映射：
        - title → title
        - authorships[].author.display_name → authors
        - abstract_inverted_index → abstract (需要反转还原)
        - publication_year → year
        - doi → doi (去掉 https://doi.org/ 前缀)
        - id → source_id (OpenAlex Work ID, e.g. W2741809807)
        - primary_location.source.display_name → journal
        - primary_location.landing_page_url → url
        - open_access.oa_url → pdf_url
        - primary_location.source.issn_l → issn
        - type → (用于过滤，不存入 SourcePaper)
        """
        title = item.get("title")
        if not title:
            return None

        # 作者
        authorships = item.get("authorships") or []
        authors: List[str] = []
        for auth in authorships:
            author_info = auth.get("author") or {}
            name = author_info.get("display_name")
            if name:
                authors.append(name)

        # 年份
        year = item.get("publication_year")

        # 摘要：OpenAlex 使用 inverted index 格式存储摘要
        abstract = self._reconstruct_abstract(item.get("abstract_inverted_index"))

        # DOI（去掉 URL 前缀）
        doi_raw = item.get("doi")
        doi = None
        if doi_raw:
            doi = doi_raw.replace("https://doi.org/", "").strip()

        # OpenAlex ID 作为 source_id
        source_id = item.get("id")
        if source_id:
            # 从 URL 提取 ID，如 https://openalex.org/W2741809807 → W2741809807
            source_id = source_id.split("/")[-1] if "/" in source_id else source_id

        # 主要发表位置信息
        primary_location = item.get("primary_location") or {}
        source_info = primary_location.get("source") or {}

        journal = source_info.get("display_name")
        issn = source_info.get("issn_l")
        url = primary_location.get("landing_page_url")

        # 开放获取 PDF URL
        open_access = item.get("open_access") or {}
        pdf_url = open_access.get("oa_url")

        # 关键词 (OpenAlex concepts → keywords)
        concepts = item.get("concepts") or []
        keywords: List[str] = []
        for concept in concepts[:10]:  # 取前10个概念
            name = concept.get("display_name")
            if name:
                keywords.append(name)

        # 发表日期
        published_date = None
        pub_date_str = item.get("publication_date")
        if pub_date_str:
            try:
                parts = pub_date_str.split("-")
                if len(parts) >= 3:
                    published_date = date_type(int(parts[0]), int(parts[1]), int(parts[2]))
                elif len(parts) == 2:
                    published_date = date_type(int(parts[0]), int(parts[1]), 1)
            except (ValueError, IndexError):
                pass

        paper = SourcePaper(
            title=title,
            authors=authors,
            source="openalex",
            abstract=abstract,
            year=year,
            doi=doi,
            source_id=source_id,
            journal=journal,
            issn=issn,
            published_date=published_date,
            url=url,
            pdf_url=pdf_url,
            keywords=keywords,
        )

        return paper

    @staticmethod
    def _reconstruct_abstract(inverted_index: Optional[dict]) -> Optional[str]:
        """
        从 OpenAlex 的 abstract_inverted_index 还原完整摘要文本。

        OpenAlex 的摘要以倒排索引格式存储：
        {"word1": [0, 5], "word2": [1, 3], ...}
        表示 word1 出现在位置0和5，word2 出现在位置1和3。

        需要反转还原为正常文本。
        """
        if not inverted_index or not isinstance(inverted_index, dict):
            return None

        # 构建 position → word 映射
        position_word: List[tuple] = []
        for word, positions in inverted_index.items():
            if isinstance(positions, list):
                for pos in positions:
                    if isinstance(pos, int):
                        position_word.append((pos, word))

        if not position_word:
            return None

        # 按位置排序
        position_word.sort(key=lambda x: x[0])

        # 拼接为完整文本
        abstract = " ".join(word for _, word in position_word)
        return abstract.strip() if abstract else None