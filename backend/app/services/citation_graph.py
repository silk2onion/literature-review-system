"""
引用图相关的服务：从 PaperCitation 构建自中心引用图
"""

from __future__ import annotations

import logging
from collections import Counter
from typing import Dict, List, Optional

from sqlalchemy.orm import Session

from app.models import Paper, PaperCitation
from app.schemas.citation_graph import (
    CitationGraphEdge,
    CitationGraphNode,
    CitationGraphResponse,
    CitationGraphStats,
)

logger = logging.getLogger(__name__)


class CitationGraphService:
    """基于 PaperCitation 构建单论文自中心引用图的服务"""

    def __init__(self) -> None:
        ...

    def get_ego_graph(
        self,
        db: Session,
        paper_id: int,
        min_confidence: float = 0.0,
        limit: int = 50,
    ) -> Optional[CitationGraphResponse]:
        """
        返回以指定论文为中心的一跳自中心引用图。

        注意：
        - 为了避免 Pylance 将 ORM 字段视为 Column 类型，这里统一通过 getattr 读取属性，
          并做一次类型判断/转换，保证传入 Pydantic 的都是普通 Python 类型。
        """
        center = db.query(Paper).filter(Paper.id == paper_id).first()
        if center is None:
            logger.warning("CitationGraphService: Paper(id=%s) 不存在", paper_id)
            return None

        center_id_raw = getattr(center, "id", None)
        if not isinstance(center_id_raw, int):
            logger.warning("CitationGraphService: Paper(id=%s) 的 id 类型异常", paper_id)
            return None
        center_id: int = center_id_raw

        base_q = db.query(PaperCitation).filter(
            PaperCitation.confidence >= min_confidence
        )

        outgoing = base_q.filter(PaperCitation.citing_paper_id == center_id).all()
        incoming = base_q.filter(PaperCitation.cited_paper_id == center_id).all()

        # 合并边列表，同时避免自环重复
        edges_all: List[PaperCitation] = list(outgoing)
        for e in incoming:
            citing_id = getattr(e, "citing_paper_id", None)
            if isinstance(citing_id, int) and citing_id != center_id:
                edges_all.append(e)

        if limit > 0 and len(edges_all) > limit:
            edges_all = edges_all[:limit]

        # 记录邻居节点及其角色（被引 / 引用）
        neighbor_roles: Dict[int, str] = {}

        for e in outgoing:
            cited_id = getattr(e, "cited_paper_id", None)
            if isinstance(cited_id, int) and cited_id != center_id:
                neighbor_roles[cited_id] = "cited"

        for e in incoming:
            citing_id = getattr(e, "citing_paper_id", None)
            if isinstance(citing_id, int) and citing_id != center_id:
                # 若已标记为 cited，则保持；否则标记为 citing
                neighbor_roles.setdefault(citing_id, "citing")

        neighbors: List[Paper] = []
        if neighbor_roles:
            neighbor_ids = list(neighbor_roles.keys())
            neighbors = (
                db.query(Paper)
                .filter(Paper.id.in_(neighbor_ids))
                .all()
            )

        # 构建节点
        nodes: Dict[int, CitationGraphNode] = {}

        center_title = getattr(center, "title", "") or ""
        center_label = center_title.strip() or f"Paper {center_id}"
        center_year = getattr(center, "year", None)
        if not isinstance(center_year, int):
            center_year = None
        center_source = getattr(center, "source", None)
        if not isinstance(center_source, str):
            center_source = None

        nodes[center_id] = CitationGraphNode(
            id=center_id,
            label=center_label[:120],
            type="central",
            year=center_year,
            source=center_source,
            extra=None,
        )

        paper_by_id: Dict[int, Paper] = {}
        for p in neighbors:
            pid = getattr(p, "id", None)
            if isinstance(pid, int):
                paper_by_id[pid] = p

        for pid, role in neighbor_roles.items():
            p = paper_by_id.get(pid)
            if not p:
                continue
            title = getattr(p, "title", "") or ""
            label = title.strip() or f"Paper {pid}"
            year = getattr(p, "year", None)
            if not isinstance(year, int):
                year = None
            source = getattr(p, "source", None)
            if not isinstance(source, str):
                source = None

            nodes[pid] = CitationGraphNode(
                id=pid,
                label=label[:120],
                type="cited" if role == "cited" else "citing",
                year=year,
                source=source,
                extra=None,
            )

        # 构建边
        edge_models: List[CitationGraphEdge] = []
        for e in edges_all:
            citing_id = getattr(e, "citing_paper_id", None)
            cited_id = getattr(e, "cited_paper_id", None)
            if not isinstance(citing_id, int) or not isinstance(cited_id, int):
                continue
            raw_source = getattr(e, "source", None)
            src = raw_source if isinstance(raw_source, str) else None
            confidence = getattr(e, "confidence", 1.0)
            if not isinstance(confidence, (int, float)):
                confidence = 1.0
            created_at = getattr(e, "created_at", None)

            edge_models.append(
                CitationGraphEdge(
                    **{
                        "from": citing_id,
                        "to": cited_id,
                        "source": src,
                        "confidence": float(confidence),
                        "created_at": created_at,
                    }
                )
            )

        # 统计信息
        by_source_counter: Counter[str] = Counter()
        for e in edges_all:
            raw_source = getattr(e, "source", None)
            src = raw_source if isinstance(raw_source, str) else "unknown"
            by_source_counter[src] += 1

        stats = CitationGraphStats(
            total_nodes=len(nodes),
            total_edges=len(edge_models),
            by_source=dict(by_source_counter),
            in_degree=sum(
                1
                for e in edges_all
                if getattr(e, "cited_paper_id", None) == center_id
            ),
            out_degree=sum(
                1
                for e in edges_all
                if getattr(e, "citing_paper_id", None) == center_id
            ),
        )

        return CitationGraphResponse(
            center_paper_id=center_id,
            nodes=list(nodes.values()),
            edges=edge_models,
            stats=stats,
        )


_citation_graph_service: Optional[CitationGraphService] = None


def get_citation_graph_service() -> CitationGraphService:
    """返回进程内共享的 CitationGraphService 实例"""
    global _citation_graph_service
    if _citation_graph_service is None:
        _citation_graph_service = CitationGraphService()
    return _citation_graph_service