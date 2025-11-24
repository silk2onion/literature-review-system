"""
Paper 相关服务层封装

- 统一管理 Paper 的新增 / 更新 / 删除操作
- 将 embedding 生成与更新逻辑集中在这里，避免在各个 API 中分散调用
- 提供 StagingPaper → Paper 的提升与去重合并能力
"""

from __future__ import annotations

import logging
from typing import List, Optional, Sequence
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.paper import Paper
from app.models.staging_paper import StagingPaper
from app.schemas.paper import PaperCreate, PaperUpdate
from app.services.embedding_service import EmbeddingService, get_embedding_service
from app.services.pdf_service import get_pdf_service
from app.services.crawler.crossref_crawler import CrossRefCrawler
from app.config import get_settings
import os

logger = logging.getLogger(__name__)


def _normalize_doi(raw: Optional[str]) -> Optional[str]:
    if not raw:
        return None
    value = raw.strip().lower()
    return value or None


def _normalize_title(raw: Optional[str]) -> str:
    return (raw or "").strip().lower()


def _find_existing_paper_by_identity(
    db: Session,
    title: Optional[str],
    year: Optional[int],
    doi: Optional[str],
) -> Optional[Paper]:
    """
    使用 DOI 优先，其次使用 (title.lower, year) 尝试匹配已有 Paper。
    """
    doi_norm = _normalize_doi(doi)
    if doi_norm:
        existing = (
            db.query(Paper)
            .filter(Paper.doi.isnot(None))
            .filter(Paper.doi.ilike(doi_norm))
            .first()
        )
        if existing:
            return existing

    title_norm = _normalize_title(title)
    if not title_norm:
        return None

    query = db.query(Paper).filter(Paper.title.isnot(None))
    query = query.filter(Paper.title.ilike(title_norm))
    if year is not None:
        query = query.filter(Paper.year == year)
    return query.first()


async def _generate_embedding_if_needed(
    paper: Paper,
    embedding_service: EmbeddingService,
    force: bool = False,
) -> bool:
    """
    根据需要为 Paper 生成或更新 embedding.

    Args:
        paper: 目标 Paper 实例
        embedding_service: 向量服务
        force: 为 True 时强制重新生成；否则仅在当前 embedding 为空时生成

    Returns:
        True 表示本次写入了新的 embedding；False 表示未做变更
    """
    current = getattr(paper, "embedding", None)
    if not force and current not in (None, [], {}):
        # 已经有 embedding 并且不要求强制更新
        return False

    vec = await embedding_service.embed_paper(paper)
    if vec is None:
        # 调用失败时不抛异常，只记录日志
        logger.warning("生成 Paper(id=%s) embedding 失败或被跳过", getattr(paper, "id", None))
        return False

    paper.embedding = vec  # type: ignore[assignment]
    return True


async def create_paper_with_embedding(
    db: Session,
    paper_data: PaperCreate,
    embedding_service: Optional[EmbeddingService] = None,
) -> Paper:
    """
    创建 Paper 并在事务内生成 embedding。

    - 始终为新建记录尝试生成 embedding（force=True）
    """
    if embedding_service is None:
        embedding_service = get_embedding_service()

    paper = Paper(**paper_data.model_dump())
    db.add(paper)

    # 先根据 title/abstract 生成 embedding，再提交事务
    try:
        await _generate_embedding_if_needed(paper, embedding_service, force=True)
    except Exception:
        logger.exception("创建 Paper 时生成 embedding 出错，将继续保存元数据")

    db.commit()
    db.refresh(paper)
    return paper


async def update_paper_with_embedding(
    db: Session,
    paper: Paper,
    paper_data: PaperUpdate,
    embedding_service: Optional[EmbeddingService] = None,
) -> Paper:
    """
    更新 Paper 并按需要更新 embedding。

    - 如果 title 或 abstract 发生变更，则强制重新生成 embedding
    - 否则仅在当前 embedding 为空时补充生成
    """
    update_dict = paper_data.model_dump(exclude_unset=True)
    if not update_dict:
        # 没有任何字段需要更新，直接返回原始对象
        return paper

    for field, value in update_dict.items():
        setattr(paper, field, value)

    need_force = any(key in {"title", "abstract"} for key in update_dict.keys())

    if embedding_service is None:
        embedding_service = get_embedding_service()

    try:
        await _generate_embedding_if_needed(paper, embedding_service, force=need_force)
    except Exception:
        logger.exception("更新 Paper(id=%s) 时生成 embedding 出错", getattr(paper, "id", None))

    db.commit()
    db.refresh(paper)
    return paper


async def delete_paper_and_cleanup(db: Session, paper: Paper) -> None:
    """
    删除 Paper 以及其关联数据。

    说明：
    - 当前 embedding 存储在 Paper 行内，删除行即视为“清理” embedding
    - 若未来接入独立向量库，可以在此处增加同步删除逻辑
    """
    db.delete(paper)
    db.commit()


def delete_papers(db: Session, paper_ids: List[int]) -> int:
    """
    批量删除 Paper (硬删除)。
    """
    if not paper_ids:
        return 0

    # 使用 synchronize_session=False 提高性能，但要注意 session 状态
    stmt = (
        db.query(Paper)
        .filter(Paper.id.in_(paper_ids))
        .delete(synchronize_session=False)
    )
    db.commit()
    return stmt


def archive_papers(
    db: Session, paper_ids: List[int], reason: Optional[str] = None
) -> int:
    """
    批量归档 Paper。
    """
    if not paper_ids:
        return 0

    now = datetime.now(timezone.utc)
    
    # SQLite 不支持直接 update(Paper).where(...).values(...) 的部分语法，
    # 但 SQLAlchemy ORM update 是支持的。
    # 注意：SQLite 中 Boolean 存储为 0/1，SQLAlchemy 会自动处理。
    
    stmt = (
        db.query(Paper)
        .filter(Paper.id.in_(paper_ids))
        .update(
            {
                Paper.is_archived: True,
                Paper.archived_at: now,
                Paper.archived_reason: reason,
            },
            synchronize_session=False,
        )
    )
    db.commit()
    return stmt


def restore_papers(db: Session, paper_ids: List[int]) -> int:
    """
    批量恢复（取消归档） Paper。
    """
    if not paper_ids:
        return 0

    stmt = (
        db.query(Paper)
        .filter(Paper.id.in_(paper_ids))
        .update(
            {
                Paper.is_archived: False,
                Paper.archived_at: None,
                Paper.archived_reason: None,
            },
            synchronize_session=False,
        )
    )
    db.commit()
    return stmt


async def promote_staging_papers(
    db: Session,
    staging_records: Sequence[StagingPaper],
    embedding_service: Optional[EmbeddingService] = None,
) -> List[Paper]:
    """
    将一批 StagingPaper 提升为正式 Paper。

    逻辑：
    - 使用 DOI / (title + year) 在 Paper 表中查找是否已有对应记录
    - 若已存在：
        - 不覆盖已有字段，仅将 StagingPaper.final_paper_id 指向该记录
        - 如当前 Paper.embedding 为空，则尝试补充生成
    - 若不存在：
        - 以 StagingPaper 字段创建新的 Paper
        - 强制生成 embedding
    - 对于状态为 pending 的 StagingPaper，提升后自动标记为 accepted
    """
    if not staging_records:
        return []

    if embedding_service is None:
        embedding_service = get_embedding_service()

    promoted: List[Paper] = []

    for staging in staging_records:
        existing = _find_existing_paper_by_identity(
            db=db,
            title=getattr(staging, "title", None),
            year=getattr(staging, "year", None),
            doi=getattr(staging, "doi", None),
        )

        if existing:
            paper = existing
            force_embedding = False
        else:
            # 创建新的 Paper，字段基本与 StagingPaper 对齐
            paper = Paper(
                title=staging.title,
                authors=staging.authors,
                abstract=staging.abstract,
                publication_date=staging.publication_date,
                year=staging.year,
                journal=staging.journal,
                venue=staging.venue,
                journal_issn=staging.journal_issn,
                journal_impact_factor=staging.journal_impact_factor,
                journal_quartile=staging.journal_quartile,
                indexing=staging.indexing,
                doi=staging.doi,
                arxiv_id=staging.arxiv_id,
                pmid=staging.pmid,
                url=staging.url,
                pdf_url=staging.pdf_url,
                pdf_path=staging.pdf_path,
                source=staging.source,
                categories=staging.categories,
                keywords=staging.keywords,
                citations_count=staging.citations_count,
            )
            db.add(paper)
            # 新建记录时强制生成 embedding
            force_embedding = True

        try:
            await _generate_embedding_if_needed(
                paper,
                embedding_service,
                force=force_embedding,
            )
        except Exception:
            logger.exception(
                "提升 StagingPaper(id=%s) 为 Paper 时生成 embedding 出错",
                getattr(staging, "id", None),
            )

        # 提升成功后，删除暂存记录
        try:
            db.delete(staging)
        except Exception:
            logger.exception(
                "删除 StagingPaper(id=%s) 失败", getattr(staging, "id", None)
            )

        promoted.append(paper)

    db.commit()
    for paper in promoted:
        try:
            db.refresh(paper)
        except Exception:
            # refresh 失败不影响整体返回
            logger.warning("刷新 Paper(id=%s) 状态失败", getattr(paper, "id", None))

    return promoted


async def process_uploaded_pdf(
    db: Session,
    file_path: str,
    original_filename: str,
) -> Paper:
    """
    处理上传的 PDF 文件：
    1. 提取文本和 DOI
    2. 尝试通过 DOI 获取元数据 (CrossRef)
    3. 创建或更新 Paper 记录
    4. 生成 Embedding
    """
    pdf_service = get_pdf_service()
    
    # 1. 提取信息
    try:
        text = pdf_service.extract_text(file_path)
        doi = pdf_service.find_doi(text)
    except Exception as e:
        logger.error(f"PDF 解析失败: {e}")
        text = ""
        doi = None

    # 2. 尝试获取元数据
    metadata_paper = None
    if doi:
        try:
            settings = get_settings()
            crossref = CrossRefCrawler(settings)
            # 尝试直接通过 DOI 获取元数据
            metadata_paper = crossref.get_paper_by_doi(doi)
            if metadata_paper:
                logger.info(f"Found CrossRef metadata for DOI {doi}: {metadata_paper.title}")
        except Exception as e:
            logger.warning(f"Failed to fetch CrossRef metadata: {e}")

    # 3. 匹配或创建 Paper
    paper = None
    if doi:
        paper = db.query(Paper).filter(Paper.doi == doi).first()

    if paper:
        logger.info(f"Found existing paper by DOI {doi}: {paper.id}")
        # 更新 PDF 路径
        paper.pdf_path = file_path
        
        # 如果有元数据，更新缺失字段
        if metadata_paper:
            if not paper.title or paper.title == "Unknown": paper.title = metadata_paper.title
            if not paper.authors: paper.authors = metadata_paper.authors
            if not paper.abstract: paper.abstract = metadata_paper.abstract
            if not paper.year: paper.year = metadata_paper.year
            if not paper.journal: paper.journal = metadata_paper.journal
            if not paper.url: paper.url = metadata_paper.url
        
        db.commit()
        db.refresh(paper)
    else:
        # 创建新 Paper
        if metadata_paper:
            paper = Paper(
                title=metadata_paper.title,
                authors=metadata_paper.authors,
                abstract=metadata_paper.abstract,
                year=metadata_paper.year,
                journal=metadata_paper.journal,
                doi=doi,
                url=metadata_paper.url,
                pdf_path=file_path,
                source="upload+crossref",
                is_archived=False
            )
        else:
            # 仅使用文件名猜测
            title_guess = os.path.splitext(original_filename)[0].replace("_", " ").replace("-", " ")
            paper = Paper(
                title=title_guess,
                doi=doi,
                pdf_path=file_path,
                source="upload",
                year=datetime.now().year,
                is_archived=False
            )
        
        db.add(paper)
        db.commit()
        db.refresh(paper)

    # 4. 生成 Embedding
    # 如果有元数据且有摘要，优先使用元数据的摘要
    # 如果没有元数据摘要，但提取到了文本，使用提取文本作为摘要（如果摘要为空）
    content_for_embedding = paper.abstract
    if not content_for_embedding and text:
        # 尝试从文本中智能提取摘要
        extracted_abstract = pdf_service.extract_abstract(text)
        if extracted_abstract:
            content_for_embedding = extracted_abstract
        else:
            # 提取失败，截取前 5000 字符
            content_for_embedding = text[:5000]
            
        paper.abstract = content_for_embedding
        db.commit()
    
    embedding_service = get_embedding_service()
    
    # 4.1 Paper 级 Embedding (Abstract)
    if content_for_embedding:
        try:
            await embedding_service.embed_paper(paper)
            db.commit()
        except Exception as e:
            logger.warning(f"Failed to generate paper embedding: {e}")

    # 4.2 Chunk 级 Embedding (Full Text)
    if text:
        try:
            # 1. 切分文本
            chunks = pdf_service.chunk_text(text, chunk_size=1000, overlap=200)
            if chunks:
                logger.info(f"Generated {len(chunks)} chunks for paper {paper.id}")
                
                # 2. 批量生成向量
                chunk_embeddings = await embedding_service.embed_texts(chunks)
                
                # 3. 保存到数据库
                from app.models.paper_chunk import PaperChunk
                
                # 先清理旧的 chunks (如果是更新)
                db.query(PaperChunk).filter(PaperChunk.paper_id == paper.id).delete()
                
                new_chunks = []
                for i, (chunk_text, embedding) in enumerate(zip(chunks, chunk_embeddings)):
                    if not embedding:
                        continue
                        
                    new_chunks.append(PaperChunk(
                        paper_id=paper.id,
                        chunk_index=i,
                        content=chunk_text,
                        embedding=embedding
                    ))
                
                if new_chunks:
                    db.add_all(new_chunks)
                    db.commit()
                    logger.info(f"Saved {len(new_chunks)} chunks with embeddings for paper {paper.id}")
                    
        except Exception as e:
            logger.error(f"Failed to process chunks for paper {paper.id}: {e}")

    return paper