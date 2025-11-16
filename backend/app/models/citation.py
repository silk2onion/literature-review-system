"""
文献引用关系数据模型
"""
from datetime import datetime

from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Float, UniqueConstraint, JSON
from sqlalchemy.orm import relationship

from app.database import Base


class PaperCitation(Base):
    """
    文献引用关系

    - 记录 citing_paper_id -> cited_paper_id
    - 来源可以是外部数据库（Scopus / Crossref）或 LLM 解析
    - 置信度用于后续过滤与图算法加权
    """

    __tablename__ = "paper_citations"

    id = Column(Integer, primary_key=True, index=True)

    # 引用关系两端
    citing_paper_id = Column(
        Integer,
        ForeignKey("papers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    cited_paper_id = Column(
        Integer,
        ForeignKey("papers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # 来源信息：scopus / crossref / llm_parsed 等
    source = Column(String(50), nullable=True, index=True)
    source_meta = Column(JSON, nullable=True)

    # 0-1 置信度，用于后续图算法加权
    confidence = Column(Float, default=1.0)

    # 时间戳
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # 关系
    citing_paper = relationship("Paper", foreign_keys=[citing_paper_id])
    cited_paper = relationship("Paper", foreign_keys=[cited_paper_id])

    __table_args__ = (
        # 同一对引用只保留一条记录
        UniqueConstraint(
            "citing_paper_id",
            "cited_paper_id",
            name="uq_paper_citation_pair",
        ),
    )

    def __repr__(self) -> str:
        return (
            f"PaperCitation(citing_paper_id={self.citing_paper_id}, "
            f"cited_paper_id={self.cited_paper_id}, confidence={self.confidence})"
        )