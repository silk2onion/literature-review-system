"""
CrossRef 文献爬虫服务
通过官方 CrossRef REST API 获取正式出版物元数据

期刊与收录信息支持边界：
- CrossRef 提供期刊/会议名称 container-title 及部分出版商信息；
- 不直接提供影响因子、JCR 分区或 SCI/SSCI 等收录平台标记，
  这些高级期刊指标需要通过外部 Journal/Index 数据库进行补充。
"""
import logging
from typing import List, Optional

import httpx

from app.models.paper import Paper
from app.config import Settings

logger = logging.getLogger(__name__)


class CrossRefCrawler:
    """
    CrossRef 文献爬虫

    设计原则：
    - 只调用 CrossRef 官方 API（https://api.crossref.org/works）
    - 不做入库，只负责把结果映射为 Paper ORM 对象列表
    - 接口与 ArxivCrawler 尽量保持一致：
      search(keywords, max_results, year_from, year_to) -> List[Paper]
    """

    BASE_URL = "https://api.crossref.org/works"

    def __init__(self, settings: Settings, timeout: float = 20.0):
        self.settings = settings
        # CrossRef 官方建议提供一个有联系邮箱的 User-Agent
        ua_email = getattr(settings, "ADMIN_EMAIL", None) or "unknown@example.com"
        self.client = httpx.Client(
            timeout=timeout,
            headers={
                "User-Agent": f"lit-review-system/0.1 (mailto:{ua_email})",
                "Accept": "application/json",
            },
        )

    def search(
        self,
        keywords: List[str],
        max_results: int = 20,
        year_from: Optional[int] = None,
        year_to: Optional[int] = None,
    ) -> List[Paper]:
        """
        搜索 CrossRef 文献

        Args:
            keywords: 关键词列表，将以空格拼接为 query
            max_results: 返回的最大结果数（实际会被 rows 和条目数共同限制）
            year_from: 起始年份
            year_to: 结束年份

        Returns:
            Paper 对象列表（尚未入库）
        """
        normalized = [kw.strip() for kw in keywords if kw and kw.strip()]
        query = " ".join(normalized) if normalized else "urban design"

        # CrossRef 单次 rows 上限一般为 100，这里先不做多页抓取
        rows = min(max_results, 100)

        params = {
            "query": query,
            "rows": rows,
        }

        filters: List[str] = []
        if year_from:
            filters.append(f"from-pub-date:{year_from}-01-01")
        if year_to:
            filters.append(f"until-pub-date:{year_to}-12-31")
        if filters:
            params["filter"] = ",".join(filters)

        logger.info("[CrossRefCrawler] 请求 %s params=%s", self.BASE_URL, params)

        try:
            resp = self.client.get(self.BASE_URL, params=params)
            resp.raise_for_status()
        except Exception as e:
            logger.error("[CrossRefCrawler] 请求失败: %s", e)
            raise

        data = resp.json()
        items = data.get("message", {}).get("items", []) or []

        papers: List[Paper] = []
        for item in items:
            try:
                paper = self._parse_item(item)
                if paper:
                    papers.append(paper)
            except Exception as e:
                logger.error("[CrossRefCrawler] 解析单条记录失败: %s", e)

            if len(papers) >= max_results:
                break

        logger.info("[CrossRefCrawler] 返回 %d 条文献（请求 rows=%d）", len(papers), rows)
        return papers

    def _parse_item(self, item: dict) -> Optional[Paper]:
        """
        将 CrossRef 返回的单条 item 映射为 Paper 对象

        重要字段：
        - title
        - author
        - abstract（可能不存在）
        - published-print / published-online 年份
        - DOI
        - container-title（期刊/会议名称）
        - URL
        """
        # 标题
        titles = item.get("title") or []
        title = titles[0] if titles else None
        if not title:
            # 没有标题的记录跳过
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

        # 年份（优先 published-print，然后 published-online）
        year: Optional[int] = None

        def _extract_year(key: str) -> Optional[int]:
            v = item.get(key)
            if not v:
                return None
            parts = v.get("date-parts") or []
            if not parts or not parts[0]:
                return None
            y = parts[0][0]
            return int(y) if isinstance(y, int) else None

        year = _extract_year("published-print") or _extract_year("published-online")

        # 摘要：CrossRef 的 abstract 通常是 XML 片段，这里先直接存文本
        abstract = item.get("abstract")

        # DOI & URL
        doi = item.get("DOI")
        url = item.get("URL")

        # 期刊 / 会议名
        container_titles = item.get("container-title") or []
        journal = container_titles[0] if container_titles else None

        # 构造 Paper ORM 实例（尚未 flush 到 DB）
        paper = Paper(
            title=title,
            authors=authors,
            abstract=abstract,
            year=year,
            doi=doi,
            journal=journal,
            pdf_url=None,  # CrossRef 不直接给 PDF 链接，这里留空
            url=url,
            source="crossref",
        )

        return paper