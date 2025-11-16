"""
标签与标签组相关的 Pydantic schemas
"""
from datetime import datetime
from typing import Optional, Dict, Any

from pydantic import BaseModel, Field


class TagBase(BaseModel):
    """标签基础字段"""
    name: str = Field(..., description="标签名称，用于展示")
    key: str = Field(..., description="规范化 key，便于去重与匹配")
    category: Optional[str] = Field(default=None, description="标签类别，如 topic/method/place/citation_derived")
    source: Optional[str] = Field(default=None, description="标签来源，如 manual/semantic_group/llm/citation_graph")
    meta: Optional[Dict[str, Any]] = Field(default=None, description="额外元信息")


class TagCreate(TagBase):
    """创建标签请求"""
    pass


class TagResponse(TagBase):
    """标签响应"""
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class TagGroupBase(BaseModel):
    """标签组基础字段"""
    name: str = Field(..., description="标签组名称")
    key: str = Field(..., description="机器可读 key，例如 tod_street_vitality")
    group_type: Optional[str] = Field(default=None, description="标签组类型，如 semantic_group/user_defined/llm_cluster")
    description: Optional[str] = Field(default=None, description="标签组描述")
    meta: Optional[Dict[str, Any]] = Field(default=None, description="额外元信息")


class TagGroupCreate(TagGroupBase):
    """创建标签组请求"""
    pass


class TagGroupResponse(TagGroupBase):
    """标签组响应"""
    id: int
    papers_count: int = Field(default=0, description="该标签组覆盖的文献数量统计")
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class PaperTagBase(BaseModel):
    """文献-标签关联基础字段"""
    paper_id: int = Field(..., description="文献 ID")
    tag_id: int = Field(..., description="标签 ID")
    source: Optional[str] = Field(default=None, description="关联来源，如 manual/llm/semantic_group/citation_graph")
    weight: float = Field(default=1.0, description="重要性/置信度 0-1")


class PaperTagCreate(PaperTagBase):
    """创建文献-标签关联请求"""
    pass


class PaperTagResponse(PaperTagBase):
    """文献-标签关联响应"""
    id: int
    created_at: datetime

    class Config:
        from_attributes = True