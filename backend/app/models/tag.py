"""
标签与标签图数据模型
"""
from datetime import datetime

from sqlalchemy import Column, Integer, String, DateTime, JSON, ForeignKey, UniqueConstraint, Float
from sqlalchemy.orm import relationship

from app.database import Base


class Tag(Base):
    """
    语义标签

    - 用于描述主题、方法、案例类型等
    - 可以由人工、语义组、LLM 等多种方式产生
    """
    __tablename__ = "tags"

    id = Column(Integer, primary_key=True, index=True)

    # 标签标识
    name = Column(String(200), nullable=False, index=True)
    # 规范化 key，便于去重与匹配，例如 "TOD" -> "tod"
    key = Column(String(200), nullable=False, index=True)

    # 类别：topic / method / dataset / place / citation_derived 等
    category = Column(String(50), nullable=True, index=True)

    # 来源信息：manual / semantic_group / llm / citation_graph 等
    source = Column(String(50), nullable=True, index=True)

    # JSON 元信息，例如来自哪个语义组、置信度等
    meta = Column(JSON, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # 关系
    paper_tags = relationship("PaperTag", back_populates="tag", cascade="all, delete-orphan")
    tag_group_tags = relationship("TagGroupTag", back_populates="tag", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("key", "category", name="uq_tags_key_category"),
    )

    def __repr__(self) -> str:
        return f"Tag(id={self.id}, key={self.key}, category={self.category})"


class TagGroup(Base):
    """
    标签组

    - 一组在语义上相关的标签，用于召回增强与可视化
    - 例如: "TOD + 街道活力" 这样的组合
    """
    __tablename__ = "tag_groups"

    id = Column(Integer, primary_key=True, index=True)

    name = Column(String(255), nullable=False, index=True)
    # 机器可读 key，例如 "tod_street_vitality"
    key = Column(String(255), nullable=False, unique=True)

    # 分组类型：semantic_group / user_defined / llm_cluster 等
    group_type = Column(String(50), nullable=True, index=True)

    description = Column(String(500), nullable=True)

    # 统计与元信息
    meta = Column(JSON, nullable=True)
    papers_count = Column(Integer, default=0)

    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # 关系
    tags = relationship("TagGroupTag", back_populates="group", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"TagGroup(id={self.id}, key={self.key})"


class PaperTag(Base):
    """
    文献-标签关联

    - 记录某篇文献被打上某个标签
    - 包含简单权重，用于后续自学习调节
    """
    __tablename__ = "paper_tags"

    id = Column(Integer, primary_key=True, index=True)
    paper_id = Column(Integer, ForeignKey("papers.id", ondelete="CASCADE"), nullable=False, index=True)
    tag_id = Column(Integer, ForeignKey("tags.id", ondelete="CASCADE"), nullable=False, index=True)

    # 关联来源：manual / llm / semantic_group / citation_graph 等
    source = Column(String(50), nullable=True, index=True)

    # 重要性/置信度 (0-1)，可用于召回重排
    weight = Column(Float, default=1.0)

    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    # 关系
    tag = relationship("Tag", back_populates="paper_tags")

    __table_args__ = (
        UniqueConstraint("paper_id", "tag_id", name="uq_paper_tag_unique"),
    )

    def __repr__(self) -> str:
        return f"PaperTag(paper_id={self.paper_id}, tag_id={self.tag_id}, weight={self.weight})"


class TagGroupTag(Base):
    """
    标签组-标签关联

    - 记录某个标签属于哪些标签组
    - 可带权重，支持软 membership
    """
    __tablename__ = "tag_group_tags"

    id = Column(Integer, primary_key=True, index=True)
    group_id = Column(Integer, ForeignKey("tag_groups.id", ondelete="CASCADE"), nullable=False, index=True)
    tag_id = Column(Integer, ForeignKey("tags.id", ondelete="CASCADE"), nullable=False, index=True)

    weight = Column(Float, default=1.0)

    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    group = relationship("TagGroup", back_populates="tags")
    tag = relationship("Tag", back_populates="tag_group_tags")

    __table_args__ = (
        UniqueConstraint("group_id", "tag_id", name="uq_tag_group_tag_unique"),
    )

    def __repr__(self) -> str:
        return f"TagGroupTag(group_id={self.group_id}, tag_id={self.tag_id}, weight={self.weight})"