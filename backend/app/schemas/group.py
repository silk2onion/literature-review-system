"""
文献分组 Pydantic 模型
"""
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel

from app.schemas.paper import PaperResponse

# --- 基础模型 ---

class GroupBase(BaseModel):
    name: str
    description: Optional[str] = None

class GroupCreate(GroupBase):
    pass

class GroupUpdate(GroupBase):
    name: Optional[str] = None

# --- 响应模型 ---

class GroupResponse(GroupBase):
    id: int
    created_at: datetime
    updated_at: datetime
    paper_count: int = 0  # 统计该组下的文献数量

    class Config:
        from_attributes = True

class GroupWithPapersResponse(GroupResponse):
    papers: List[PaperResponse] = []

# --- 操作模型 ---

class AddPapersToGroupRequest(BaseModel):
    paper_ids: List[int]

class RemovePapersFromGroupRequest(BaseModel):
    paper_ids: List[int]