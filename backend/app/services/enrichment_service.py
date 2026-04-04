"""
多源论文信息交叉补齐服务。

对暂存库论文，用已有信息（DOI/标题）去多个学术数据源交叉查询，补齐缺失字段。
每个源各有所长：
- CrossRef:   DOI权威、出版日期、PDF链接
- Semantic Scholar: abstract、引用数、PDF链接
- OpenAlex:   abstract、关键词、分类、开放获取

策略：按 DOI 查询优先，无 DOI 则按标题搜索。只补缺失字段，不覆盖已有值。
预留 PDF 下载挂载点。
"""

import asyncio
import logging
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Callable, Awaitable

from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.models.staging_paper import StagingPaper
from app.models.paper import Paper

logger = logging.getLogger(__name__)


# ── 结果 ─────────────────────────────────────────────────────

@dataclass
class EnrichResult:
    paper_id: int
    enriched_fields: List[str]
    sources_used: List[str]


@dataclass
class BatchEnrichResult:
    total: int = 0
    enriched: int = 0
    skipped: int = 0
    failed: int = 0
    details: List[EnrichResult] = field(default_factory=list)


# ── 各源查询 ─────────────────────────────────────────────────

def _fetch_crossref_by_doi(doi: str) -> Optional[Dict[str, Any]]:
    """通过 DOI 从 CrossRef 获取元数据"""
    try:
        from app.services.crawler.crossref_crawler import CrossRefCrawler
        crawler = CrossRefCrawler()
        paper = crawler.get_paper_by_doi(doi)
        if not paper:
            return None
        return {
            "source": "crossref",
            "abstract": paper.abstract,
            "authors": paper.authors,
            "year": paper.year,
            "journal": paper.journal,
            "publication_date": paper.publication_date,
            "pdf_url": paper.pdf_url,
            "url": paper.url,
            "doi": paper.doi,
        }
    except Exception as e:
        logger.debug(f"CrossRef DOI lookup failed for {doi}: {e}")
        return None


def _fetch_crossref_by_title(title: str) -> Optional[Dict[str, Any]]:
    """通过标题从 CrossRef 搜索，取最佳匹配"""
    try:
        import httpx
        resp = httpx.get(
            "https://api.crossref.org/works",
            params={"query.title": title, "rows": 1},
            timeout=15,
        )
        items = resp.json().get("message", {}).get("items", [])
        if not items:
            return None
        item = items[0]
        # 验证标题相似度（防止误匹配）
        cr_title = (item.get("title") or [""])[0].lower().strip()
        if not cr_title:
            return None
        # 简单 Jaccard 检查
        t1 = set(title.lower().split())
        t2 = set(cr_title.split())
        overlap = len(t1 & t2) / max(len(t1 | t2), 1)
        if overlap < 0.5:
            return None

        # 解析摘要（CrossRef 可能是 XML）
        import re
        abstract = item.get("abstract", "")
        if abstract:
            abstract = re.sub(r'<[^>]+>', '', abstract)
            abstract = re.sub(r'\s+', ' ', abstract).strip()

        # 解析 PDF
        pdf_url = None
        for link in item.get("link", []):
            if "pdf" in (link.get("content-type") or "").lower():
                pdf_url = link.get("URL")
                break

        return {
            "source": "crossref",
            "doi": item.get("DOI"),
            "abstract": abstract or None,
            "authors": [
                f"{a.get('family', '')} {a.get('given', '')}".strip()
                for a in item.get("author", [])
            ] or None,
            "year": (item.get("published-print") or item.get("published-online") or {}).get("date-parts", [[None]])[0][0],
            "journal": (item.get("container-title") or [None])[0],
            "pdf_url": pdf_url,
            "url": item.get("URL"),
        }
    except Exception as e:
        logger.debug(f"CrossRef title search failed for '{title[:50]}': {e}")
        return None


def _fetch_s2_by_doi(doi: str) -> Optional[Dict[str, Any]]:
    """通过 DOI 从 Semantic Scholar 获取元数据"""
    try:
        from app.services.crawler.semantic_scholar_crawler import SemanticScholarCrawler
        crawler = SemanticScholarCrawler()
        sp = crawler.get_paper_by_s2id(f"DOI:{doi}")
        if not sp:
            return None
        return {
            "source": "semantic_scholar",
            "abstract": sp.abstract,
            "authors": sp.authors,
            "year": sp.year,
            "journal": sp.journal,
            "pdf_url": sp.pdf_url,
            "url": sp.url,
            "doi": sp.doi,
            "keywords": sp.keywords,
        }
    except Exception as e:
        logger.debug(f"S2 DOI lookup failed for {doi}: {e}")
        return None


def _fetch_openalex_by_doi(doi: str) -> Optional[Dict[str, Any]]:
    """通过 DOI 从 OpenAlex 获取元数据"""
    try:
        import httpx
        resp = httpx.get(
            f"https://api.openalex.org/works/doi:{doi}",
            timeout=15,
            headers={"Accept": "application/json"},
        )
        if resp.status_code != 200:
            return None
        data = resp.json()

        # 解析 abstract（OpenAlex 用 inverted index 格式）
        abstract = None
        inv_idx = data.get("abstract_inverted_index")
        if inv_idx and isinstance(inv_idx, dict):
            # 重建摘要文本
            positions = []
            for word, idxs in inv_idx.items():
                for i in idxs:
                    positions.append((i, word))
            positions.sort()
            abstract = " ".join(w for _, w in positions)

        return {
            "source": "openalex",
            "abstract": abstract,
            "doi": (data.get("doi") or "").replace("https://doi.org/", ""),
            "year": data.get("publication_year"),
            "journal": (data.get("primary_location") or {}).get("source", {}).get("display_name") if data.get("primary_location") else None,
            "pdf_url": (data.get("best_oa_location") or {}).get("pdf_url"),
            "url": data.get("id"),
            "keywords": [kw.get("display_name") for kw in (data.get("keywords") or []) if kw.get("display_name")],
        }
    except Exception as e:
        logger.debug(f"OpenAlex DOI lookup failed for {doi}: {e}")
        return None


# ── 字段合并 ─────────────────────────────────────────────────

# StagingPaper 上可被补齐的字段
ENRICHABLE_FIELDS = [
    "abstract", "authors", "year", "journal", "publication_date",
    "doi", "pdf_url", "url", "keywords",
]


def _merge_into_paper(sp: Any, data: Dict[str, Any]) -> List[str]:
    """
    将一个源的数据合并到 StagingPaper 或 Paper，只补缺失字段。
    返回实际补齐的字段名列表。
    """
    filled: List[str] = []
    for field_name in ENRICHABLE_FIELDS:
        if field_name not in data or not data[field_name]:
            continue
        current = getattr(sp, field_name, None)
        # 判断当前值是否为空
        if current is None or current == "" or current == []:
            setattr(sp, field_name, data[field_name])
            filled.append(field_name)
    return filled


# ── 单篇补齐 ─────────────────────────────────────────────────

def _enrich_one_paper(sp: Any) -> Optional[EnrichResult]:
    """
    对单篇 StagingPaper 尝试多源交叉补齐。

    查询策略：
    1. 有 DOI → CrossRef(DOI) → S2(DOI) → OpenAlex(DOI)
    2. 无 DOI → CrossRef(标题搜索) 尝试补 DOI，拿到 DOI 后走路径 1
    3. 仍无 DOI → S2 无法查，OpenAlex 无法查，仅有 CrossRef 标题搜索结果
    """
    all_filled: List[str] = []
    sources_used: List[str] = []

    doi = (sp.doi or "").strip()

    # 如果没有 DOI，先尝试用标题从 CrossRef 搜到 DOI
    if not doi:
        cr_data = _fetch_crossref_by_title(sp.title)
        if cr_data:
            filled = _merge_into_paper(sp, cr_data)
            if filled:
                all_filled.extend(filled)
                sources_used.append("crossref(title)")
            # 如果成功补到了 DOI，后续可以继续用 DOI 查其他源
            doi = (sp.doi or "").strip()

    # 有 DOI 的情况：依次查 CrossRef → S2 → OpenAlex
    if doi:
        fetchers = [
            ("crossref", _fetch_crossref_by_doi),
            ("semantic_scholar", _fetch_s2_by_doi),
            ("openalex", _fetch_openalex_by_doi),
        ]
        for source_name, fetcher in fetchers:
            # 检查是否还有字段需要补齐
            missing = [f for f in ENRICHABLE_FIELDS if not getattr(sp, f, None)]
            if not missing:
                break  # 全部补满了

            data = fetcher(doi)
            if data:
                filled = _merge_into_paper(sp, data)
                if filled:
                    all_filled.extend(filled)
                    sources_used.append(source_name)

    if all_filled:
        return EnrichResult(
            paper_id=sp.id,
            enriched_fields=list(dict.fromkeys(all_filled)),  # 去重保序
            sources_used=list(dict.fromkeys(sources_used)),
        )
    return None


# ── 批量补齐 ─────────────────────────────────────────────────

async def enrich_staging_papers(
    db: Session,
    paper_ids: Optional[List[int]] = None,
    only_missing_abstract: bool = True,
    on_progress: Optional[Callable[[int, int], Awaitable[None]]] = None,
) -> BatchEnrichResult:
    """
    批量多源交叉补齐暂存文献。

    Args:
        db:                   数据库 session
        paper_ids:            指定要补齐的 ID 列表（不传则处理所有 pending）
        only_missing_abstract: True 则只处理缺 abstract 的论文
        on_progress:          进度回调 (processed, total)
    """
    query = db.query(StagingPaper).filter(StagingPaper.status == "pending")

    if paper_ids:
        query = query.filter(StagingPaper.id.in_(paper_ids))

    if only_missing_abstract:
        query = query.filter(
            or_(StagingPaper.abstract == None, StagingPaper.abstract == "")  # noqa: E711
        )

    papers = query.all()
    summary = BatchEnrichResult(total=len(papers))

    for i, sp in enumerate(papers):
        try:
            result = await asyncio.to_thread(_enrich_one_paper, sp)
            if result:
                summary.enriched += 1
                summary.details.append(result)
                db.commit()
            else:
                summary.skipped += 1
        except Exception as e:
            logger.warning(f"Enrichment failed for paper {sp.id}: {e}")
            summary.failed += 1

        if on_progress and (i + 1) % 5 == 0:
            await on_progress(i + 1, summary.total)

    return summary


# ── 正式库补齐 ────────────────────────────────────────────────

async def enrich_library_papers(
    db: Session,
    paper_ids: Optional[List[int]] = None,
    only_missing_abstract: bool = True,
    on_progress: Optional[Callable[[int, int], Awaitable[None]]] = None,
) -> BatchEnrichResult:
    """
    批量多源交叉补齐正式文献库（Paper 表）。
    逻辑与 enrich_staging_papers 一致，只是查询的是 Paper 表。
    """
    query = db.query(Paper)

    if paper_ids:
        query = query.filter(Paper.id.in_(paper_ids))

    if only_missing_abstract:
        query = query.filter(
            or_(Paper.abstract == None, Paper.abstract == "")  # noqa: E711
        )

    papers = query.all()
    summary = BatchEnrichResult(total=len(papers))

    for i, p in enumerate(papers):
        try:
            result = await asyncio.to_thread(_enrich_one_paper, p)
            if result:
                summary.enriched += 1
                summary.details.append(result)
                db.commit()
            else:
                summary.skipped += 1
        except Exception as e:
            logger.warning(f"Library enrichment failed for paper {p.id}: {e}")
            summary.failed += 1

        if on_progress and (i + 1) % 5 == 0:
            await on_progress(i + 1, summary.total)

    return summary


# ── PDF 下载挂载点（预留） ────────────────────────────────────

async def download_pdf_for_paper(
    sp: StagingPaper,
    save_dir: str = "data/pdfs",
) -> Optional[str]:
    """
    预留：根据 pdf_url 下载 PDF 并保存到本地。

    TODO: 实现时需要考虑：
    - 机构认证代理（EZProxy / Shibboleth）
    - 速率限制
    - 文件命名规则（DOI-based or ID-based）
    - 磁盘空间检查
    """
    logger.info(f"[PDF Download] 预留挂载点，paper_id={sp.id}, pdf_url={sp.pdf_url}")
    return None
