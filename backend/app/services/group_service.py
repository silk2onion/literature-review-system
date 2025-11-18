from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models.group import PaperGroup, PaperGroupAssociation
from app.models.paper import Paper
from app.schemas.group import PaperGroupCreate, PaperGroupUpdate

class GroupService:
    def get_groups(self, db: Session, skip: int = 0, limit: int = 100) -> List[PaperGroup]:
        return db.query(PaperGroup).offset(skip).limit(limit).all()

    def get_groups_count(self, db: Session) -> int:
        return db.query(func.count(PaperGroup.id)).scalar()

    def get_group(self, db: Session, group_id: int) -> Optional[PaperGroup]:
        return db.query(PaperGroup).filter(PaperGroup.id == group_id).first()

    def create_group(self, db: Session, group: PaperGroupCreate) -> PaperGroup:
        db_group = PaperGroup(name=group.name, description=group.description)
        db.add(db_group)
        db.commit()
        db.refresh(db_group)
        return db_group

    def update_group(self, db: Session, group_id: int, group_update: PaperGroupUpdate) -> Optional[PaperGroup]:
        db_group = self.get_group(db, group_id)
        if not db_group:
            return None
        
        update_data = group_update.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(db_group, key, value)
            
        db.commit()
        db.refresh(db_group)
        return db_group

    def delete_group(self, db: Session, group_id: int) -> bool:
        db_group = self.get_group(db, group_id)
        if not db_group:
            return False
        
        # Delete associations first (though cascade might handle this, explicit is safer)
        db.query(PaperGroupAssociation).filter(PaperGroupAssociation.group_id == group_id).delete()
        
        db.delete(db_group)
        db.commit()
        return True

    def add_papers_to_group(self, db: Session, group_id: int, paper_ids: List[int]) -> int:
        # Verify group exists
        if not self.get_group(db, group_id):
            return 0
            
        added_count = 0
        for paper_id in paper_ids:
            # Check if association already exists
            exists = db.query(PaperGroupAssociation).filter(
                PaperGroupAssociation.group_id == group_id,
                PaperGroupAssociation.paper_id == paper_id
            ).first()
            
            if not exists:
                # Verify paper exists
                paper = db.query(Paper).filter(Paper.id == paper_id).first()
                if paper:
                    assoc = PaperGroupAssociation(group_id=group_id, paper_id=paper_id)
                    db.add(assoc)
                    added_count += 1
        
        if added_count > 0:
            db.commit()
            
        return added_count

    def remove_papers_from_group(self, db: Session, group_id: int, paper_ids: List[int]) -> int:
        deleted_count = db.query(PaperGroupAssociation).filter(
            PaperGroupAssociation.group_id == group_id,
            PaperGroupAssociation.paper_id.in_(paper_ids)
        ).delete(synchronize_session=False)
        
        db.commit()
        return deleted_count

    def get_group_papers(self, db: Session, group_id: int, skip: int = 0, limit: int = 100) -> List[Paper]:
        return db.query(Paper).join(PaperGroupAssociation).filter(
            PaperGroupAssociation.group_id == group_id
        ).offset(skip).limit(limit).all()

group_service = GroupService()