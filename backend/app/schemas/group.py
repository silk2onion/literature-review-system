from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel

class PaperGroupBase(BaseModel):
    name: str
    description: Optional[str] = None

class PaperGroupCreate(PaperGroupBase):
    pass

class PaperGroupUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None

class PaperGroupRead(PaperGroupBase):
    id: int
    created_at: datetime
    updated_at: datetime
    paper_count: int = 0

    class Config:
        from_attributes = True

class PaperGroupList(BaseModel):
    groups: List[PaperGroupRead]
    total: int

class AddPapersToGroupRequest(BaseModel):
    paper_ids: List[int]

class RemovePapersFromGroupRequest(BaseModel):
    paper_ids: List[int]