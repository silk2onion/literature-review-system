"""
文献引用网络分析服务

功能：
1. 基于引用图进行社区发现（Community Detection），生成 "Cluster X" 标签
2. 基于发表年份生成 "Generation X" 标签（如 2020s, 2010s）
3. 基于被引次数生成 "Impact" 标签（如 High Impact, Seminal）
"""

import logging
from typing import Dict, List, Optional, Set, Tuple
import networkx as nx
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.citation import PaperCitation
from app.models.paper import Paper
from app.models.tag import Tag, PaperTag

logger = logging.getLogger(__name__)

class CitationAnalysisService:
    def __init__(self):
        pass

    def analyze_network(self, db: Session) -> Dict[str, int]:
        """
        执行全量引用网络分析，生成并更新标签。
        """
        stats = {
            "generation_tags": 0,
            "impact_tags": 0,
            "cluster_tags": 0,
        }

        # 1. 世代标签 (Generation)
        stats["generation_tags"] = self._assign_generation_tags(db)

        # 2. 影响力标签 (Impact)
        stats["impact_tags"] = self._assign_impact_tags(db)

        # 3. 引用聚类标签 (Cluster)
        stats["cluster_tags"] = self._assign_cluster_tags(db)

        return stats

    def _get_or_create_tag(self, db: Session, key: str, category: str, name: str) -> Tag:
        tag = db.query(Tag).filter(Tag.key == key, Tag.category == category).first()
        if not tag:
            tag = Tag(
                key=key,
                category=category,
                name=name,
                source="citation_analysis",
                meta={}
            )
            db.add(tag)
            db.flush()
        return tag

    def _link_paper_tag(self, db: Session, paper_id: int, tag_id: int, weight: float = 1.0):
        # Check if exists
        exists = db.query(PaperTag).filter(
            PaperTag.paper_id == paper_id,
            PaperTag.tag_id == tag_id
        ).first()
        
        if not exists:
            pt = PaperTag(
                paper_id=paper_id,
                tag_id=tag_id,
                source="citation_analysis",
                weight=weight
            )
            db.add(pt)

    def _assign_generation_tags(self, db: Session) -> int:
        """
        为所有有年份的论文分配世代标签 (e.g., "gen_2020s")
        """
        papers = db.query(Paper.id, Paper.year).filter(Paper.year.isnot(None)).all()
        count = 0
        
        # Cache tags to avoid repeated queries
        tag_cache = {}

        for pid, year in papers:
            if not year:
                continue
            
            decade = (year // 10) * 10
            tag_key = f"gen_{decade}s"
            tag_name = f"{decade}s"
            
            if tag_key not in tag_cache:
                tag_cache[tag_key] = self._get_or_create_tag(db, tag_key, "generation", tag_name)
            
            tag = tag_cache[tag_key]
            self._link_paper_tag(db, pid, int(tag.id))  # type: ignore
            count += 1
        
        db.commit()
        return count

    def _assign_impact_tags(self, db: Session) -> int:
        """
        基于被引次数百分位分配影响力标签
        Top 1% -> Seminal
        Top 5% -> High Impact
        Top 20% -> Significant
        """
        # 获取所有被引次数 > 0 的论文
        papers = db.query(Paper.id, Paper.citations_count)\
            .filter(Paper.citations_count > 0)\
            .order_by(Paper.citations_count.desc())\
            .all()
        
        if not papers:
            return 0

        total = len(papers)
        count = 0

        # Create tags
        tag_seminal = self._get_or_create_tag(db, "impact_seminal", "impact", "Seminal Work")
        tag_high = self._get_or_create_tag(db, "impact_high", "impact", "High Impact")
        tag_sig = self._get_or_create_tag(db, "impact_significant", "impact", "Significant")

        for i, (pid, citations) in enumerate(papers):
            percentile = (i / total) * 100
            
            if percentile <= 1:
                self._link_paper_tag(db, pid, int(tag_seminal.id), weight=1.0)  # type: ignore
                count += 1
            elif percentile <= 5:
                self._link_paper_tag(db, pid, int(tag_high.id), weight=0.9)  # type: ignore
                count += 1
            elif percentile <= 20:
                self._link_paper_tag(db, pid, int(tag_sig.id), weight=0.8)  # type: ignore
                count += 1
        
        db.commit()
        return count

    def _assign_cluster_tags(self, db: Session) -> int:
        """
        构建引用图并进行社区发现
        """
        # 1. Build Graph
        edges = db.query(PaperCitation.citing_paper_id, PaperCitation.cited_paper_id).all()
        if not edges:
            return 0
            
        G = nx.Graph() # Treat as undirected for simple community detection
        # Convert Row objects to tuples
        edge_tuples = [(r[0], r[1]) for r in edges]
        G.add_edges_from(edge_tuples)
        
        # Remove small components (optional, but good for noise reduction)
        # G = nx.subgraph(G, max(nx.connected_components(G), key=len)) 

        # 2. Detect Communities (Label Propagation is fast)
        # communities is a generator of sets
        communities = list(nx.community.label_propagation_communities(G))
        
        # Filter small communities
        valid_communities = [c for c in communities if len(c) >= 5]
        
        # Sort by size desc
        valid_communities.sort(key=len, reverse=True)
        
        count = 0
        # Limit to top 20 clusters to avoid tag explosion
        for idx, community in enumerate(valid_communities[:20]):
            cluster_id = idx + 1
            tag_key = f"cluster_{cluster_id}"
            tag_name = f"Cluster {cluster_id}"
            
            tag = self._get_or_create_tag(db, tag_key, "citation_cluster", tag_name)
            
            # Update tag meta with size
            # Pylance may complain about Column[JSON] not being iterable/dict, but at runtime it is.
            current_meta = tag.meta if tag.meta is not None else {}  # type: ignore
            if isinstance(current_meta, dict):
                meta = dict(current_meta)
            else:
                meta = {}
            
            meta["size"] = len(community)
            tag.meta = meta  # type: ignore
            db.add(tag)
            
            for pid in community:
                self._link_paper_tag(db, pid, int(tag.id))  # type: ignore
                count += 1
                
        db.commit()
        return count

_citation_analysis_service: Optional[CitationAnalysisService] = None

def get_citation_analysis_service() -> CitationAnalysisService:
    global _citation_analysis_service
    if _citation_analysis_service is None:
        _citation_analysis_service = CitationAnalysisService()
    return _citation_analysis_service