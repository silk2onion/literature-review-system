"""
多源论文信息补齐服务。

对暂存库中缺失 abstract 的论文，按 DOI 从 CrossRef / Semantic Scholar 拉取补齐。
同时补齐其他可用字段（authors, year, journal, pdf_url 等）。
预留 PDF 下载挂载点。
"""

import asyncio
import logging
from dataclasses import dataclass, field
from typing import List, Optional, Callable, Awaitable

from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.models.staging_paper import StagingPaper

logger = logging.getLogger(__name__)


# ── 结果 ─────────────────────────────────────────────────────

@dataclass
class EnrichResult:
    paper_id: int
    enriched_fields: List[str]  # 补齐了哪些字段
    source: str                  # 从哪个源补到的


@dataclass
class BatchEnrichResult:
    total: int = 0
    enriched: int = 0
    skipped_no_doi: int = 0
    failed: int = 0
    details: List[EnrichResult] = field(default_factory=list)


# ── 单篇补齐逻辑 ─────────────────────────────────────────────

def _try_crossref(doi: str) -> Optional[dict]:
    """从 CrossRef 按 DOI 拉取元数据。返回 {abstract, authors, year, journal, pdf_url, ...} 或 None。"""
    try:
        from app.services.crawler.crossref_crawler import CrossRefCrawler
        crawler = CrossRefCrawler()
        paper = crawler.get_paper_by_doi(doi)
        if not paper:
            return None
        return {
            "abstract": paper.abstract,
            "authors": paper.authors,
            "year": paper.year,
            "journal": paper.journal,
            "publication_date": paper.publication_date,
            "pdf_url": paper.pdf_url,
            "url": paper.url,
            "source_used": "crossref",
        }
    except Exception as e:
        logger.warning(f"CrossRef enrichment failed for DOI {doi}: {e}")
        return None


def _try_semantic_scholar(doi: str) -> Optional[dict]:
    """从 Semantic Scholar 按 DOI 拉取元数据。"""
    try:
        from app.services.crawler.semantic_scholar_crawler import SemanticScholarCrawler
        crawler = SemanticScholarCrawler()
        sp = crawler.get_paper_by_s2id(f"DOI:{doi}")
        if not sp:
            return None
        # sp 是 SourcePaper dataclass
        return {
            "abstract": sp.abstract,
            "authors": sp.authors,
            "year": sp.year,
            "journal": sp.journal,
            "pdf_url": sp.pdf_url,
            "url": sp.url,
            "source_used": "semantic_scholar",
        }
    except Exception as e:
        logger.warning(f"Semantic Scholar enrichment failed for DOI {doi}: {e}")
        return None


def _enrich_one_paper(sp: StagingPaper) -> Optional[EnrichResult]:
    """
    对单篇 StagingPaper 尝试多源补齐。
    优先级：CrossRef → Semantic Scholar
    只补齐缺失的字段，不覆盖已有值。
    """
    doi = (sp.doi or "").strip()
    if not doi:
        return None

    enriched_fields: List[str] = []
    source_used = ""

    # 按优先级尝试各源
    for fetcher in [_try_crossref, _try_semantic_scholar]:
        result = fetcher(doi)
        if not result:
            continue

        source_used = result.get("source_used", "")

        # 补齐 abstract（最关键）
        if not sp.abstract and result.get("abstract"):
            sp.abstract = result["abstract"]
            enriched_fields.append("abstract")

        # 补齐其他字段
        if not sp.authors and result.get("authors"):
            sp.authors = result["authors"]
            enriched_fields.append("authors")

        if not sp.year and result.get("year"):
            sp.year = result["year"]
            enriched_fields.append("year")

        if not sp.journal and result.get("journal"):
            sp.journal = result["journal"]
            enriched_fields.append("journal")

        if not sp.publication_date and result.get("publication_date"):
            sp.publication_date = result["publication_date"]
            enriched_fields.append("publication_date")

        if not sp.pdf_url and result.get("pdf_url"):
            sp.pdf_url = result["pdf_url"]
            enriched_fields.append("pdf_url")

        if not sp.url and result.get("url"):
            sp.url = result["url"]
            enriched_fields.append("url")

        # 拿到 abstract 就够了，不用再查下一个源
        if "abstract" in enriched_fields:
            break

    if enriched_fields:
        return EnrichResult(
            paper_id=sp.id,
            enriched_fields=enriched_fields,
            source=source_used,
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
    批量补齐暂存文献的 abstract 和其他元数据。

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
        if not (sp.doi or "").strip():
            summary.skipped_no_doi += 1
        else:
            try:
                result = await asyncio.to_thread(_enrich_one_paper, sp)
                if result:
                    summary.enriched += 1
                    summary.details.append(result)
                    db.commit()
                else:
                    summary.failed += 1
            except Exception as e:
                logger.warning(f"Enrichment failed for paper {sp.id}: {e}")
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
    返回本地路径或 None。

    TODO: 实现时需要考虑：
    - 机构认证代理（EZProxy / Shibboleth）
    - 速率限制
    - 文件命名规则（DOI-based or ID-based）
    - 磁盘空间检查
    """
    # placeholder — 后续实现
    logger.info(f"[PDF Download] 预留挂载点，paper_id={sp.id}, pdf_url={sp.pdf_url}")
    return None
