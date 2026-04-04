"""
Papers API路由
"""
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, UploadFile, File
from sqlalchemy.orm import Session
from typing import List, cast, Any, Dict
import logging
import shutil
from datetime import datetime
from sqlalchemy import or_

from app.database import get_db
from app.schemas.paper import (
    PaperCreate,
    PaperUpdate,
    PaperResponse,
    PaperSearch,
    PaperSearchResponse,
    PaperSearchLocal,
    PaperSearchLocalResponse,
)
from pydantic import BaseModel
from app.models.paper import Paper
from app.models.recall_log import RecallLog
from app.models.group import PaperGroupAssociation
from app.services.crawler import ArxivCrawler, search_across_sources
from app.config import get_settings
from app.utils.cache import search_cache
from app.services.paper_service import (
    create_paper_with_embedding,
    update_paper_with_embedding,
    delete_paper_and_cleanup,
    delete_papers,
    archive_papers,
    archive_papers,
    restore_papers,
    process_uploaded_pdf,
)
from app.schemas.paper import PaperBatchDelete
from app.services.paper_ingest import (
    insert_or_update_staging_from_sources,
    paper_to_source_paper,
)
from app.services.pdf_service import PDFDownloadService, get_pdf_service
from app.services.semantic_groups import get_semantic_group_service
from app.services.crawler.crossref_crawler import CrossRefCrawler
from app.services.crawler.arxiv_crawler import ArxivCrawler
from fastapi.responses import FileResponse
import os

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/papers", tags=["papers"])
settings = get_settings()


@router.post("/search", response_model=PaperSearchResponse)
async def search_papers(
    search_request: PaperSearch,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """
    搜索文献（带缓存）
    
    - 支持多个数据源（arxiv、google_scholar等）
    - 对相同参数的请求做内存缓存，默认 30 分钟
    """
    try:
        # 0. 语义组关键词扩展
        original_keywords = list(search_request.keywords) if search_request.keywords else []
        semantic_service = get_semantic_group_service()
        expanded_result = semantic_service.expand_keywords(search_request.keywords)
        expanded_keywords = cast(List[str], expanded_result["keywords"])
        activated_groups = cast(Dict[str, Any], expanded_result.get("activated_groups", {}))
        
        if len(expanded_keywords) > len(search_request.keywords):
            logger.info(f"语义组扩展关键词: {search_request.keywords} -> {expanded_keywords}")
            # 更新搜索请求中的关键词
            search_request.keywords = expanded_keywords

        logger.info(f"搜索文献: {search_request.keywords}")

        # 0.1 记录搜索日志
        try:
            log = RecallLog(
                event_type="query",
                source="online_search",
                query_keywords=original_keywords,
                group_keys=list(activated_groups.keys()) if activated_groups else None,
                extra={
                    "expanded_keywords": expanded_keywords,
                    "sources": search_request.sources,
                    "year_from": search_request.year_from,
                    "year_to": search_request.year_to,
                    "limit": search_request.limit
                }
            )
            db.add(log)
            db.commit()
        except Exception as e:
            logger.warning(f"Failed to log online search query: {e}")

        # 1. 构造缓存 key（只和搜索条件相关）
        cache_key = search_cache.make_key(
            "papers_search",
            tuple(sorted(search_request.keywords or [])),
            tuple(sorted(search_request.sources or [])),
            int(search_request.limit),
            int(search_request.year_from) if search_request.year_from else None,
            int(search_request.year_to) if search_request.year_to else None,
        )

        cached = search_cache.get(cache_key)
        if cached is not None:
            logger.info("命中文献搜索缓存，直接返回缓存结果")
            return cached

        # 2. 通过多源 Orchestrator 搜索
        #    - 当前支持 arxiv / crossref（后续可扩展）
        #    - 若前端未显式传 sources，则使用默认 ["arxiv"]
        try:
            sources = search_request.sources or ["arxiv"]
            logger.info(f"使用数据源: {sources}")

            all_papers = search_across_sources(
                keywords=search_request.keywords,
                sources=sources,
                limit=search_request.limit,
                year_from=search_request.year_from,
                year_to=search_request.year_to,
            )
        except Exception as e:
            logger.error(f"多源文献搜索失败: {e}")
            raise

        # 3. 将结果同步到“暂存文献库”（staging_papers），而不是直接写入正式 Paper 表
        #    - 使用 insert_or_update_staging_from_sources 按 identity 去重
        #    - 同一篇文献在暂存库中只保留一个主版本，供后续人工/LLM 审核后再提升到正式库
        source_papers = [paper_to_source_paper(p) for p in all_papers]
        staged_papers, created_count = insert_or_update_staging_from_sources(
            db, source_papers
        )
        logger.info(
            "多源搜索完成: %d 篇，暂存库新增 %d 篇，返回主版本 %d 篇",
            len(all_papers),
            created_count,
            len(staged_papers),
        )

        paper_responses = [
            PaperResponse.model_validate(paper) for paper in staged_papers
        ]

        resp = PaperSearchResponse(
            success=True,
            total=len(paper_responses),
            papers=paper_responses,
            message=f"成功搜索到 {len(paper_responses)} 篇文献",
        )

        # 3. 写入缓存
        search_cache.set(cache_key, resp)
        return resp

    except Exception as e:
        logger.error(f"搜索文献失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/search-local", response_model=PaperSearchLocalResponse)
async def search_papers_local(
    payload: PaperSearchLocal,
    db: Session = Depends(get_db),
):
    """
    本地文献库检索

    - 仅查询 SQLite 中已有的 Paper 记录
    - 支持：
      - 关键词模糊搜索：title / abstract
      - 年份区间过滤：year_from / year_to
      - 分页：page / page_size
    """
    try:
        # 0. 语义组关键词扩展 (本地搜索也支持)
        activated_groups = {}
        expanded_keywords = []
        original_keywords = []

        if payload.q:
            semantic_service = get_semantic_group_service()
            # 简单处理：将查询词视为关键词列表
            original_keywords = [k.strip() for k in payload.q.split() if k.strip()]
            expanded_result = semantic_service.expand_keywords(original_keywords)
            expanded_keywords = cast(List[str], expanded_result["keywords"])
            activated_groups = cast(Dict[str, Any], expanded_result.get("activated_groups", {}))
            
            if len(expanded_keywords) > len(original_keywords):
                logger.info(f"本地搜索语义扩展: {original_keywords} -> {expanded_keywords}")
                # 重新组合为查询字符串，用 OR 连接或保留原样
                # 这里简单策略：如果扩展了，就用扩展后的词进行匹配
                # 但本地搜索是模糊匹配，多个词通常意味着 AND 或 OR。
                # 这里的实现保持简单：如果用户输入了明确的词，我们尝试用扩展词增强匹配
                # 但 SQL LIKE 不支持直接的列表匹配，需要构造 OR 条件
                pass
        
        # 0.1 记录搜索日志
        try:
            log = RecallLog(
                event_type="query",
                source="local_search",
                query_keywords=original_keywords,
                group_keys=list(activated_groups.keys()) if activated_groups else None,
                extra={
                    "expanded_keywords": expanded_keywords,
                    "year_from": payload.year_from,
                    "year_to": payload.year_to,
                    "group_id": payload.group_id,
                    "raw_query": payload.q
                }
            )
            db.add(log)
            db.commit()
        except Exception as e:
            logger.warning(f"Failed to log local search query: {e}")

        query = db.query(Paper)

        # 分组过滤
        if payload.group_id is not None:
            query = query.join(PaperGroupAssociation).filter(
                PaperGroupAssociation.group_id == payload.group_id
            )

        # 归档过滤
        if not payload.include_archived:
            query = query.filter(
                or_(Paper.is_archived == False, Paper.is_archived == None)
            )

        # 关键词模糊匹配
        if payload.q:
            # 支持多关键词 OR 匹配 (包括语义扩展词)
            keywords = [k.strip() for k in payload.q.split() if k.strip()]
            semantic_service = get_semantic_group_service()
            expanded_result = semantic_service.expand_keywords(keywords)
            all_keywords = cast(List[str], expanded_result["keywords"])
            
            # 构造 OR 条件
            conditions = []
            for kw in all_keywords:
                pattern = f"%{kw}%"
                conditions.append(Paper.title.ilike(pattern))
                conditions.append(Paper.abstract.ilike(pattern))
            
            if conditions:
                query = query.filter(or_(*conditions))

        # 年份过滤
        if payload.year_from is not None:
            query = query.filter(Paper.year >= payload.year_from)
        if payload.year_to is not None:
            query = query.filter(Paper.year <= payload.year_to)

        # 统计总数
        total = query.count()

        # 排序 + 分页：按年份倒序，其次按 id 倒序
        page = payload.page
        page_size = payload.page_size
        offset = (page - 1) * page_size

        records = (
            query.order_by(Paper.year.desc().nullslast(), Paper.id.desc())
            .offset(offset)
            .limit(page_size)
            .all()
        )

        items = [PaperResponse.model_validate(p) for p in records]

        return PaperSearchLocalResponse(
            success=True,
            total=total,
            items=items,
            message=f"本地文献库检索成功，当前页 {page}，共 {total} 条记录",
            search_context={
                "query_keywords": original_keywords,
                "expanded_keywords": expanded_keywords,
                "group_keys": list(activated_groups.keys()) if activated_groups else []
            }
        )
    except Exception as e:
        logger.error(f"本地文献库检索失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/", response_model=List[PaperResponse])
async def list_papers(
    skip: int = 0,
    limit: int = 20,
    include_archived: bool = False,
    db: Session = Depends(get_db),
):
    """获取文献列表"""
    query = db.query(Paper)
    if not include_archived:
        query = query.filter(
            or_(Paper.is_archived == False, Paper.is_archived == None)
        )
    # 默认按添加时间倒序排列
    papers = query.order_by(Paper.created_at.desc()).offset(skip).limit(limit).all()
    return [PaperResponse.model_validate(paper) for paper in papers]


@router.get("/{paper_id}", response_model=PaperResponse)
async def get_paper(paper_id: int, db: Session = Depends(get_db)):
    """获取单篇文献详情"""
    paper = db.query(Paper).filter(Paper.id == paper_id).first()
    if not paper:
        raise HTTPException(status_code=404, detail="文献不存在")
    return PaperResponse.model_validate(paper)


@router.post("/", response_model=PaperResponse)
async def create_paper(
    paper_data: PaperCreate,
    db: Session = Depends(get_db)
):
    """手动创建文献记录（自动生成 embedding）"""
    paper = await create_paper_with_embedding(db, paper_data)
    return PaperResponse.model_validate(paper)


@router.put("/{paper_id}", response_model=PaperResponse)
async def update_paper(
    paper_id: int,
    paper_data: PaperUpdate,
    db: Session = Depends(get_db)
):
    """更新文献信息（按需更新 embedding）"""
    paper = db.query(Paper).filter(Paper.id == paper_id).first()
    if not paper:
        raise HTTPException(status_code=404, detail="文献不存在")

    paper = await update_paper_with_embedding(db, paper, paper_data)
    return PaperResponse.model_validate(paper)


@router.delete("/{paper_id}")
async def delete_paper(paper_id: int, db: Session = Depends(get_db)):
    """删除文献（同时清理相关 embedding 记录）"""
    paper = db.query(Paper).filter(Paper.id == paper_id).first()
    if not paper:
        raise HTTPException(status_code=404, detail="文献不存在")

    await delete_paper_and_cleanup(db, paper)
    return {"message": "文献已删除"}


@router.post("/batch-delete")
async def batch_delete_papers(
    payload: PaperBatchDelete, db: Session = Depends(get_db)
):
    """批量删除文献 (硬删除)"""
    count = delete_papers(db, payload.paper_ids)
    return {"message": f"已删除 {count} 篇文献", "deleted_count": count}


@router.post("/archive")
async def archive_papers_endpoint(
    payload: PaperBatchDelete, db: Session = Depends(get_db)
):
    """批量归档文献"""
    count = archive_papers(db, payload.paper_ids, reason="User archived")
    return {"message": f"已归档 {count} 篇文献", "count": count}


@router.post("/restore")
async def restore_papers_endpoint(
    payload: PaperBatchDelete, db: Session = Depends(get_db)
):
    """批量恢复文献"""
    count = restore_papers(db, payload.paper_ids)
    return {"message": f"已恢复 {count} 篇文献", "count": count}


class BatchDownloadRequest(BaseModel):
    paper_ids: List[int]


@router.post("/{paper_id}/download-pdf")
async def download_paper_pdf(
    paper_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """
    下载文献 PDF（异步后台任务）

    支持三种下载策略：
    1. 直接下载（OA / arXiv 等有 pdf_url 的）
    2. 机构认证下载（通过 EZProxy + 出版商 handler）
    3. 仅需有 DOI 或 URL 即可尝试
    """
    paper = db.query(Paper).filter(Paper.id == paper_id).first()
    if not paper:
        raise HTTPException(status_code=404, detail="文献不存在")

    # 至少需要 pdf_url / doi / url 之一
    if not paper.pdf_url and not paper.doi and not paper.url:
        raise HTTPException(
            status_code=400,
            detail="该文献没有 PDF 链接、DOI 或 URL，无法下载",
        )

    async def download_task():
        try:
            from app.database import SessionLocal
            with SessionLocal() as session:
                service = PDFDownloadService(session)
                result = await service.download_paper_pdf(paper_id)
                if result:
                    logger.info("PDF downloaded successfully for paper %d: %s", paper_id, result)
                else:
                    logger.warning("PDF download failed for paper %d", paper_id)
        except Exception as e:
            logger.error("Failed to download PDF for paper %d: %s", paper_id, e)

    background_tasks.add_task(download_task)

    return {"message": "PDF下载任务已启动", "paper_id": paper_id}


@router.post("/batch-download-pdf")
async def batch_download_pdfs(
    payload: BatchDownloadRequest,
    background_tasks: BackgroundTasks,
):
    """
    批量下载 PDF（异步后台任务）

    使用机构认证 session 一次登录，批量下载多篇论文。
    通过 GET /api/papers/download-progress 查询进度。
    """
    from app.services.pdf_service import (
        clear_batch_download_progress,
        update_batch_download_progress,
    )

    if not payload.paper_ids:
        raise HTTPException(status_code=400, detail="paper_ids 不能为空")

    clear_batch_download_progress()

    async def batch_task():
        try:
            from app.database import SessionLocal
            with SessionLocal() as session:
                service = PDFDownloadService(session)
                await service.batch_download(
                    payload.paper_ids,
                    progress_callback=update_batch_download_progress,
                )
        except Exception as e:
            logger.error("Batch PDF download failed: %s", e)

    background_tasks.add_task(batch_task)

    return {
        "message": f"批量下载任务已启动 ({len(payload.paper_ids)} 篇)",
        "paper_ids": payload.paper_ids,
    }


@router.get("/download-progress")
async def get_download_progress():
    """获取批量下载进度"""
    from app.services.pdf_service import get_batch_download_progress

    return get_batch_download_progress()


@router.get("/institutional-url")
async def get_institutional_url(doi: str, db: Session = Depends(get_db)):
    """
    将 DOI 转为 EZProxy 代理后的出版商 URL

    根据 DOI 前缀直接构造出版商 URL（不依赖 doi.org 解析），
    前端直接用返回的 URL 在用户浏览器中打开，零反爬。
    """
    from app.models.system_setting import SystemSetting
    import json as _json

    # 读取 EZProxy 前缀
    setting = db.query(SystemSetting).filter(
        SystemSetting.key == "institutional_access_config"
    ).first()
    ezproxy_prefix = ""
    if setting and setting.value:
        try:
            config = _json.loads(setting.value)
            if config.get("enabled"):
                ezproxy_prefix = config.get("ezproxy_prefix", "")
        except Exception:
            pass
    if not ezproxy_prefix:
        ezproxy_prefix = getattr(settings, "INSTITUTIONAL_EZPROXY_PREFIX", "")
    if not ezproxy_prefix:
        raise HTTPException(status_code=400, detail="未配置 EZProxy 前缀")

    publisher_url = _doi_to_publisher_url(doi.strip())
    proxied_url = f"{ezproxy_prefix}{publisher_url}"
    return {"doi": doi, "publisher_url": publisher_url, "proxied_url": proxied_url}


def _doi_to_publisher_url(doi: str) -> str:
    """根据 DOI 前缀直接构造出版商 URL（不依赖 doi.org）"""
    if doi.startswith("10.1016/"):
        return f"https://linkinghub.elsevier.com/retrieve/doi/{doi}"
    if doi.startswith("10.1007/"):
        return f"https://link.springer.com/article/{doi}"
    if doi.startswith("10.1038/"):
        return f"https://www.nature.com/articles/{doi.split('/')[-1]}"
    if doi.startswith("10.1002/") or doi.startswith("10.1111/"):
        return f"https://onlinelibrary.wiley.com/doi/{doi}"
    if doi.startswith("10.1080/"):
        return f"https://www.tandfonline.com/doi/full/{doi}"
    if doi.startswith("10.1177/"):
        return f"https://journals.sagepub.com/doi/{doi}"
    if doi.startswith("10.1109/"):
        return f"https://ieeexplore.ieee.org/document/{doi}"
    if doi.startswith("10.3390/"):
        return f"https://www.mdpi.com/{doi.split('/')[-1]}"
    if doi.startswith("10.3389/"):
        return f"https://www.frontiersin.org/articles/{doi}/full"
    # fallback
    return f"https://doi.org/{doi}"


@router.post("/upload", response_model=PaperResponse)
async def upload_paper_pdf(
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """
    上传 PDF 文件并创建/更新文献记录
    1. 保存 PDF 到本地
    2. 调用 process_uploaded_pdf 处理 (提取文本、获取元数据、入库、Embedding)
    """
    try:
        # 1. 确保目录存在
        pdf_dir = os.path.join(settings.PAPERS_PATH, "pdfs")
        os.makedirs(pdf_dir, exist_ok=True)
        
        # 2. 保存文件
        # 使用安全的文件名
        filename = file.filename or "uploaded_paper.pdf"
        safe_filename = os.path.basename(filename)
        file_path = os.path.join(pdf_dir, safe_filename)
        
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        logger.info(f"PDF uploaded to {file_path}")
        
        # 3. 调用服务层处理
        paper = await process_uploaded_pdf(db, file_path, safe_filename)

        return PaperResponse.model_validate(paper)

    except Exception as e:
        logger.error(f"Upload failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{paper_id}/pdf")
async def get_paper_pdf(
    paper_id: int,
    db: Session = Depends(get_db),
):
    """
    获取/预览文献PDF
    """
    paper = db.query(Paper).filter(Paper.id == paper_id).first()
    if not paper:
        raise HTTPException(status_code=404, detail="文献不存在")
        
    pdf_path = paper.pdf_path
    
    if not pdf_path or not os.path.exists(pdf_path):
        raise HTTPException(status_code=404, detail="PDF文件未找到或尚未下载")
        
    return FileResponse(
        pdf_path,
        media_type="application/pdf",
        filename=os.path.basename(pdf_path)
    )


@router.post("/backfill-embeddings")
async def backfill_embeddings(
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """
    为缺少 embedding 的 Paper 批量生成向量
    
    Args:
        limit: 本次最多处理多少条记录
    
    Returns:
        成功生成 embedding 的 Paper 数量
    """
    try:
        from app.services.embedding_service import get_embedding_service
        
        embedding_service = get_embedding_service()
        updated_count = await embedding_service.backfill_missing_embeddings(db, limit=limit)
        
        return {
            "success": True,
            "updated_count": updated_count,
            "message": f"成功为 {updated_count} 篇文献生成 embedding"
        }
    except Exception as e:
        logger.error(f"Backfill embeddings failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class ChunkPaperRequest(BaseModel):
    """PDF分块请求参数"""
    chunk_size: int = 800
    overlap: int = 100
    force: bool = False  # 是否强制重新分块（覆盖已有chunks）


@router.post("/{paper_id}/chunk")
async def chunk_paper_pdf(
    paper_id: int,
    req: ChunkPaperRequest = ChunkPaperRequest(),
    db: Session = Depends(get_db),
):
    """
    对单篇文献的 PDF 进行分块 + Embedding 入库

    1. 读取 PDF 文件，按页提取文本
    2. 使用 page-aware 分块算法切分为 chunks（保留页码信息）
    3. 写入 PaperChunk 表
    4. 批量生成 chunk embedding
    
    Args:
        paper_id: 文献 ID
        req.chunk_size: 每个 chunk 的目标字符数（默认 800）
        req.overlap: chunk 之间的重叠字符数（默认 100）
        req.force: 是否强制重新分块，覆盖已有 chunks
    """
    from app.models.paper_chunk import PaperChunk
    from app.services.embedding_service import get_embedding_service

    paper = db.query(Paper).filter(Paper.id == paper_id).first()
    if not paper:
        raise HTTPException(status_code=404, detail="文献不存在")

    pdf_path = paper.pdf_path
    if not pdf_path or not os.path.exists(pdf_path):
        raise HTTPException(status_code=400, detail="PDF文件未找到，请先下载PDF")

    # 检查是否已有 chunks
    existing_count = db.query(PaperChunk).filter(PaperChunk.paper_id == paper_id).count()
    if existing_count > 0 and not req.force:
        return {
            "success": True,
            "paper_id": paper_id,
            "chunks_created": 0,
            "chunks_embedded": 0,
            "message": f"该文献已有 {existing_count} 个 chunks，如需重新分块请设置 force=true",
            "skipped": True,
        }

    # 如果 force=true，先删除旧 chunks
    if existing_count > 0 and req.force:
        db.query(PaperChunk).filter(PaperChunk.paper_id == paper_id).delete()
        db.commit()
        logger.info(f"Paper {paper_id}: 已删除 {existing_count} 个旧 chunks")

    # 1. 按页提取文本
    pdf_service = get_pdf_service()
    try:
        page_texts = pdf_service.extract_text_by_pages(pdf_path)
    except Exception as e:
        logger.error(f"PDF文本提取失败 (paper_id={paper_id}): {e}")
        raise HTTPException(status_code=500, detail=f"PDF文本提取失败: {e}")

    if not page_texts:
        raise HTTPException(status_code=400, detail="PDF文件无法提取到文本内容")

    # 2. Page-aware 分块
    chunks_with_pages = pdf_service.chunk_text_with_pages(
        page_texts,
        chunk_size=req.chunk_size,
        overlap=req.overlap,
    )

    if not chunks_with_pages:
        raise HTTPException(status_code=400, detail="分块结果为空，PDF内容可能过短")

    # 3. 写入 PaperChunk 表
    db_chunks = []
    for cwp in chunks_with_pages:
        chunk = PaperChunk(
            paper_id=paper_id,
            chunk_index=cwp.chunk_index,
            content=cwp.content,
            page_number=cwp.page_number,  # 主页码
        )
        db.add(chunk)
        db_chunks.append(chunk)

    db.commit()
    # 刷新获取自增 ID
    for c in db_chunks:
        db.refresh(c)

    logger.info(f"Paper {paper_id}: 创建了 {len(db_chunks)} 个 chunks")

    # 4. 批量生成 chunk embedding
    embedding_service = get_embedding_service()
    embedded_count = 0
    try:
        embedded_count = await embedding_service.embed_chunks_batch(db, db_chunks)
        logger.info(f"Paper {paper_id}: 为 {embedded_count} 个 chunks 生成了 embedding")
    except Exception as e:
        logger.warning(f"Paper {paper_id}: chunk embedding 生成部分失败: {e}")

    return {
        "success": True,
        "paper_id": paper_id,
        "chunks_created": len(db_chunks),
        "chunks_embedded": embedded_count,
        "total_pages": len(page_texts),
        "message": f"成功为文献创建 {len(db_chunks)} 个分块，{embedded_count} 个已生成 embedding",
        "skipped": False,
    }


@router.post("/chunk-all")
async def chunk_all_papers(
    req: ChunkPaperRequest = ChunkPaperRequest(),
    limit: int = 50,
    db: Session = Depends(get_db),
):
    """
    批量对所有有 PDF 的文献进行分块 + Embedding
    
    - 仅处理有 pdf_path 且文件存在的文献
    - 默认跳过已有 chunks 的文献（force=true 时覆盖）
    - 通过 limit 控制单次处理数量
    """
    from app.models.paper_chunk import PaperChunk
    from app.services.embedding_service import get_embedding_service

    # 查询所有有 pdf_path 的文献
    papers = db.query(Paper).filter(Paper.pdf_path.isnot(None)).limit(limit).all()

    pdf_service = get_pdf_service()
    embedding_service = get_embedding_service()

    results = {
        "total_papers": len(papers),
        "processed": 0,
        "skipped": 0,
        "failed": 0,
        "total_chunks_created": 0,
        "total_chunks_embedded": 0,
        "errors": [],
    }

    for paper in papers:
        try:
            # 检查 PDF 文件是否存在
            if not paper.pdf_path or not os.path.exists(paper.pdf_path):
                results["skipped"] += 1
                continue

            # 检查是否已有 chunks
            existing = db.query(PaperChunk).filter(
                PaperChunk.paper_id == paper.id
            ).count()
            if existing > 0 and not req.force:
                results["skipped"] += 1
                continue

            # 删除旧 chunks（如果 force）
            if existing > 0 and req.force:
                db.query(PaperChunk).filter(
                    PaperChunk.paper_id == paper.id
                ).delete()
                db.commit()

            # 提取 + 分块
            page_texts = pdf_service.extract_text_by_pages(paper.pdf_path)
            if not page_texts:
                results["skipped"] += 1
                continue

            chunks_with_pages = pdf_service.chunk_text_with_pages(
                page_texts,
                chunk_size=req.chunk_size,
                overlap=req.overlap,
            )

            if not chunks_with_pages:
                results["skipped"] += 1
                continue

            # 写入 DB
            db_chunks = []
            for cwp in chunks_with_pages:
                chunk = PaperChunk(
                    paper_id=paper.id,
                    chunk_index=cwp.chunk_index,
                    content=cwp.content,
                    page_number=cwp.page_number,
                )
                db.add(chunk)
                db_chunks.append(chunk)

            db.commit()
            for c in db_chunks:
                db.refresh(c)

            results["total_chunks_created"] += len(db_chunks)

            # 生成 embedding
            try:
                embedded = await embedding_service.embed_chunks_batch(db, db_chunks)
                results["total_chunks_embedded"] += embedded
            except Exception as e:
                logger.warning(f"Paper {paper.id} chunk embedding failed: {e}")

            results["processed"] += 1

        except Exception as e:
            results["failed"] += 1
            results["errors"].append({"paper_id": paper.id, "error": str(e)})
            logger.error(f"Chunk processing failed for paper {paper.id}: {e}")

    results["message"] = (
        f"批量分块完成: {results['processed']} 篇处理成功, "
        f"{results['skipped']} 篇跳过, {results['failed']} 篇失败, "
        f"共创建 {results['total_chunks_created']} 个分块"
    )

    return results


@router.post("/backfill-chunk-embeddings")
async def backfill_chunk_embeddings(
    limit: int = 500,
    db: Session = Depends(get_db),
):
    """
    为缺少 embedding 的 PaperChunk 批量生成向量
    
    Args:
        limit: 本次最多处理多少条 chunk 记录
    """
    try:
        from app.services.embedding_service import get_embedding_service

        embedding_service = get_embedding_service()
        updated_count = await embedding_service.backfill_missing_chunk_embeddings(
            db, limit=limit
        )

        return {
            "success": True,
            "updated_count": updated_count,
            "message": f"成功为 {updated_count} 个 chunk 生成 embedding",
        }
    except Exception as e:
        logger.error(f"Backfill chunk embeddings failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── 正式库信息补齐 ──────────────────────────────────────────


class LibraryEnrichRequest(BaseModel):
    ids: Optional[List[int]] = None
    only_missing_abstract: bool = True


@router.post("/enrich")
async def enrich_library_papers_endpoint(
    payload: LibraryEnrichRequest,
    db: Session = Depends(get_db),
):
    """
    批量补齐正式文献库的 abstract 和其他元数据。
    通过 DOI 从 CrossRef / Semantic Scholar / OpenAlex 交叉补齐。
    """
    from app.services.enrichment_service import enrich_library_papers

    result = await enrich_library_papers(
        db=db,
        paper_ids=payload.ids,
        only_missing_abstract=payload.only_missing_abstract,
    )

    return {
        "success": True,
        "total": result.total,
        "enriched": result.enriched,
        "skipped": result.skipped,
        "failed": result.failed,
        "details": [
            {
                "paper_id": d.paper_id,
                "enriched_fields": d.enriched_fields,
                "sources_used": d.sources_used,
            }
            for d in result.details
        ],
    }