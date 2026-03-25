"""
期刊信息增强服务（本地数据库优先的最小可用实现）
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import List, Optional

from sqlalchemy.orm import Session

from app.models.paper import Paper

logger = logging.getLogger(__name__)


@dataclass
class JournalInfo:
    """
    期刊元信息数据结构

    - name: 期刊名称
    - issn: 期刊 ISSN
    - impact_factor: 影响因子
    - quartile: 分区信息（如 JCR Q1-Q4 等）
    - indexing: 收录平台列表（如 SCI、SSCI、Scopus、CSSCI 等）
    """

    name: Optional[str] = None
    issn: Optional[str] = None
    impact_factor: Optional[float] = None
    quartile: Optional[str] = None
    indexing: Optional[List[str]] = None


@dataclass
class JournalEnrichResult:
    paper: Paper
    updated: bool
    message: str
    journal_info: Optional[JournalInfo] = None


class JournalInfoService:
    """
    基于本地 Paper 表复用期刊元信息的增强服务。

    当前最小实现不访问外部网络，而是：
    - 优先按 ISSN 在本地已入库 Paper 中查找同刊记录；
    - 若无 ISSN，则退化为按期刊名归并；
    - 将其他 Paper 上已有的期刊元信息回填到目标 Paper。
    """

    @staticmethod
    def _normalize_issn(value: Optional[str]) -> str:
        if not value:
            return ""
        return "".join(ch for ch in value.upper() if ch.isalnum())

    @staticmethod
    def _normalize_name(value: Optional[str]) -> str:
        if not value:
            return ""
        return " ".join(value.strip().lower().split())

    @staticmethod
    def _paper_score(paper: Paper) -> int:
        score = 0
        if getattr(paper, "journal_impact_factor", None) is not None:
            score += 4
        if getattr(paper, "journal_quartile", None):
            score += 3
        if getattr(paper, "indexing", None):
            score += 2
        if getattr(paper, "journal_issn", None):
            score += 1
        if getattr(paper, "journal", None):
            score += 1
        return score

    @staticmethod
    def _merge_indexing(candidates: List[Paper]) -> Optional[List[str]]:
        seen: set[str] = set()
        merged: List[str] = []
        for paper in candidates:
            raw = getattr(paper, "indexing", None) or []
            if not isinstance(raw, list):
                continue
            for item in raw:
                label = str(item).strip()
                key = label.lower()
                if not label or key in seen:
                    continue
                seen.add(key)
                merged.append(label)
        return merged or None

    def _build_info_from_candidates(self, candidates: List[Paper]) -> Optional[JournalInfo]:
        if not candidates:
            return None

        ranked = sorted(
            candidates,
            key=lambda paper: (
                self._paper_score(paper),
                getattr(paper, "updated_at", None) or getattr(paper, "created_at", None),
                getattr(paper, "id", 0),
            ),
            reverse=True,
        )

        return JournalInfo(
            name=next((paper.journal for paper in ranked if paper.journal), None),
            issn=next((paper.journal_issn for paper in ranked if paper.journal_issn), None),
            impact_factor=next(
                (paper.journal_impact_factor for paper in ranked if paper.journal_impact_factor is not None),
                None,
            ),
            quartile=next((paper.journal_quartile for paper in ranked if paper.journal_quartile), None),
            indexing=self._merge_indexing(ranked),
        )

    def lookup_by_issn(self, db: Session, issn: str) -> Optional[JournalInfo]:
        normalized = self._normalize_issn(issn)
        if not normalized:
            return None

        papers = db.query(Paper).filter(Paper.journal_issn.isnot(None)).all()
        candidates = [
            paper
            for paper in papers
            if self._normalize_issn(paper.journal_issn) == normalized and self._paper_score(paper) > 0
        ]

        info = self._build_info_from_candidates(candidates)
        logger.info(
            "[JournalInfoService] lookup_by_issn resolved: issn=%s matched=%s count=%d",
            issn,
            info is not None,
            len(candidates),
        )
        return info

    def lookup_by_name(self, db: Session, name: str) -> Optional[JournalInfo]:
        normalized = self._normalize_name(name)
        if not normalized:
            return None

        papers = db.query(Paper).filter(Paper.journal.isnot(None)).all()
        candidates = [
            paper
            for paper in papers
            if self._normalize_name(paper.journal) == normalized and self._paper_score(paper) > 0
        ]

        info = self._build_info_from_candidates(candidates)
        logger.info(
            "[JournalInfoService] lookup_by_name resolved: name=%s matched=%s count=%d",
            name,
            info is not None,
            len(candidates),
        )
        return info

    def enrich_paper(self, db: Session, paper: Paper) -> JournalEnrichResult:
        if not paper.journal_issn and not paper.journal:
            return JournalEnrichResult(
                paper=paper,
                updated=False,
                journal_info=None,
                message="当前论文缺少期刊名和 ISSN，无法进行期刊信息增强",
            )

        resolved: Optional[JournalInfo] = None
        matched_by = ""

        if paper.journal_issn:
            resolved = self.lookup_by_issn(db, paper.journal_issn)
            matched_by = "ISSN"

        if resolved is None and paper.journal:
            resolved = self.lookup_by_name(db, paper.journal)
            matched_by = "期刊名"

        if resolved is None:
            return JournalEnrichResult(
                paper=paper,
                updated=False,
                journal_info=None,
                message="未在本地文献库中找到可复用的期刊信息",
            )

        changed = False

        if not paper.journal and resolved.name:
            paper.journal = resolved.name
            changed = True

        if not paper.journal_issn and resolved.issn:
            paper.journal_issn = resolved.issn
            changed = True

        if paper.journal_impact_factor is None and resolved.impact_factor is not None:
            paper.journal_impact_factor = resolved.impact_factor
            changed = True

        if not paper.journal_quartile and resolved.quartile:
            paper.journal_quartile = resolved.quartile
            changed = True

        existing_indexing = paper.indexing if isinstance(paper.indexing, list) else []
        merged_indexing = list(existing_indexing)
        seen = {str(item).strip().lower() for item in merged_indexing if str(item).strip()}

        for item in resolved.indexing or []:
            label = str(item).strip()
            key = label.lower()
            if not label or key in seen:
                continue
            merged_indexing.append(label)
            seen.add(key)

        current_indexing = paper.indexing if isinstance(paper.indexing, list) else None
        if merged_indexing != (current_indexing or []):
            paper.indexing = merged_indexing or None
            changed = True

        if changed:
            db.add(paper)
            db.commit()
            db.refresh(paper)
            return JournalEnrichResult(
                paper=paper,
                updated=True,
                journal_info=resolved,
                message=f"已按{matched_by}从本地文献库补全期刊信息",
            )

        return JournalEnrichResult(
            paper=paper,
            updated=False,
            journal_info=resolved,
            message="已找到匹配期刊，但没有可新增的字段",
        )


_journal_info_service: Optional[JournalInfoService] = None


def get_journal_info_service() -> JournalInfoService:
    """返回进程内共享的 JournalInfoService 实例"""
    global _journal_info_service
    if _journal_info_service is None:
        _journal_info_service = JournalInfoService()
    return _journal_info_service