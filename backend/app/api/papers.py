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
    restore_papers,
)
from app.schemas.paper import PaperBatchDelete
from app.services.paper_ingest import (
    insert_or_update_staging_from_sources,
    paper_to_source_paper,
)
from app.services.pdf_service import PDFDownloadService, get_pdf_service
from app.services.semantic_groups import get_semantic_group_service
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
    papers = query.offset(skip).limit(limit).all()
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


@router.post("/{paper_id}/download-pdf")
async def download_paper_pdf(
    paper_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """
    下载文献PDF (异步后台任务)
    """
    paper = db.query(Paper).filter(Paper.id == paper_id).first()
    if not paper:
        raise HTTPException(status_code=404, detail="文献不存在")

    # Check if PDF URL exists
    pdf_url = getattr(paper, "pdf_url", None)
    if not pdf_url:
        raise HTTPException(status_code=400, detail="该文献没有PDF链接")

    # Define background task
    async def download_task():
        try:
            # Re-create session for background task if needed,
            # but here we use the service which uses the passed db session.
            # Note: In FastAPI background tasks, it's safer to create a new session
            # or ensure the session isn't closed before the task runs.
            # For simplicity here, we'll assume the service handles it or we catch errors.
            # BETTER APPROACH: Create a new session scope inside the task.
            from app.database import SessionLocal
            with SessionLocal() as session:
                service = PDFDownloadService(session)
                await service.download_paper_pdf(paper_id)
                logger.info(f"PDF downloaded successfully for paper {paper_id}")
        except Exception as e:
            logger.error(f"Failed to download PDF for paper {paper_id}: {e}")

    background_tasks.add_task(download_task)

    return {"message": "PDF下载任务已启动", "paper_id": paper_id}


@router.post("/upload", response_model=PaperResponse)
async def upload_paper_pdf(
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """
    上传 PDF 文件并创建/更新文献记录
    1. 保存 PDF 到本地
    2. 提取文本和 DOI
    3. 尝试匹配已有文献或创建新文献
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
        
        # 3. 提取信息
        pdf_service = get_pdf_service()
        text = pdf_service.extract_text(file_path)
        doi = pdf_service.find_doi(text)
        
        # 4. 尝试匹配已有文献
        paper = None
        if doi:
            paper = db.query(Paper).filter(Paper.doi == doi).first()
            
        if paper:
            logger.info(f"Found existing paper by DOI {doi}: {paper.id}")
            # 更新 PDF 路径
            paper.pdf_path = file_path
            db.commit()
            db.refresh(paper)
        else:
            # 创建新文献
            # 尝试从文件名猜测标题
            title_guess = os.path.splitext(safe_filename)[0].replace("_", " ").replace("-", " ")
            
            new_paper = Paper(
                title=title_guess,
                doi=doi,
                pdf_path=file_path,
                source="upload",
                year=datetime.now().year, # 默认当前年份
                is_archived=False
            )
            db.add(new_paper)
            db.commit()
            db.refresh(new_paper)
            paper = new_paper
            
            # 尝试生成 embedding (如果有文本)
            if text:
                # 截取前 5000 字符作为摘要/内容，避免过长
                paper.abstract = text[:5000]
                db.commit()
                
                try:
                    from app.services.embedding_service import get_embedding_service
                    embedding_service = get_embedding_service()
                    await embedding_service.embed_paper(paper)
                    db.commit()
                except Exception as e:
                    logger.warning(f"Failed to generate embedding for uploaded paper: {e}")

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