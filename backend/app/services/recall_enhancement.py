"""
召回增强服务
基于用户交互日志 (RecallLog) 更新标签图 (Tag Graph) 的权重，实现自学习。
"""
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Optional, cast, Any

from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models.recall_log import RecallLog
from app.models.tag import Tag, TagGroup, TagGroupTag
from app.models.citation import PaperCitation
from app.models.paper import Paper
from app.services.semantic_groups import get_semantic_group_service

logger = logging.getLogger(__name__)

class RecallEnhancementService:
    def __init__(self, db: Session):
        self.db = db

    def sync_static_groups_to_db(self):
        """
        将静态配置的语义组 (semantic_groups.json) 同步到数据库 Tag/TagGroup 表中。
        作为图的初始化状态。
        """
        sg_service = get_semantic_group_service()
        static_groups = sg_service.groups

        logger.info(f"开始同步 {len(static_groups)} 个静态语义组到数据库...")

        for group_key, group_data in static_groups.items():
            # 1. Ensure TagGroup exists
            # group_key is like "步行性与街道活力" (name) or "walkability" (key)?
            # In semantic_groups.py, keys are names like "步行性与街道活力".
            # We should probably use a normalized key.
            
            # For simplicity, let's use the dictionary key as both name and key (if unique), 
            # or generate a key.
            # The static config keys are Chinese names usually.
            group_name = group_key
            # Simple key generation: hash or pinyin or just use name if it's unique enough
            # Let's use the name as key for now, but be careful about length.
            db_group = self.db.query(TagGroup).filter(TagGroup.key == group_name).first()
            if not db_group:
                db_group = TagGroup(
                    name=group_name,
                    key=group_name,
                    group_type="semantic_group",
                    description=f"From static config, weight={group_data.get('weight')}",
                    meta={"static_weight": group_data.get("weight")}
                )
                self.db.add(db_group)
                self.db.flush() # get ID

            # 2. Ensure Tags exist and are linked
            words = group_data.get("words", [])
            for word in words:
                if not word:
                    continue
                
                tag_key = word.strip().lower()
                tag_name = word.strip()
                
                db_tag = self.db.query(Tag).filter(Tag.key == tag_key).first()
                if not db_tag:
                    db_tag = Tag(
                        name=tag_name,
                        key=tag_key,
                        category="keyword",
                        source="static_config"
                    )
                    self.db.add(db_tag)
                    self.db.flush()
                
                # 3. Link Tag to Group
                link = self.db.query(TagGroupTag).filter(
                    TagGroupTag.group_id == db_group.id,
                    TagGroupTag.tag_id == db_tag.id
                ).first()
                
                if not link:
                    link = TagGroupTag(
                        group_id=db_group.id,
                        tag_id=db_tag.id,
                        weight=1.0 # Initial weight
                    )
                    self.db.add(link)
        
        self.db.commit()
        logger.info("静态语义组同步完成")

    def analyze_logs_and_update_graph(self, time_window_minutes: int = 60):
        """
        分析最近的交互日志，更新图权重。
        
        策略：
        1. 找出 'click' 或 'accept' 类型的日志。
        2. 提取日志中的 query_keywords (用户搜的词) 和 group_keys (当时激活的组)。
        3. 强化 query_keywords 中的词与 group_keys 中的组之间的关联 (TagGroupTag)。
        """
        cutoff_time = datetime.utcnow() - timedelta(minutes=time_window_minutes)
        
        # Fetch unprocessed logs (or just recent ones)
        # Ideally we should mark logs as processed, but for now let's just look at recent ones
        # and maybe use an idempotent update strategy or a 'processed' flag in future.
        # For this MVP, we'll just process recent logs and accept some double-counting if run frequently,
        # or we can add a 'processed' column to RecallLog later.
        # Let's assume this runs periodically and we might overlap. 
        # To avoid massive over-weighting, we'll use small increments.
        
        logs = self.db.query(RecallLog).filter(
            RecallLog.created_at >= cutoff_time,
            RecallLog.event_type.in_(["click", "accept"])
        ).all()
        
        if not logs:
            logger.info("没有发现新的交互日志")
            return

        logger.info(f"开始分析 {len(logs)} 条交互日志...")
        
        updates_count = 0
        
        for log in logs:
            # log.query_keywords: List[str] e.g. ["urban", "design"]
            # log.group_keys: List[str] e.g. ["步行性与街道活力"]
            
            # Explicitly check for None to satisfy linter and runtime safety
            # Cast to Any to avoid Pylance confusion between Column and instance value
            q_keywords = cast(List[str], log.query_keywords)
            g_keys = cast(List[str], log.group_keys)
            
            if not q_keywords or not g_keys:
                continue
                
            # Weight increment: click=0.1, accept=0.5 (stronger signal)
            # Ensure event_type is treated as string
            event_type = str(log.event_type)
            increment = 0.1 if event_type == "click" else 0.5
            
            for group_key in g_keys:
                # Find the group
                group = self.db.query(TagGroup).filter(TagGroup.key == group_key).first()
                if not group:
                    continue
                
                for keyword in q_keywords:
                    tag_key = keyword.strip().lower()
                    
                    # Find the tag (keyword)
                    tag = self.db.query(Tag).filter(Tag.key == tag_key).first()
                    if not tag:
                        # If tag doesn't exist, create it (learned from user query)
                        tag = Tag(
                            name=keyword,
                            key=tag_key,
                            category="user_query",
                            source="learned_from_log"
                        )
                        self.db.add(tag)
                        self.db.flush()
                    
                    # Update or Create Link
                    link = self.db.query(TagGroupTag).filter(
                        TagGroupTag.group_id == group.id,
                        TagGroupTag.tag_id == tag.id
                    ).first()
                    
                    if link:
                        # Cast to float to avoid Pylance confusion
                        current_weight = float(cast(float, link.weight) or 0.0)
                        new_weight = current_weight + increment
                        # Cap weight to avoid explosion? Or let it grow.
                        # Let's cap at 10.0 for now.
                        if new_weight > 10.0:
                            new_weight = 10.0
                        link.weight = new_weight # type: ignore
                    else:
                        link = TagGroupTag(
                            group_id=group.id,
                            tag_id=tag.id,
                            weight=1.0 + increment
                        )
                        self.db.add(link)
                    
                    updates_count += 1
        
        self.db.commit()
        logger.info(f"图权重更新完成，共更新 {updates_count} 条边")

    def expand_keywords_using_graph(self, keywords: List[str], limit: int = 10) -> Dict[str, float]:
        """
        利用图结构（Tag -> TagGroup -> Tag）对关键词进行扩展。
        返回扩展词及其关联强度。
        """
        if not keywords:
            return {}
            
        # 1. 找到输入关键词对应的 Tag ID
        # Normalize keywords
        normalized_keys = [k.strip().lower() for k in keywords if k.strip()]
        if not normalized_keys:
            return {}
            
        initial_tags = self.db.query(Tag).filter(Tag.key.in_(normalized_keys)).all()
        if not initial_tags:
            return {}
            
        # Explicit cast to int for IDs
        initial_tag_ids = [int(t.id) for t in initial_tags]
        
        # 2. 找到这些 Tag 所属的 TagGroup (Tag -> TagGroup)
        # 关联强度 = TagGroupTag.weight
        group_relations = (
            self.db.query(TagGroupTag)
            .filter(TagGroupTag.tag_id.in_(initial_tag_ids))
            .all()
        )
        
        group_scores: Dict[int, float] = {}
        for rel in group_relations:
            try:
                gid = int(getattr(rel, "group_id"))
                w = float(getattr(rel, "weight") or 1.0)
                # 累加分数 (如果多个关键词都指向同一个组，该组得分更高)
                group_scores[gid] = group_scores.get(gid, 0.0) + w
            except Exception:
                continue
                
        if not group_scores:
            return {}
            
        # 3. 从 TagGroup 扩散回 Tag (TagGroup -> Tag)
        # 限制只查询得分最高的几个组，避免扩散太广
        top_groups = sorted(group_scores.items(), key=lambda x: x[1], reverse=True)[:5]
        top_group_ids = [g[0] for g in top_groups]
        
        # 查找这些组下的所有标签
        expanded_relations = (
            self.db.query(TagGroupTag)
            .filter(TagGroupTag.group_id.in_(top_group_ids))
            .all()
        )
        
        tag_scores: Dict[int, float] = {}
        for rel in expanded_relations:
            try:
                tid = int(getattr(rel, "tag_id"))
                gid = int(getattr(rel, "group_id"))
                w = float(getattr(rel, "weight") or 1.0)
                
                # 扩展词得分 = 组得分 * (关联权重 / 组内总权重?) 
                # 简单起见：扩展词得分 = 组得分 * 关联权重 * 衰减因子
                group_score = group_scores.get(gid, 0.0)
                score = group_score * w * 0.5 # 0.5 为衰减因子
                
                tag_scores[tid] = tag_scores.get(tid, 0.0) + score
            except Exception:
                continue
                
        # 移除原始关键词对应的 Tag
        for tid in initial_tag_ids:
            if tid in tag_scores:
                del tag_scores[tid]
                
        if not tag_scores:
            return {}
            
        # 4. 获取 Tag 的文本内容
        top_tag_ids = sorted(tag_scores.keys(), key=lambda k: tag_scores[k], reverse=True)[:limit]
        
        result_tags = self.db.query(Tag).filter(Tag.id.in_(top_tag_ids)).all()
        
        final_result: Dict[str, float] = {}
        for t in result_tags:
            # Explicit cast
            tid = int(t.id)
            tname = str(t.name)
            score = tag_scores.get(tid, 0.0)
            final_result[tname] = score
            
        return final_result

    def expand_candidates_using_citation_graph(
        self,
        seed_paper_ids: List[int],
        limit: int = 20,
        include_cited_by: bool = True,
        include_citing: bool = True
    ) -> Dict[int, float]:
        """
        利用引用图扩展候选文献。
        
        Args:
            seed_paper_ids: 种子文献 ID 列表 (通常是第一轮检索的 Top K)
            limit: 返回的最大扩展数量
            include_cited_by: 是否包含种子文献引用的文献 (Foundational work)
            include_citing: 是否包含引用了种子文献的文献 (Follow-up work)
            
        Returns:
            Dict[paper_id, score]: 扩展文献 ID 及其推荐分数
        """
        if not seed_paper_ids:
            return {}
            
        scores: Dict[int, float] = {}
        
        # 1. Outgoing Citations (Foundational Work)
        # 种子文献引用了谁？ -> 可能是该领域的基础文献
        if include_cited_by:
            outgoing = (
                self.db.query(PaperCitation)
                .filter(PaperCitation.citing_paper_id.in_(seed_paper_ids))
                .all()
            )
            for cit in outgoing:
                try:
                    cited_id = int(getattr(cit, "cited_paper_id"))
                    # 排除种子本身
                    if cited_id in seed_paper_ids:
                        continue
                    # 简单计分：被多少个种子文献引用
                    scores[cited_id] = scores.get(cited_id, 0.0) + 1.0
                except Exception:
                    continue
                    
        # 2. Incoming Citations (Follow-up Work)
        # 谁引用了种子文献？ -> 可能是该领域的最新进展
        if include_citing:
            incoming = (
                self.db.query(PaperCitation)
                .filter(PaperCitation.cited_paper_id.in_(seed_paper_ids))
                .all()
            )
            for cit in incoming:
                try:
                    citing_id = int(getattr(cit, "citing_paper_id"))
                    # 排除种子本身
                    if citing_id in seed_paper_ids:
                        continue
                    # 简单计分：引用了多少个种子文献
                    scores[citing_id] = scores.get(citing_id, 0.0) + 1.0
                except Exception:
                    continue
        
        if not scores:
            return {}
            
        # 3. 过滤掉已经在种子列表中的 (双重检查)
        for seed_id in seed_paper_ids:
            if seed_id in scores:
                del scores[seed_id]
                
        # 4. 排序并截断
        # 按分数降序
        sorted_items = sorted(scores.items(), key=lambda x: x[1], reverse=True)
        top_items = sorted_items[:limit]
        
        return dict(top_items)
