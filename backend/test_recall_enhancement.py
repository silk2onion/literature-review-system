import logging
import sys
import os
from datetime import datetime
from typing import cast

# Add backend directory to path
sys.path.append(os.path.join(os.path.dirname(__file__), "app"))

from app.database import SessionLocal
from app.services.recall_enhancement import RecallEnhancementService
from app.services.semantic_search import get_semantic_search_service
from app.models.recall_log import RecallLog
from app.models.tag import Tag, TagGroup, TagGroupTag

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def test_recall_enhancement():
    db = SessionLocal()
    recall_service = RecallEnhancementService(db)
    search_service = get_semantic_search_service()

    try:
        # 1. Setup: Ensure we have a test group and tags
        logger.info("--- 1. Setup Test Data ---")
        group_key = "test_group_urban"
        group = db.query(TagGroup).filter(TagGroup.key == group_key).first()
        if not group:
            group = TagGroup(name="Test Urban Group", key=group_key, group_type="semantic_group")
            db.add(group)
            db.commit()
            db.refresh(group)
        
        # Create tags: "urban_A" (query), "urban_B" (related in group)
        tag_a = db.query(Tag).filter(Tag.key == "urban_a").first()
        if not tag_a:
            tag_a = Tag(name="Urban A", key="urban_a", category="keyword")
            db.add(tag_a)
        
        tag_b = db.query(Tag).filter(Tag.key == "urban_b").first()
        if not tag_b:
            tag_b = Tag(name="Urban B", key="urban_b", category="keyword")
            db.add(tag_b)
            
        db.commit()
        db.refresh(tag_a)
        db.refresh(tag_b)

        # Link Tag B to Group (strong link)
        link_b = db.query(TagGroupTag).filter(TagGroupTag.group_id == group.id, TagGroupTag.tag_id == tag_b.id).first()
        if not link_b:
            link_b = TagGroupTag(group_id=group.id, tag_id=tag_b.id, weight=2.0)
            db.add(link_b)
        else:
            link_b.weight = 2.0 # type: ignore
            
        # Link Tag A to Group (weak or no link initially)
        link_a = db.query(TagGroupTag).filter(TagGroupTag.group_id == group.id, TagGroupTag.tag_id == tag_a.id).first()
        if link_a:
            # Reset weight for test
            link_a.weight = 0.1 # type: ignore
        else:
            link_a = TagGroupTag(group_id=group.id, tag_id=tag_a.id, weight=0.1)
            db.add(link_a)
            
        db.commit()
        
        # 2. Baseline Check: Search for "Urban A"
        logger.info("--- 2. Baseline Search ---")
        # We use expand_keywords_using_graph directly to see if B appears
        expanded_1 = recall_service.expand_keywords_using_graph(["Urban A"])
        logger.info(f"Initial expansion for 'Urban A': {expanded_1}")
        
        # 3. Simulate Interaction: User searches "Urban A" and clicks result in "Test Urban Group"
        logger.info("--- 3. Simulate Interaction ---")
        # Create a log entry
        log = RecallLog(
            event_type="click",
            source="test",
            query_keywords=["Urban A"],
            group_keys=[group_key], # The result was associated with this group
            extra={}
        )
        db.add(log)
        db.commit()
        
        # 4. Run Analysis
        logger.info("--- 4. Run Analysis ---")
        recall_service.analyze_logs_and_update_graph(time_window_minutes=5)
        
        # 5. Verify Update
        logger.info("--- 5. Verify Update ---")
        db.refresh(link_a)
        logger.info(f"Updated weight for Urban A -> Group: {link_a.weight}")
        
        # 6. Check Expansion Again
        logger.info("--- 6. Post-Learning Search ---")
        expanded_2 = recall_service.expand_keywords_using_graph(["Urban A"])
        logger.info(f"Post-learning expansion for 'Urban A': {expanded_2}")
        
        if "Urban B" in expanded_2:
            logger.info("SUCCESS: 'Urban B' found in expansion!")
        else:
            logger.warning("FAILURE: 'Urban B' NOT found in expansion.")
            
    except Exception as e:
        logger.exception("Test failed")
    finally:
        db.close()

if __name__ == "__main__":
    test_recall_enhancement()