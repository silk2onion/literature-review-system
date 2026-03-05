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

from app.models.paper import Paper
from app.config import Settings

logger = logging.getLogger(__name__)


class SemanticScholarCrawler:
    """
    Semantic Scholar Academic Graph API 文献爬虫

    设计原则：
    - 只调用 Semantic Scholar 官方 API
    - 不做入库，只负责把结果映射为 Paper ORM 对象列表
    - 接口与 CrossRefCrawler / ArxivCrawler 保持一致：
      search(keywords, max_results, year_from, year_to) -> List[Paper]
    """

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

    def __init__(self, settings: Settings, timeout: float = 20.0):
        self.settings = settings

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

    def search(
        self,
        keywords: List[str],
        max_results: int = 20,
        year_from: Optional[int] = None,
        year_to: Optional[int] = None,
    ) -> List[Paper]:
        """
        搜索 Semantic Scholar 文献

        Args:
            keywords: 关键词列表，将以空格拼接为 query
            max_results: 返回的最大结果数
            year_from: 起始年份（含）
            year_to: 结束年份（含）

        Returns:
            Paper 对象列表（尚未入库）
        """
        # 检查是否启用
        if not getattr(self.settings, "SEMANTIC_SCHOLAR_ENABLED", True):
            logger.info("[SemanticScholarCrawler] 未启用，跳过")
            return []

        normalized = [kw.strip() for kw in keywords if kw and kw.strip()]
        query = " ".join(normalized) if normalized else "urban design"

        papers: List[Paper] = []
        offset = 0
        # S2 API 单次最多返回 100 条
        page_size = min(max_results, 100)

        while len(papers) < max_results:
            params = {
                "query": query,
                "offset": offset,
                "limit": page_size,
                "fields": self.FIELDS,
            }

            # 年份过滤：S2 API 支持 year 参数格式 "2020-2024"
            if year_from or year_to:
                y_from = str(year_from) if year_from else ""
                y_to = str(year_to) if year_to else ""
                params["year"] = f"{y_from}-{y_to}"

            logger.info(
                "[SemanticScholarCrawler] 请求 %s offset=%d limit=%d",
                self.BASE_URL, offset, page_size,
            )

            self._rate_limit()

            try:
                resp = self.client.get(self.BASE_URL, params=params)
                resp.raise_for_status()
            except httpx.HTTPStatusError as e:
                if e.response.status_code == 429:
                    # 被限速，等待后重试一次
                    logger.warning("[SemanticScholarCrawler] 被限速 (429)，等待 3 秒后重试")
                    time.sleep(3)
                    try:
                        resp = self.client.get(self.BASE_URL, params=params)
                        resp.raise_for_status()
                    except Exception as retry_e:
                        logger.error("[SemanticScholarCrawler] 重试失败: %s", retry_e)
                        break
                else:
                    logger.error("[SemanticScholarCrawler] 请求失败: %s", e)
                    raise
            except Exception as e:
                logger.error("[SemanticScholarCrawler] 请求失败: %s", e)
                raise

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

            offset += len(items)

            # 如果已获取所有可用结果，停止分页
            if offset >= total_available:
                break

        logger.info(
            "[SemanticScholarCrawler] 返回 %d 条文献（请求 max_results=%d）",
            len(papers), max_results,
        )
        return papers

    def get_paper_by_s2id(self, paper_id: str) -> Optional[Paper]:
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

    def _parse_item(self, item: dict) -> Optional[Paper]:
        """
        将 Semantic Scholar 返回的单条记录映射为 Paper 对象

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
        - citationCount → citations_count
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

        # URL
        url = item.get("url")

        # 开放获取 PDF
        open_access = item.get("openAccessPdf") or {}
        pdf_url = open_access.get("url")

        # 期刊
        journal_info = item.get("journal") or {}
        journal = journal_info.get("name")

        # 引用量
        citation_count = item.get("citationCount") or 0

        paper = Paper(
            title=title,
            authors=authors,
            abstract=abstract,
            year=year,
            doi=doi,
            arxiv_id=arxiv_id,
            url=url,
            pdf_url=pdf_url,
            journal=journal,
            citations_count=citation_count,
            source="semantic_scholar",
        )

        return paper
