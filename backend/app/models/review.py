"""
综述数据模型
"""
from sqlalchemy import Column, Integer, String, Text, JSON, DateTime, ForeignKey, Table
from sqlalchemy.orm import relationship
from datetime import datetime

from app.database import Base


class Review(Base):
    """综述模型"""
    __tablename__ = "reviews"
    
    # 主键
    id = Column(Integer, primary_key=True, index=True)
    
    # 基本信息
    title = Column(String(500), nullable=False)
    keywords = Column(JSON)  # 搜索关键词列表
    
    # 综述内容
    framework = Column(JSON)  # 综述框架结构（大纲）
    content = Column(Text)  # 综述正文内容
    abstract = Column(Text)  # 综述摘要
    analysis_json = Column(JSON)  # 结构化分析数据（例如 timeline / topics），用于前端可视化
    
    # 状态
    status = Column(String(50), default="draft")  # draft, generating, completed, failed
    
    # 配置
    language = Column(String(10), default="zh-CN")  # 生成语言
    model_config = Column(JSON)  # LLM配置参数
    
    # 统计
    paper_count = Column(Integer, default=0)  # 引用文献数量
    word_count = Column(Integer, default=0)  # 字数统计
    
    # 时间戳
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    completed_at = Column(DateTime)  # 完成时间
    
    # 关系
    review_papers = relationship("ReviewPaper", back_populates="review", cascade="all, delete-orphan")
    
    def to_dict(self, include_content=True):
        """转换为字典"""
        data = {
            "id": self.id,
            "title": self.title,
            "keywords": self.keywords,
            "framework": self.framework,
            "abstract": self.abstract,
            "status": self.status,
            "language": self.language,
            "paper_count": self.paper_count,
            "word_count": self.word_count,
            "created_at": self.created_at.isoformat() if self.created_at is not None else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at is not None else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at is not None else None,
        }
        
        # 内容可能很大，按需包含
        if include_content:
            data["content"] = self.content
            
        return data
    
    def __repr__(self):
        return f"<Review(id={self.id}, title='{self.title[:50]}...', status='{self.status}')>"


class ReviewPaper(Base):
    """综述-文献关联表"""
    __tablename__ = "review_papers"
    
    id = Column(Integer, primary_key=True, index=True)
    review_id = Column(Integer, ForeignKey("reviews.id", ondelete="CASCADE"), nullable=False, index=True)
    paper_id = Column(Integer, ForeignKey("papers.id", ondelete="CASCADE"), nullable=False, index=True)
    
    # 排序和备注
    order_index = Column(Integer, default=0)  # 在综述中的顺序
    notes = Column(Text)  # 备注说明
    
    # 时间戳
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # 关系
    review = relationship("Review", back_populates="review_papers")
    paper = relationship("Paper", back_populates="review_papers")
    
    def to_dict(self):
        """转换为字典"""
        return {
            "id": self.id,
            "review_id": self.review_id,
            "paper_id": self.paper_id,
            "order_index": self.order_index,
            "notes": self.notes,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
    
    def __repr__(self):
        return f"<ReviewPaper(review_id={self.review_id}, paper_id={self.paper_id})>"