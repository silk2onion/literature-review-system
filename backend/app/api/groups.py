from typing import List
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.database import get_db
from app.schemas.group import (
    PaperGroupCreate,
    PaperGroupUpdate,
    PaperGroupRead,
    PaperGroupList,
    AddPapersToGroupRequest,
    RemovePapersFromGroupRequest
)
from app.schemas.paper import PaperResponse
from app.services.group_service import group_service

router = APIRouter()

@router.get("/", response_model=PaperGroupList)
def get_groups(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    groups = group_service.get_groups(db, skip=skip, limit=limit)
    total = group_service.get_groups_count(db)
    
    # Calculate paper count for each group
    # Note: This could be optimized with a join in the service layer if performance becomes an issue
    group_reads = []
    for group in groups:
        group_read = PaperGroupRead.model_validate(group)
        group_read.paper_count = len(group.papers)
        group_reads.append(group_read)
        
    return PaperGroupList(groups=group_reads, total=total)

@router.post("/", response_model=PaperGroupRead)
def create_group(
    group_in: PaperGroupCreate,
    db: Session = Depends(get_db)
):
    group = group_service.create_group(db, group_in)
    return group

@router.get("/{group_id}", response_model=PaperGroupRead)
def get_group(
    group_id: int,
    db: Session = Depends(get_db)
):
    group = group_service.get_group(db, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    group_read = PaperGroupRead.model_validate(group)
    group_read.paper_count = len(group.papers)
    return group_read

@router.put("/{group_id}", response_model=PaperGroupRead)
def update_group(
    group_id: int,
    group_in: PaperGroupUpdate,
    db: Session = Depends(get_db)
):
    group = group_service.update_group(db, group_id, group_in)
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    group_read = PaperGroupRead.model_validate(group)
    group_read.paper_count = len(group.papers)
    return group_read

@router.delete("/{group_id}", response_model=bool)
def delete_group(
    group_id: int,
    db: Session = Depends(get_db)
):
    success = group_service.delete_group(db, group_id)
    if not success:
        raise HTTPException(status_code=404, detail="Group not found")
    return True

@router.post("/{group_id}/papers", response_model=int)
def add_papers_to_group(
    group_id: int,
    request: AddPapersToGroupRequest,
    db: Session = Depends(get_db)
):
    count = group_service.add_papers_to_group(db, group_id, request.paper_ids)
    return count

@router.delete("/{group_id}/papers", response_model=int)
def remove_papers_from_group(
    group_id: int,
    request: RemovePapersFromGroupRequest,
    db: Session = Depends(get_db)
):
    count = group_service.remove_papers_from_group(db, group_id, request.paper_ids)
    return count

@router.get("/{group_id}/papers", response_model=List[PaperResponse])
def get_group_papers(
    group_id: int,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    group = group_service.get_group(db, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
        
    papers = group_service.get_group_papers(db, group_id, skip=skip, limit=limit)
    return papers