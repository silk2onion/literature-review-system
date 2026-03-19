"""
Semantic Scholar 文献爬虫服务
通过 Semantic Scholar Academic Graph API 获取学术论文元数据

特点：
- 免费 API，无需 API Key 即可使用（1 req/sec）
- 提供 API Key 后速率限制提升至 10 req/sec
- 返回高质量元数据：标题、摘要、作者、引用量、DOI、开放获取 PDF 等
"""
import logging
import time
from typing import List, Optional

import httpx

from app.config import settings
from app.models.paper import Paper
from app.services.crawler.base_crawler import BaseCrawler
from app.services.crawler.source_models import SourcePaper

logger = logging.getLogger(__name__)


class SemanticScholarCrawler(BaseCrawler):
    """
    Semantic Scholar Academic Graph API 文献爬虫

    设计原则：
    - 只调用 Semantic Scholar 官方 API
    - 继承 BaseCrawler，实现 search_raw 返回 List[SourcePaper]
    - 与 MultiSourceOrchestrator 的无参构造约定一致
    """

    source_name: str = "semantic_scholar"

    BASE_URL = "https://api.semanticscholar.org/graph/v1/paper/search"

    # 请求的字段列表（逗号分隔）
    FIELDS = ",".join([
        "title",
        "abstract",
        "authors",
        "year",
        "externalIds",
        "url",
        "citationCount",
        "journal",
        "publicationTypes",
        "openAccessPdf",
    ])

    def __init__(self, timeout: float = 20.0) -> None:
        headers = {
            "Accept": "application/json",
        }

        # 如果配置了 API Key，加入请求头（可提升速率限制至 10 req/sec）
        api_key = getattr(settings, "SEMANTIC_SCHOLAR_API_KEY", "") or ""
        if api_key:
            headers["x-api-key"] = api_key

        self.client = httpx.Client(
            timeout=timeout,
            headers=headers,
        )

        # 无 API Key 时需要限速到 1 req/sec
        self._has_api_key = bool(api_key)
        self._min_interval = 0.15 if self._has_api_key else 1.05
        self._last_request_time = 0.0

    def _rate_limit(self):
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

        搜索 Semantic Scholar 文献，返回标准化的 SourcePaper 列表。

        Args:
            query: 关键词 / 查询表达式
            max_results: 返回的最大结果数
            offset: 分页偏移量

        Returns:
            List[SourcePaper]
        """
        # 检查是否启用
        if not getattr(settings, "SEMANTIC_SCHOLAR_ENABLED", True):
            logger.info("[SemanticScholarCrawler] 未启用，跳过")
            return []

        papers: List[SourcePaper] = []
        current_offset = offset
        # S2 API 单次最多返回 100 条
        page_size = min(max_results, 100)

        while len(papers) < max_results:
            params = {
                "query": query,
                "offset": current_offset,
                "limit": page_size,
                "fields": self.FIELDS,
            }

            logger.info(
                "[SemanticScholarCrawler] 请求 %s offset=%d limit=%d",
                self.BASE_URL, current_offset, page_size,
            )

            resp = None
            max_retries = 3
            for attempt in range(max_retries):
                self._rate_limit()
                try:
                    resp = self.client.get(self.BASE_URL, params=params)
                    resp.raise_for_status()
                    break
                except httpx.HTTPStatusError as e:
                    status = e.response.status_code
                    if status in (429, 500, 502, 503, 504):
                        delay = (2 ** attempt) + 2  # 3s, 4s, 6s
                        logger.warning(f"[SemanticScholarCrawler] API 错误 ({status})，第 {attempt + 1} 次重试，等待 {delay} 秒")
                        if attempt == max_retries - 1:
                            logger.error("[SemanticScholarCrawler] 达到最大重试次数，放弃当前页面")
                            resp = None
                            break
                        time.sleep(delay)
                    else:
                        logger.error(f"[SemanticScholarCrawler] 请求失败: {e}")
                        resp = None
                        break
                except Exception as e:
                    logger.error(f"[SemanticScholarCrawler] 未知请求失败: {e}")
                    resp = None
                    break

            if not resp:
                logger.error("[SemanticScholarCrawler] 无法获取数据，终止分页")
                break

            data = resp.json()
            items = data.get("data", []) or []
            total_available = data.get("total", 0)

            if not items:
                break

            for item in items:
                try:
                    paper = self._parse_item(item)
                    if paper:
                        papers.append(paper)
                except Exception as e:
                    logger.error("[SemanticScholarCrawler] 解析单条记录失败: %s", e)

                if len(papers) >= max_results:
                    break

            current_offset += len(items)

            # 如果已获取所有可用结果，停止分页
            if current_offset >= total_available:
                break

        logger.info(
            "[SemanticScholarCrawler] 返回 %d 条文献（请求 max_results=%d）",
            len(papers), max_results,
        )
        return papers

    def get_paper_by_s2id(self, paper_id: str) -> Optional[SourcePaper]:
        """
        通过 Semantic Scholar Paper ID 或 DOI 获取单篇文献

        Args:
            paper_id: S2 paper ID, 或 "DOI:10.xxxx/yyyy" 格式
        """
        url = f"https://api.semanticscholar.org/graph/v1/paper/{paper_id}"
        params = {"fields": self.FIELDS}

        logger.info("[SemanticScholarCrawler] 获取单篇: %s", url)

        self._rate_limit()

        try:
            resp = self.client.get(url, params=params)
            if resp.status_code == 404:
                logger.warning("[SemanticScholarCrawler] 论文未找到: %s", paper_id)
                return None
            resp.raise_for_status()

            data = resp.json()
            return self._parse_item(data)
        except Exception as e:
            logger.error("[SemanticScholarCrawler] 获取单篇失败: %s", e)
            return None

    def _parse_item(self, item: dict) -> Optional[SourcePaper]:
        """
        将 Semantic Scholar 返回的单条记录映射为 SourcePaper 对象

        字段映射：
        - title → title
        - authors[].name → authors (list)
        - abstract → abstract
        - year → year
        - externalIds.DOI → doi
        - externalIds.ArXiv → arxiv_id
        - url → url
        - openAccessPdf.url → pdf_url
        - journal.name → journal
        - citationCount → (暂无 SourcePaper 字段，跳过)
        """
        title = item.get("title")
        if not title:
            return None

        # 作者
        authors_raw = item.get("authors") or []
        authors = [a.get("name", "") for a in authors_raw if a.get("name")]

        # 年份
        year = item.get("year")

        # 摘要
        abstract = item.get("abstract")

        # 外部标识
        external_ids = item.get("externalIds") or {}
        doi = external_ids.get("DOI")
        arxiv_id = external_ids.get("ArXiv")

        # S2 内部 paper ID 作为 source_id
        source_id = item.get("paperId")

        # URL
        url = item.get("url")

        # 开放获取 PDF
        open_access = item.get("openAccessPdf") or {}
        pdf_url = open_access.get("url")

        # 期刊
        journal_info = item.get("journal") or {}
        journal = journal_info.get("name")

        paper = SourcePaper(
            title=title,
            authors=authors,
            source="semantic_scholar",
            abstract=abstract,
            year=year,
            doi=doi,
            arxiv_id=arxiv_id,
            source_id=source_id,
            journal=journal,
            url=url,
            pdf_url=pdf_url,
        )

        return paper

    # ──────────────────────────────────────────────────────────
    # 向后兼容接口：供旧的 search_across_sources 管线调用
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
            arxiv_id=sp.arxiv_id,
            url=sp.url,
            pdf_url=sp.pdf_url,
            journal=sp.journal,
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

        注意：year_from / year_to 过滤在此层通过构造 S2 API 的 year 参数实现，
        但 search_raw 本身不直接支持年份参数，因此这里做客户端侧过滤。
        """
        query = " ".join(kw.strip() for kw in keywords if kw and kw.strip())
        if not query:
            query = "urban design"

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
