"""
文献分组服务层
"""
from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models.group import LiteratureGroup, LiteratureGroupPaper
from app.models.paper import Paper
from app.schemas.group import GroupCreate, GroupUpdate

class GroupService:
    
    @staticmethod
    def get_groups(db: Session, skip: int = 0, limit: int = 100) -> List[LiteratureGroup]:
        """获取分组列表，包含文献数量统计"""
        # 使用子查询或 join 统计文献数量
        # 这里为了简单，先获取 group，再在 response model 中通过 property 或 hybrid property 处理
        # 或者直接在 query 中 annotate
        
        groups = db.query(LiteratureGroup).order_by(LiteratureGroup.updated_at.desc()).offset(skip).limit(limit).all()
        
        # 填充 paper_count
        for group in groups:
            count = db.query(func.count(LiteratureGroupPaper.id)).filter(LiteratureGroupPaper.group_id == group.id).scalar()
            group.paper_count = count
            
        return groups

    @staticmethod
    def get_group(db: Session, group_id: int) -> Optional[LiteratureGroup]:
        """获取单个分组详情"""
        group = db.query(LiteratureGroup).filter(LiteratureGroup.id == group_id).first()
        if group:
            count = db.query(func.count(LiteratureGroupPaper.id)).filter(LiteratureGroupPaper.group_id == group.id).scalar()
            group.paper_count = count
        return group

    @staticmethod
    def create_group(db: Session, group_in: GroupCreate) -> LiteratureGroup:
        """创建分组"""
        db_group = LiteratureGroup(
            name=group_in.name,
            description=group_in.description
        )
        db.add(db_group)
        db.commit()
        db.refresh(db_group)
        db_group.paper_count = 0
        return db_group

    @staticmethod
    def update_group(db: Session, group_id: int, group_in: GroupUpdate) -> Optional[LiteratureGroup]:
        """更新分组"""
        db_group = db.query(LiteratureGroup).filter(LiteratureGroup.id == group_id).first()
        if not db_group:
            return None
        
        if group_in.name is not None:
            db_group.name = group_in.name
        if group_in.description is not None:
            db_group.description = group_in.description
            
        db.commit()
        db.refresh(db_group)
        
        # 重新计算 count
        count = db.query(func.count(LiteratureGroupPaper.id)).filter(LiteratureGroupPaper.group_id == db_group.id).scalar()
        db_group.paper_count = count
        
        return db_group

    @staticmethod
    def delete_group(db: Session, group_id: int) -> bool:
        """删除分组"""
        db_group = db.query(LiteratureGroup).filter(LiteratureGroup.id == group_id).first()
        if not db_group:
            return False
        
        db.delete(db_group)
        db.commit()
        return True

    @staticmethod
    def add_papers_to_group(db: Session, group_id: int, paper_ids: List[int]) -> int:
        """批量添加文献到分组"""
        # 检查分组是否存在
        group = db.query(LiteratureGroup).filter(LiteratureGroup.id == group_id).first()
        if not group:
            return 0
            
        added_count = 0
        for paper_id in paper_ids:
            # 检查文献是否存在
            paper = db.query(Paper).filter(Paper.id == paper_id).first()
            if not paper:
                continue
                
            # 检查是否已存在关联
            exists = db.query(LiteratureGroupPaper).filter(
                LiteratureGroupPaper.group_id == group_id,
                LiteratureGroupPaper.paper_id == paper_id
            ).first()
            
            if not exists:
                association = LiteratureGroupPaper(group_id=group_id, paper_id=paper_id)
                db.add(association)
                added_count += 1
        
        if added_count > 0:
            db.commit()
            
        return added_count

    @staticmethod
    def remove_papers_from_group(db: Session, group_id: int, paper_ids: List[int]) -> int:
        """批量从分组移除文献"""
        deleted_count = db.query(LiteratureGroupPaper).filter(
            LiteratureGroupPaper.group_id == group_id,
            LiteratureGroupPaper.paper_id.in_(paper_ids)
        ).delete(synchronize_session=False)
        
        db.commit()
        return deleted_count

    @staticmethod
    def get_group_papers(db: Session, group_id: int, skip: int = 0, limit: int = 100) -> List[Paper]:
        """获取分组下的文献列表"""
        papers = db.query(Paper).join(LiteratureGroupPaper).filter(
            LiteratureGroupPaper.group_id == group_id
        ).offset(skip).limit(limit).all()
        return papers