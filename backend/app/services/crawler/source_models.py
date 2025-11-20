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
    # 来源 (必须字段，需放在有默认值的字段之前)
    source: str
    
    abstract: Optional[str] = None
    year: Optional[int] = None

    # 标识字段
    doi: Optional[str] = None
    arxiv_id: Optional[str] = None

    # 来源内部ID（例如 scopus 的 EID，serpapi 的 result_id）
    source_id: Optional[str] = None

    # 出版相关信息
    journal: Optional[str] = None
    conference: Optional[str] = None
    publisher: Optional[str] = None
    issn: Optional[str] = None
    published_date: Optional[date] = None

    # 访问链接
    url: Optional[str] = None
    pdf_url: Optional[str] = None

    # 主题/分类信息
    keywords: List[str] = None
    categories: List[str] = None

    # 期刊评价指标 (新增)
    journal_impact_factor: Optional[float] = None
    journal_quartile: Optional[str] = None  # e.g. "Q1", "Q2"
    indexing: Optional[List[str]] = None    # e.g. ["SCI", "SSCI"]