from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime

from app.database import Base

class PaperGroupAssociation(Base):
    """文献与分组的关联表"""
    __tablename__ = "paper_group_associations"
    
    group_id = Column(Integer, ForeignKey("paper_groups.id"), primary_key=True)
    paper_id = Column(Integer, ForeignKey("papers.id"), primary_key=True)
    added_at = Column(DateTime, default=datetime.utcnow)

class PaperGroup(Base):
    """文献分组"""
    __tablename__ = "paper_groups"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), unique=True, index=True, nullable=False)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # 关联
    papers = relationship("Paper", secondary="paper_group_associations", backref="groups")