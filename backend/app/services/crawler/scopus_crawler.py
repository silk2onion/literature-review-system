
"""
Scopus 文献爬虫服务
通过 Elsevier Scopus Search API 获取学术文献元数据

Scopus Search API 文档: https://dev.elsevier.com/documentation/ScopusSearchAPI.wadl
Abstract Retrieval API 文档: https://dev.elsevier.com/documentation/AbstractRetrievalAPI.wadl

两段式策略（已通过 probe_scopus_abstract_access.py 验证）：
1. Search API 只拿轻字段（title/eid/doi/authors/journal），不请求 dc:description
2. Abstract Retrieval API (view=META) 按 EID 批量补全摘要

特点：
- 需要 Elsevier Developer API Key（机构订阅或个人申请）
- 支持布尔查询（AND/OR/AND NOT）、字段限定（TITLE-ABS-KEY 等）
- cursor-based 分页，支持穷尽检索
- 单次最多返回 25 条（count 参数上限 25）
"""
import logging
import random
import re
import time
import urllib.parse
from datetime import date as date_type
from typing import Dict, List, Optional, Tuple

import httpx

from app.config import settings
from app.services.crawler.base_crawler import BaseCrawler, CrawlerError
from app.services.crawler.source_models import SourcePaper

logger = logging.getLogger(__name__)


class ScopusCrawler(BaseCrawler):
    """
    Scopus Search API 文献爬虫（两段式策略）

    继承 BaseCrawler，实现 search_raw 返回 List[SourcePaper]。
    与 MultiSourceOrchestrator 的无参构造约定一致。

    两段式策略（已通过 probe_scopus_abstract_access.py 验证）：
    1. Search API：只拿轻字段（title/eid/doi/authors/journal），不请求 dc:description
    2. Abstract Retrieval API (view=META)：按 EID 批量补全摘要

    API 端点:
    - Search: https://api.elsevier.com/content/search/scopus
    - Abstract: https://api.elsevier.com/content/abstract/eid/{eid}
    认证方式: X-ELS-APIKey header
    分页方式: cursor-based（推荐）或 start/count offset-based
    """

    source_name: str = "scopus"

    BASE_URL = "https://api.elsevier.com/content/search/scopus"
    ABSTRACT_BASE_URL = "https://api.elsevier.com/content/abstract/eid"

    # Scopus 单次请求最大返回条数
    MAX_PAGE_SIZE = 25
    # 进程内缓存：记录已确认"不支持 cursor"的 key，避免每轮先触发一次 403
    _cursor_restricted_keys: set[str] = set()

    # ── Search API 轻字段列表 ──
    # 不包含 dc:description（已验证当前 key 下 Search 不返回摘要）
    SEARCH_FIELDS = [
        "dc:title",
        "dc:creator",
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
        "author",
        "prism:isbn",
        "openaccess",
        "link",
    ]

    def __init__(self, timeout: float = 30.0) -> None:
        self._api_key = (getattr(settings, "SCOPUS_API_KEY", "") or "").strip()
        self._enabled = getattr(settings, "SCOPUS_ENABLED", False)
        # 默认关闭 cursor 以兼容低权限 key；如需强制启用可在配置中开启。
        self._prefer_cursor = bool(getattr(settings, "SCOPUS_USE_CURSOR", False))
        self._last_error_status: Optional[int] = None
        self._last_error_body: str = ""

        headers = {
            "Accept": "application/json",
            "X-ELS-APIKey": self._api_key,
        }

        self.client = httpx.Client(
            timeout=timeout,
            headers=headers,
        )

        if self._enabled and self._api_key:
            key_tail = self._api_key[-4:] if len(self._api_key) >= 4 else self._api_key
            logger.info("[ScopusCrawler] initialized with API key ****%s", key_tail)

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

    # ═══════════════════════════════════════════════════════════════════════════
    # 主入口：search_raw（两段式）
    # ═══════════════════════════════════════════════════════════════════════════

    def search_raw(
        self,
        query: str,
        max_results: int = 50,
        offset: int = 0,
    ) -> List[SourcePaper]:
        """
        实现 BaseCrawler.search_raw 接口（两段式策略）

        Phase 1: Search API 拿轻字段（无摘要）
        Phase 2: Abstract Retrieval API 按 EID 批量补全摘要

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

        # ── Phase 1: Search API ──
        papers = self._phase1_search(query, max_results, offset=offset)

        if not papers:
            return papers

        # ── Phase 2: Abstract Retrieval 批量补摘要 ──
        self._phase2_backfill_abstracts(papers)

        return papers

    def _phase1_search(
        self,
        query: str,
        max_results: int,
        offset: int = 0,
    ) -> List[SourcePaper]:
        """
        Phase 1: 使用 Search API 获取文献元数据（不含摘要）

        返回 List[SourcePaper]，其中 abstract 字段可能为 None。
        """
        is_exhaustive = (max_results == 0)

        # 构造 Scopus 查询表达式
        scopus_query = self._build_scopus_query(query)

        papers: List[SourcePaper] = []
        cursor = "*"  # 初始 cursor
        page_count = 0
        # offset-based 步进分页与 cursor 语义不兼容；只在 offset=0 时允许 cursor。
        use_cursor = (
            self._prefer_cursor
            and offset == 0
            and (self._api_key not in self._cursor_restricted_keys)
        )

        while True:
            # 穷尽模式或还未达到 max_results
            if not is_exhaustive and len(papers) >= max_results:
                break

            count = self.MAX_PAGE_SIZE

            params = {
                "query": scopus_query,
                "count": count,
                # 双通道传递 Key：有些网关会丢自定义 Header，query 参数可提升兼容性
                "apiKey": self._api_key,
                "field": ",".join(self.SEARCH_FIELDS),
            }

            if use_cursor:
                params["cursor"] = cursor
            else:
                # 兼容低权限 key：使用 start/count 偏移分页，并支持上层步进 offset
                params["start"] = offset + (page_count * count)

            logger.info(
                "[ScopusCrawler] Phase1 请求 page=%d mode=%s start_offset=%d cursor=%s query=%s",
                page_count,
                "cursor" if use_cursor else "start/count",
                offset + (page_count * count) if not use_cursor else offset,
                cursor[:20] + "..." if len(cursor) > 20 else cursor,
                scopus_query[:80],
            )

            resp = self._request_with_retry(params)
            if resp is None:
                if (
                    use_cursor
                    and self._last_error_status == 403
                    and "cursor parameter is restricted" in (self._last_error_body or "").lower()
                ):
                    logger.warning(
                        "[ScopusCrawler] 当前 Key 无 cursor 权限，自动降级为 start/count 分页"
                    )
                    self._cursor_restricted_keys.add(self._api_key)
                    use_cursor = False
                    page_count = 0
                    continue
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
            if use_cursor:
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
            "[ScopusCrawler] Phase1 完成: %d 条文献 (max_results=%s, exhaustive=%s)",
            len(papers), max_results, (max_results == 0),
        )
        return papers

    # ═══════════════════════════════════════════════════════════════════════════
    # Phase 2: Abstract Retrieval 批量补摘要
    # ═══════════════════════════════════════════════════════════════════════════

    def _phase2_backfill_abstracts(self, papers: List[SourcePaper]) -> None:
        """
        Phase 2: 对缺少摘要的文献，通过 Abstract Retrieval API (view=META) 补全

        直接修改传入的 papers 列表中各 SourcePaper 的 abstract 字段。
        只对 source_id (EID) 存在且 abstract 为空的文献发起请求。
        """
        needs_abstract = [
            (i, p) for i, p in enumerate(papers)
            if p.source_id and not p.abstract
        ]

        if not needs_abstract:
            logger.info("[ScopusCrawler] Phase2 跳过: 所有文献已有摘要或无 EID")
            return

        logger.info(
            "[ScopusCrawler] Phase2 开始: %d/%d 条需要补摘要",
            len(needs_abstract), len(papers),
        )

        success_count = 0
        fail_count = 0

        for idx, paper in needs_abstract:
            eid = paper.source_id  # type: ignore[union-attr]
            abstract = self._fetch_abstract_by_eid(eid)
            if abstract:
                papers[idx].abstract = abstract
                success_count += 1
            else:
                fail_count += 1

        logger.info(
            "[ScopusCrawler] Phase2 完成: %d 成功, %d 失败 (共 %d 条)",
            success_count, fail_count, len(needs_abstract),
        )

    def _fetch_abstract_by_eid(self, eid: str) -> Optional[str]:
        """
        通过 Scopus Abstract Retrieval API 获取单篇文献摘要

        使用 view=META 获取 coredata 中的 dc:description 字段。
        带速率限制 + 重试 + API 埋点。

        Args:
            eid: Scopus EID (例如 "2-s2.0-85012345678")

        Returns:
            摘要文本，失败返回 None
        """
        from app.services.api_usage_service import log_crawler_usage, ApiTimer

        endpoint = f"{self.ABSTRACT_BASE_URL}/{urllib.parse.quote(eid, safe='')}"
        params = {
            "apiKey": self._api_key,
            "view": "META",
        }

        self._rate_limit()
        timer = ApiTimer()

        try:
            resp = self.client.get(endpoint, params=params)

            if resp.status_code == 404:
                logger.debug("[ScopusCrawler] Abstract not found for EID=%s", eid)
                log_crawler_usage(
                    source="scopus_abstract", endpoint=endpoint, method="GET",
                    status_code=404, duration_ms=timer.elapsed_ms(),
                    success=False, error=f"EID not found: {eid}",
                    caller="ScopusCrawler._fetch_abstract_by_eid",
                )
                return None

            if resp.status_code in (401, 403):
                body_preview = (resp.text or "")[:300]
                logger.warning(
                    "[ScopusCrawler] Abstract Retrieval 权限不足 (%d) for EID=%s",
                    resp.status_code, eid,
                )
                log_crawler_usage(
                    source="scopus_abstract", endpoint=endpoint, method="GET",
                    status_code=resp.status_code, duration_ms=timer.elapsed_ms(),
                    success=False, error=f"Auth error ({resp.status_code}): {body_preview}",
                    caller="ScopusCrawler._fetch_abstract_by_eid",
                )
                return None

            resp.raise_for_status()

            data = resp.json()

            # 从 Abstract Retrieval 响应中提取摘要
            # 结构: {"abstracts-retrieval-response": {"coredata": {"dc:description": "..."}}}
            coredata = (
                data
                .get("abstracts-retrieval-response", {})
                .get("coredata", {})
            )
            abstract = coredata.get("dc:description")

            # 有些响应里摘要在 coredata.dc:description 的 $ 或 #text 子字段
            if isinstance(abstract, dict):
                abstract = abstract.get("$") or abstract.get("#text") or str(abstract)

            if abstract and isinstance(abstract, str):
                abstract = abstract.strip()

            log_crawler_usage(
                source="scopus_abstract", endpoint=endpoint, method="GET",
                status_code=resp.status_code, duration_ms=timer.elapsed_ms(),
                success=True,
                result_count=1 if abstract else 0,
                caller="ScopusCrawler._fetch_abstract_by_eid",
                metadata_json={"eid": eid, "abstract_len": len(abstract) if abstract else 0},
            )

            return abstract if abstract else None

        except httpx.HTTPStatusError as e:
            status = e.response.status_code
            if status == 429:
                # 429 时等待一下再返回 None（上层不重试单条）
                retry_after_raw = e.response.headers.get("Retry-After", "3")
                retry_after = int(retry_after_raw) if retry_after_raw.isdigit() else 3
                logger.warning(
                    "[ScopusCrawler] Abstract Retrieval 429 for EID=%s, 等待 %ds",
                    eid, retry_after,
                )
                time.sleep(min(retry_after, 30))

            log_crawler_usage(
                source="scopus_abstract", endpoint=endpoint, method="GET",
                status_code=status, duration_ms=timer.elapsed_ms(),
                success=False, error=str(e)[:500],
                caller="ScopusCrawler._fetch_abstract_by_eid",
            )
            return None

        except Exception as e:
            logger.error(
                "[ScopusCrawler] Abstract Retrieval 异常 for EID=%s: %s", eid, e,
            )
            log_crawler_usage(
                source="scopus_abstract", endpoint=endpoint, method="GET",
                status_code=0, duration_ms=timer.elapsed_ms(),
                success=False, error=str(e)[:500],
                caller="ScopusCrawler._fetch_abstract_by_eid",
            )
            return None

    # ═══════════════════════════════════════════════════════════════════════════
    # Search API 请求层
    # ═══════════════════════════════════════════════════════════════════════════

    def _request_with_retry(
        self,
        params: dict,
        max_retries: int = 4,
    ) -> Optional[httpx.Response]:
        """带随机抖动重试的 HTTP 请求（修复 429 死循环）"""
        from app.services.api_usage_service import log_crawler_usage, ApiTimer

        self._last_error_status = None
        self._last_error_body = ""

        for attempt in range(max_retries):
            self._rate_limit()
            timer = ApiTimer()
            try:
                resp = self.client.get(self.BASE_URL, params=params)

                # Scopus 特殊状态码处理
                if resp.status_code == 401:
                    body_preview = (resp.text or "")[:300]
                    self._last_error_status = 401
                    self._last_error_body = body_preview
                    logger.error("[ScopusCrawler] API Key 无效/未授权 (401), body=%s", body_preview)
                    log_crawler_usage(
                        source="scopus", endpoint=self.BASE_URL, method="GET",
                        status_code=401, duration_ms=timer.elapsed_ms(),
                        success=False, error=(f"API Key invalid or unauthorized (401): {body_preview}"),
                        caller="ScopusCrawler._request_with_retry",
                    )
                    return None
                if resp.status_code == 403:
                    body_preview = (resp.text or "")[:500]
                    self._last_error_status = 403
                    self._last_error_body = body_preview
                    logger.error(
                        "[ScopusCrawler] 权限不足 (403), body=%s",
                        body_preview,
                    )
                    log_crawler_usage(
                        source="scopus", endpoint=self.BASE_URL, method="GET",
                        status_code=403, duration_ms=timer.elapsed_ms(),
                        success=False, error=(f"Insufficient permissions (403): {body_preview}"),
                        caller="ScopusCrawler._request_with_retry",
                    )
                    return None

                resp.raise_for_status()
                # 埋点：成功
                log_crawler_usage(
                    source="scopus", endpoint=self.BASE_URL, method="GET",
                    status_code=resp.status_code, duration_ms=timer.elapsed_ms(),
                    success=True, caller="ScopusCrawler._request_with_retry",
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
                        "[ScopusCrawler] 速率限制 (429)，第 %d/%d 次重试，等待 %.1f 秒",
                        attempt + 1, max_retries, delay,
                    )
                    if attempt == max_retries - 1:
                        logger.error("[ScopusCrawler] 429 达到最大重试次数，放弃")
                        log_crawler_usage(
                            source="scopus", endpoint=self.BASE_URL, method="GET",
                            status_code=429, duration_ms=timer.elapsed_ms(),
                            success=False, error=str(e)[:500],
                            caller="ScopusCrawler._request_with_retry",
                        )
                        return None
                    time.sleep(delay)
                elif status in (500, 502, 503, 504):
                    delay = (2 ** attempt) + random.uniform(1.0, 3.0)
                    logger.warning(
                        "[ScopusCrawler] 服务器错误 (%d)，第 %d/%d 次重试，等待 %.1f 秒",
                        status, attempt + 1, max_retries, delay,
                    )
                    if attempt == max_retries - 1:
                        logger.error("[ScopusCrawler] 达到最大重试次数，放弃")
                        log_crawler_usage(
                            source="scopus", endpoint=self.BASE_URL, method="GET",
                            status_code=status, duration_ms=timer.elapsed_ms(),
                            success=False, error=str(e)[:500],
                            caller="ScopusCrawler._request_with_retry",
                        )
                        return None
                    time.sleep(delay)
                else:
                    logger.error("[ScopusCrawler] HTTP 错误: %s", e)
                    self._last_error_status = status
                    self._last_error_body = (e.response.text or "")[:500]
                    log_crawler_usage(
                        source="scopus", endpoint=self.BASE_URL, method="GET",
                        status_code=status, duration_ms=timer.elapsed_ms(),
                        success=False, error=str(e)[:500],
                        caller="ScopusCrawler._request_with_retry",
                    )
                    return None
            except Exception as e:
                logger.error("[ScopusCrawler] 请求异常: %s", e)
                if attempt < max_retries - 1:
                    time.sleep(2 + random.uniform(0.5, 1.5))
                else:
                    log_crawler_usage(
                        source="scopus", endpoint=self.BASE_URL, method="GET",
                        status_code=0, duration_ms=timer.elapsed_ms(),
                        success=False, error=str(e)[:500],
                        caller="ScopusCrawler._request_with_retry",
                    )
                    return None

        logger.error("[ScopusCrawler] 达到最大重试次数 %d，放弃", max_retries)
        return None

    # ═══════════════════════════════════════════════════════════════════════════
    # 查询构造 & 响应解析
    # ═══════════════════════════════════════════════════════════════════════════

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
                parsed = urllib.parse.urlparse(href)
                qs = urllib.parse.parse_qs(parsed.query)
                cursor_values = qs.get("cursor", [])
                if cursor_values:
                    return cursor_values[0]
        return None

    def _parse_entry(self, entry: dict) -> Optional[SourcePaper]:
        """
        将 Scopus Search API 返回的单条 entry 映射为 SourcePaper 对象

        注意：两段式策略下，Search API 不请求 dc:description，
        摘要由 Phase 2 的 Abstract Retrieval 补全。
        但如果 Search 意外返回了 dc:description，仍然保留。

        字段映射：
        - dc:title → title
        - dc:creator → authors (主作者)
        - author → authors (完整列表，优先使用)
        - dc:description → abstract (通常为 None)
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

        # 摘要：Search API 通常不返回（两段式策略），但保留兼容性
        abstract = entry.get("dc:description")

        # 年份和日期
        cover_date = entry.get("prism:coverDate")  # 格式: "2024-01-15"
        year = None
        published_date = None
        if cover_date:
            try:
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
            conference = journal  # 会议论文时，publicationName 就是会议名

        # URL: 优先使用 Scopus 详情页链接
        url = None
        links = entry.get("link", [])
        if isinstance(links, list):
            for link in links:
                if link.get("@ref") == "scopus":
                    url = link.get("@href")
                    break
        if not url:
            url = entry.get("prism:url")

        # ISSN
        issn = entry.get("prism:issn")

        # 关键词
        keywords: List[str] = []
        auth_keywords = entry.get("authkeywords")
        if auth_keywords and isinstance(auth_keywords, str):
            # Scopus 返回的关键词以 " | " 分隔
            keywords = [k.strip() for k in auth_keywords.split("|") if k.strip()]

        return SourcePaper(
            source="scopus",
            source_id=eid,
            title=title,
            authors=authors,
            abstract=abstract,
            year=year,
            doi=doi,
            url=url,
            journal=journal,
            conference=conference,
            issn=issn,
            keywords=keywords,
            published_date=published_date,
        )
