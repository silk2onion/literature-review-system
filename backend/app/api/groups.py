"""
文献分组 API 路由
"""
from typing import List
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.group import (
    GroupCreate, 
    GroupUpdate, 
    GroupResponse, 
    AddPapersToGroupRequest,
    RemovePapersFromGroupRequest
)
from app.schemas.paper import PaperResponse
from app.services.group_service import GroupService

router = APIRouter(
    prefix="/api/groups",
    tags=["groups"],
    responses={404: {"description": "Not found"}},
)

@router.post("/", response_model=GroupResponse)
def create_group(
    group_in: GroupCreate,
    db: Session = Depends(get_db)
):
    """创建新分组"""
    return GroupService.create_group(db, group_in)

@router.get("/", response_model=List[GroupResponse])
def get_groups(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """获取分组列表"""
    return GroupService.get_groups(db, skip=skip, limit=limit)

@router.get("/{group_id}", response_model=GroupResponse)
def get_group(
    group_id: int,
    db: Session = Depends(get_db)
):
    """获取单个分组详情"""
    group = GroupService.get_group(db, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    return group

@router.put("/{group_id}", response_model=GroupResponse)
def update_group(
    group_id: int,
    group_in: GroupUpdate,
    db: Session = Depends(get_db)
):
    """更新分组"""
    group = GroupService.update_group(db, group_id, group_in)
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    return group

@router.delete("/{group_id}")
def delete_group(
    group_id: int,
    db: Session = Depends(get_db)
):
    """删除分组"""
    success = GroupService.delete_group(db, group_id)
    if not success:
        raise HTTPException(status_code=404, detail="Group not found")
    return {"success": True}

@router.post("/{group_id}/papers", response_model=dict)
def add_papers_to_group(
    group_id: int,
    request: AddPapersToGroupRequest,
    db: Session = Depends(get_db)
):
    """批量添加文献到分组"""
    count = GroupService.add_papers_to_group(db, group_id, request.paper_ids)
    return {"added_count": count}

@router.delete("/{group_id}/papers", response_model=dict)
def remove_papers_from_group(
    group_id: int,
    request: RemovePapersFromGroupRequest,
    db: Session = Depends(get_db)
):
    """批量从分组移除文献"""
    count = GroupService.remove_papers_from_group(db, group_id, request.paper_ids)
    return {"removed_count": count}

@router.get("/{group_id}/papers", response_model=List[PaperResponse])
def get_group_papers(
    group_id: int,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """获取分组下的文献列表"""
    # 检查分组是否存在
    group = GroupService.get_group(db, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
        
    return GroupService.get_group_papers(db, group_id, skip=skip, limit=limit)