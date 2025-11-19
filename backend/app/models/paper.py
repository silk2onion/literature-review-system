"""
文献数据模型
"""
from sqlalchemy import Column, Integer, String, Text, Date, JSON, DateTime, Float
from sqlalchemy.orm import relationship
from datetime import datetime, date

from app.database import Base


class Paper(Base):
    """文献模型"""
    __tablename__ = "papers"
    
    # 主键
    id = Column(Integer, primary_key=True, index=True)
    
    # 基本信息
    title = Column(String(500), nullable=False, index=True)
    authors = Column(JSON)  # 作者列表 ["作者1", "作者2"]
    abstract = Column(Text)  # 摘要
    
    # 发表信息
    publication_date = Column(Date)  # 发表日期
    year = Column(Integer, index=True)  # 发表年份
    journal = Column(String(200))  # 期刊/会议名称
    venue = Column(String(200))  # 发表场所
    journal_issn = Column(String(50))  # 期刊 ISSN
    journal_impact_factor = Column(Float)  # 期刊影响因子（来自外部期刊数据库）
    journal_quartile = Column(String(20))  # 期刊分区（如 JCR Q1-Q4 等）
    indexing = Column(JSON)  # 收录平台列表，例如 ["SCI", "SSCI", "Scopus"]
    
    # 标识信息
    doi = Column(String(100), unique=True, index=True)  # DOI
    arxiv_id = Column(String(50), index=True)  # ArXiv ID
    pmid = Column(String(50), index=True)  # PubMed ID
    url = Column(String(500))  # 论文链接
    pdf_url = Column(String(500))  # PDF链接
    pdf_path = Column(String(500))  # 本地PDF路径
    
    # 来源和分类
    source = Column(String(50), index=True)  # 数据源: google_scholar, arxiv, pubmed
    categories = Column(JSON)  # 分类标签
    keywords = Column(JSON)  # 关键词列表
    
    # 统计信息
    citations_count = Column(Integer, default=0)  # 引用数
    
    # 向量嵌入（用于语义搜索）
    embedding = Column(JSON)  # 文本嵌入向量

    # 归档/删除状态
    is_archived = Column(Integer, default=0)  # 是否归档/软删除 (0: 否, 1: 是) - SQLite Boolean is Integer
    archived_reason = Column(String(500))  # 归档原因
    archived_at = Column(DateTime)  # 归档时间
    
    # 时间戳
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # 关系
    review_papers = relationship("ReviewPaper", back_populates="paper", cascade="all, delete-orphan")
    chunks = relationship("PaperChunk", back_populates="paper", cascade="all, delete-orphan")

    
    def to_dict(self):
        """转换为字典"""
        return {
            "id": self.id,
            "title": self.title,
            "authors": self.authors,
            "abstract": self.abstract,
            "publication_date": self.publication_date.isoformat() if self.publication_date else None,
            "year": self.year,
            "journal": self.journal,
            "venue": self.venue,
            "journal_issn": self.journal_issn,
            "journal_impact_factor": self.journal_impact_factor,
            "journal_quartile": self.journal_quartile,
            "indexing": self.indexing,
            "doi": self.doi,
            "arxiv_id": self.arxiv_id,
            "pmid": self.pmid,
            "url": self.url,
            "pdf_url": self.pdf_url,
            "pdf_path": self.pdf_path,
            "source": self.source,
            "categories": self.categories,
            "keywords": self.keywords,
            "citations_count": self.citations_count,
            "is_archived": bool(self.is_archived),
            "archived_reason": self.archived_reason,
            "archived_at": self.archived_at.isoformat() if self.archived_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
    
    def __repr__(self):
        return f"<Paper(id={self.id}, title='{self.title[:50]}...')>"