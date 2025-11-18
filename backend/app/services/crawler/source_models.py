from dataclasses import dataclass
from datetime import date
from typing import List, Optional


@dataclass
class SourcePaper:
    """
    统一的跨数据源文献中间模型

    所有具体爬虫（arxiv / crossref / scopus / scholar 等）都先转成 SourcePaper，
    再由上层逻辑负责入库到 Paper 模型并做去重与字段合并。
    """

    # 核心元数据
    title: str
    authors: List[str]
    abstract: Optional[str]
    year: Optional[int]

    # 标识字段
    doi: Optional[str]
    arxiv_id: Optional[str]

    # 来源与来源内部ID（例如 scopus 的 EID，serpapi 的 result_id）
    source: str
    source_id: Optional[str]

    # 出版相关信息
    journal: Optional[str]
    conference: Optional[str]
    publisher: Optional[str]
    issn: Optional[str]
    published_date: Optional[date]

    # 访问链接
    url: Optional[str]
    pdf_url: Optional[str]

    # 主题/分类信息
    keywords: List[str]
    categories: List[str]

    # 期刊评价指标 (新增)
    journal_impact_factor: Optional[float] = None
    journal_quartile: Optional[str] = None  # e.g. "Q1", "Q2"
    indexing: Optional[List[str]] = None    # e.g. ["SCI", "SSCI"]