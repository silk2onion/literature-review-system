"""
文献引用同步服务：从外部引用源（Crossref 等）获取引用关系并写入本地 PaperCitation
"""

from __future__ import annotations

import logging
from typing import Dict, List, Optional

import httpx
from sqlalchemy.orm import Session

from app.models.citation import PaperCitation
from app.models.paper import Paper
from app.services.embedding_service import get_embedding_service

logger = logging.getLogger(__name__)


def _normalize_str(value: Optional[str]) -> Optional[str]:
    """轻量字符串标准化：去空格，空串视为 None"""
    if value is None:
        return None
    value = str(value).strip()
    return value or None


class CitationIngestService:
    """
    文献引用同步服务

    当前实现：
    - 仅基于 Crossref /works/{doi} 接口获取引用列表
    - 通过 DOI 或 (title + year) 尝试匹配本地 Paper
    - 对成功匹配的引用写入 PaperCitation 记录，并更新被引次数
    - 为后续接入 OpenAlex / Scopus / LLM 解析预留扩展点
    """

    def __init__(self, crossref_base_url: str = "https://api.crossref.org") -> None:
        self.crossref_base_url = crossref_base_url.rstrip("/")

    # -------- Crossref 引用获取 --------
    def _fetch_crossref_references(self, doi: str) -> List[Dict]:
        """
        从 Crossref 获取某 DOI 的引用列表。

        返回 Crossref reference 列表（原始字典），失败时返回空列表。
        """
        doi_norm = _normalize_str(doi)
        if not doi_norm:
            return []

        url = f"{self.crossref_base_url}/works/{doi_norm}"
        try:
            resp = httpx.get(url, timeout=20.0)
            resp.raise_for_status()
            data = resp.json()
        except Exception as exc:  # noqa: BLE001
            logger.warning("[citation_ingest] Crossref 请求失败 doi=%s error=%s", doi_norm, exc)
            return []

        message = data.get("message") or {}
        refs = message.get("reference") or []
        if not isinstance(refs, list):
            return []
        return [ref for ref in refs if isinstance(ref, dict)]

    def _normalize_crossref_reference(self, ref: Dict) -> Dict[str, Optional[object]]:
        """
        将 Crossref reference 归一化为 {doi, title, year} 结构，字段可能为 None。
        """
        doi = _normalize_str(ref.get("DOI") or ref.get("doi"))
        title: Optional[str] = None
        for key in ("article-title", "journal-title", "series-title", "volume-title", "unstructured"):
            raw = ref.get(key)
            if isinstance(raw, str) and raw.strip():
                title = raw.strip()
                break

        year: Optional[int] = None
        raw_year = ref.get("year") or ref.get("issued")
        # Crossref 里 year 既可能是 int/str，也可能在 issued.date-parts 里
        if isinstance(raw_year, (int, str)):
            try:
                year = int(str(raw_year)[:4])
            except ValueError:  # noqa: PERF203
                year = None
        elif isinstance(raw_year, dict):
            parts = raw_year.get("date-parts") or raw_year.get("date_parts")
            if isinstance(parts, list) and parts and isinstance(parts[0], (list, tuple)) and parts[0]:
                try:
                    year = int(str(parts[0][0])[:4])
                except (ValueError, TypeError):  # noqa: PERF203
                    year = None

        return {"doi": doi, "title": title, "year": year}

    # -------- 本地 Paper 匹配 --------
    def _resolve_reference_to_paper_id(
        self, db: Session, citing_paper: Paper, ref_norm: Dict[str, Optional[object]]
    ) -> Optional[int]:
        """
        根据归一化引用信息在本地 Paper 表中查找匹配文献。

        匹配策略：
        1. 优先使用 DOI 精确匹配（不区分大小写）；
        2. 退化为 title.lower() + year 匹配。
        """
        citing_id = getattr(citing_paper, "id", None)
        if not isinstance(citing_id, int):
            return None

        doi = ref_norm.get("doi")
        title = ref_norm.get("title")
        year = ref_norm.get("year")

        # 1) DOI 匹配
        if isinstance(doi, str) and doi.strip():
            doi_norm = doi.strip().lower()
            paper = (
                db.query(Paper)
                .filter(Paper.doi.isnot(None))
                .filter(Paper.doi.ilike(doi_norm))
                .first()
            )
            if paper is not None:
                pid = getattr(paper, "id", None)
                return pid if isinstance(pid, int) else None

        # 2) title + year 匹配
        if isinstance(title, str) and title.strip():
            title_norm = title.strip().lower()
            q = db.query(Paper).filter(Paper.title.isnot(None))
            # 这里使用 ilike 精确匹配规范化后的标题；后续可根据需要改为包含匹配
            q = q.filter(Paper.title.ilike(title_norm))
            if isinstance(year, int):
                q = q.filter(Paper.year == year)
            paper = q.first()
            if paper is not None:
                pid = getattr(paper, "id", None)
                return pid if isinstance(pid, int) else None

        return None

    async def _create_placeholder_paper_for_reference(
        self,
        db: Session,
        ref_norm: Dict[str, Optional[object]],
    ) -> Optional[int]:
        """
        当引用在本地未匹配到任何 Paper 且包含 DOI 时，基于引用信息创建一个占位 Paper。

        只填充最小必要字段：
        - title: 尽量使用引用中的标题；若缺失则回退到 DOI
        - year: 引用中解析出的年份（可为空）
        - doi: 引用 DOI
        - source: 标记为 crossref_citation_only，便于后续区分
        """
        doi = ref_norm.get("doi")
        if not isinstance(doi, str) or not doi.strip():
            return None

        doi_norm = doi.strip().lower()

        # 双重保障：再次确认不存在同 DOI 的 Paper（避免并发下重复插入）
        existing = (
            db.query(Paper)
            .filter(Paper.doi.isnot(None))
            .filter(Paper.doi.ilike(doi_norm))
            .first()
        )
        if existing is not None:
            pid = getattr(existing, "id", None)
            return pid if isinstance(pid, int) else None

        raw_title = ref_norm.get("title")
        title = raw_title.strip() if isinstance(raw_title, str) and raw_title.strip() else doi_norm
        year = ref_norm.get("year") if isinstance(ref_norm.get("year"), int) else None

        paper = Paper(
            title=title,
            authors=[],
            abstract=None,
            publication_date=None,
            year=year,
            journal=None,
            venue=None,
            journal_issn=None,
            journal_impact_factor=None,
            journal_quartile=None,
            indexing=None,
            doi=doi_norm,
            arxiv_id=None,
            pmid=None,
            url=None,
            pdf_url=None,
            pdf_path=None,
            source="crossref_citation_only",
            categories=None,
            keywords=None,
            citations_count=0,
            embedding=None,
        )
        db.add(paper)
        # 只 flush 不 commit，由上层 sync_citations_for_paper 统一提交
        db.flush()

        pid = getattr(paper, "id", None)
        return pid if isinstance(pid, int) else None

    def _ensure_citation_edge(
        self,
        db: Session,
        citing_id: int,
        cited_id: int,
        source: str,
        confidence: float,
        source_meta: Optional[Dict] = None,
    ) -> bool:
        """
        确保 (citing_id -> cited_id) 这条引用边存在。

        如果已存在则不修改，返回 False；否则创建新记录并返回 True。
        """
        if citing_id == cited_id:
            return False

        existing = (
            db.query(PaperCitation)
            .filter(PaperCitation.citing_paper_id == citing_id)
            .filter(PaperCitation.cited_paper_id == cited_id)
            .first()
        )
        if existing is not None:
            return False

        edge = PaperCitation(
            citing_paper_id=citing_id,
            cited_paper_id=cited_id,
            source=source,
            confidence=confidence,
            source_meta=source_meta,
        )
        db.add(edge)
        return True

    def _update_citations_count(self, db: Session, paper: Paper) -> int:
        """重新计算并更新该论文被引次数，返回最新被引数。"""
        pid = getattr(paper, "id", None)
        if not isinstance(pid, int):
            return 0
        count = db.query(PaperCitation).filter(PaperCitation.cited_paper_id == pid).count()
        setattr(paper, "citations_count", int(count))
        return int(count)

    # -------- 对外主入口 --------
    async def sync_citations_batch(self, db: Session, paper_ids: List[int]) -> Dict[str, int]:
        """
        批量同步引用关系。
        """
        total_refs = 0
        matched_refs = 0
        created_edges = 0
        processed_count = 0

        for pid in paper_ids:
            try:
                stats = self.sync_citations_for_paper(db, pid)
                total_refs += stats["total_references"]
                matched_refs += stats["matched_references"]
                created_edges += stats["created_edges"]
                processed_count += 1
            except Exception as e:
                logger.error(f"[citation_ingest] Batch sync failed for paper {pid}: {e}")
        
        return {
            "processed_count": processed_count,
            "total_references": total_refs,
            "matched_references": matched_refs,
            "created_edges": created_edges,
        }

    def sync_citations_for_paper(self, db: Session, paper_id: int) -> Dict[str, int]:
        """
        为指定 Paper 同步引用关系（目前仅使用 Crossref 数据）。

        返回统计信息字典：
        - total_references: Crossref 返回的引用条目数
        - matched_references: 成功匹配到本地 Paper 的引用数
        - created_edges: 新增的 PaperCitation 记录数
        - citations_count: 同步完成后该论文的被引次数
        """
        paper = db.query(Paper).filter(Paper.id == paper_id).first()
        if paper is None:
            logger.warning("[citation_ingest] Paper(id=%s) 不存在", paper_id)
            return {
                "total_references": 0,
                "matched_references": 0,
                "created_edges": 0,
                "citations_count": 0,
            }

        doi = getattr(paper, "doi", None)
        if not isinstance(doi, str) or not doi.strip():
            logger.info("[citation_ingest] Paper(id=%s) 无 DOI，跳过 Crossref 引用同步", paper_id)
            return {
                "total_references": 0,
                "matched_references": 0,
                "created_edges": 0,
                "citations_count": getattr(paper, "citations_count", 0) or 0,
            }

        raw_refs = self._fetch_crossref_references(doi)
        total = len(raw_refs)

        matched = 0
        created = 0

        for ref in raw_refs:
            ref_norm = self._normalize_crossref_reference(ref)
            target_id = self._resolve_reference_to_paper_id(db, paper, ref_norm)

            # 如果在本地未找到匹配 Paper，但引用中包含 DOI，则尝试基于引用信息创建占位 Paper
            if target_id is None:
                target_id = self._create_placeholder_paper_for_reference(db, ref_norm)

            if target_id is None:
                # 仍未获得有效的目标论文 ID，跳过该引用
                continue

            matched += 1
            if self._ensure_citation_edge(
                db,
                citing_id=paper_id,
                cited_id=target_id,
                source="crossref",
                confidence=1.0,
                source_meta={"provider": "crossref"},
            ):
                created += 1

        # 提交新增的引用边并更新被引次数
        citations_count = self._update_citations_count(db, paper)
        db.commit()

        logger.info(
            "[citation_ingest] sync done paper_id=%s total=%s matched=%s created=%s citations=%s",
            paper_id,
            total,
            matched,
            created,
            citations_count,
        )

        return {
            "total_references": total,
            "matched_references": matched,
            "created_edges": created,
            "citations_count": citations_count,
        }


_citation_ingest_service: Optional[CitationIngestService] = None


def get_citation_ingest_service() -> CitationIngestService:
    """返回进程内共享的 CitationIngestService 实例"""
    global _citation_ingest_service
    if _citation_ingest_service is None:
        _citation_ingest_service = CitationIngestService()
    return _citation_ingest_service