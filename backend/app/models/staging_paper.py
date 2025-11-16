"""
暂存文献数据模型
"""
from datetime import datetime, date
from typing import Optional, List, Dict, Any

from sqlalchemy import Column, Integer, String, Text, Date, JSON, DateTime, Float, ForeignKey
from sqlalchemy.orm import relationship

from app.database import Base


class StagingPaper(Base):
    """
    暂存文献模型

    - 保存从各个爬虫渠道抓取的“原始”文献元数据
    - 不直接参与 RAG 检索，用于人工 / LLM 筛选后再提升为正式 Paper
    - 提升后仍然保留原始记录，便于与正式库对比真实度
    """

    __tablename__ = "staging_papers"

    id = Column(Integer, primary_key=True, index=True)

    # 基本信息（与 Paper 对齐，确保原始数据完整可追溯）
    title = Column(String(500), nullable=False, index=True)
    authors = Column(JSON)  # 作者列表 ["作者1", "作者2"]
    abstract = Column(Text)

    # 发表信息
    publication_date = Column(Date)
    year = Column(Integer, index=True)
    journal = Column(String(200))
    venue = Column(String(200))
    journal_issn = Column(String(50))
    journal_impact_factor = Column(Float)
    journal_quartile = Column(String(20))
    indexing = Column(JSON)

    # 标识信息
    doi = Column(String(100), index=True)
    arxiv_id = Column(String(50), index=True)
    pmid = Column(String(50), index=True)
    url = Column(String(500))
    pdf_url = Column(String(500))
    pdf_path = Column(String(500))

    # 来源和分类
    source = Column(String(50), index=True)
    source_id = Column(String(100), index=True)  # 源站内部 ID（如 Scopus EID、SerpAPI result_id）
    categories = Column(JSON)
    keywords = Column(JSON)

    # 统计信息
    citations_count = Column(Integer, default=0)

    # 抓取与审核流程元数据
    crawl_job_id = Column(Integer, ForeignKey("crawl_jobs.id"), nullable=True, index=True)
    status = Column(
        String(20),
        default="pending",
        index=True,
    )  # pending / accepted / rejected 等状态
    llm_tags = Column(JSON)  # LLM 打标信息（主题、类型、相关度标签等）
    llm_score = Column(Float)  # LLM 评估分数（相关度/质量等）

    # 若已提升到正式库，则记录对应的 Paper.id，方便比对
    final_paper_id = Column(Integer, ForeignKey("papers.id"), nullable=True, index=True)

    # 时间戳
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self) -> str:
        return f"<StagingPaper(id={self.id}, title='{(self.title or '')[:50]}...')>"