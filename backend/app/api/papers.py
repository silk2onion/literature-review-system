"""
Papers API路由
"""
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List
import logging
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
from app.models.paper import Paper
from app.services.crawler import ArxivCrawler
from app.config import get_settings
from app.utils.cache import search_cache

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
        logger.info(f"搜索文献: {search_request.keywords}")

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

        all_papers = []

        # 2. Arxiv 搜索
        if "arxiv" in search_request.sources:
            try:
                arxiv_crawler = ArxivCrawler(settings)
                arxiv_papers = arxiv_crawler.search(
                    keywords=search_request.keywords,
                    max_results=search_request.limit,
                    year_from=search_request.year_from,
                    year_to=search_request.year_to,
                )

                # 保存到数据库 & 避免重复
                for paper in arxiv_papers:
                    existing = (
                        db.query(Paper)
                        .filter(Paper.arxiv_id == paper.arxiv_id)
                        .first()
                    )

                    if not existing:
                        db.add(paper)
                        all_papers.append(paper)
                    else:
                        all_papers.append(existing)

                db.commit()
                logger.info(f"Arxiv搜索完成: {len(arxiv_papers)} 篇")
            except Exception as e:
                logger.error(f"Arxiv搜索失败: {e}")

        # TODO: 添加其他数据源（Google Scholar、PubMed等）

        paper_responses = [
            PaperResponse.model_validate(paper) for paper in all_papers
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
        query = db.query(Paper)

        # 关键词模糊匹配
        if payload.q:
            like_pattern = f"%{payload.q.strip()}%"
            query = query.filter(
                or_(
                    Paper.title.ilike(like_pattern),
                    Paper.abstract.ilike(like_pattern),
                )
            )

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
        )
    except Exception as e:
        logger.error(f"本地文献库检索失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/", response_model=List[PaperResponse])
async def list_papers(
    skip: int = 0,
    limit: int = 20,
    db: Session = Depends(get_db)
):
    """获取文献列表"""
    papers = db.query(Paper).offset(skip).limit(limit).all()
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
    """手动创建文献记录"""
    paper = Paper(**paper_data.model_dump())
    db.add(paper)
    db.commit()
    db.refresh(paper)
    return PaperResponse.model_validate(paper)


@router.put("/{paper_id}", response_model=PaperResponse)
async def update_paper(
    paper_id: int,
    paper_data: PaperUpdate,
    db: Session = Depends(get_db)
):
    """更新文献信息"""
    paper = db.query(Paper).filter(Paper.id == paper_id).first()
    if not paper:
        raise HTTPException(status_code=404, detail="文献不存在")
    
    # 更新字段
    update_data = paper_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(paper, field, value)
    
    db.commit()
    db.refresh(paper)
    return PaperResponse.model_validate(paper)


@router.delete("/{paper_id}")
async def delete_paper(paper_id: int, db: Session = Depends(get_db)):
    """删除文献"""
    paper = db.query(Paper).filter(Paper.id == paper_id).first()
    if not paper:
        raise HTTPException(status_code=404, detail="文献不存在")
    
    db.delete(paper)
    db.commit()
    return {"message": "文献已删除"}


@router.post("/{paper_id}/download")
async def download_paper_pdf(
    paper_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """
    下载文献PDF
    
    后台任务异步下载
    """
    paper = db.query(Paper).filter(Paper.id == paper_id).first()
    if not paper:
        raise HTTPException(status_code=404, detail="文献不存在")
    
    if not paper.pdf_url:
        raise HTTPException(status_code=400, detail="该文献没有PDF链接")
    
    # 添加后台下载任务
    def download_task():
        try:
            arxiv_crawler = ArxivCrawler(settings)
            pdf_path = arxiv_crawler.download_pdf(
                paper,
                download_dir=settings.DOWNLOAD_DIR
            )
            if pdf_path:
                paper.pdf_path = pdf_path
                db.commit()
                logger.info(f"PDF下载成功: {pdf_path}")
        except Exception as e:
            logger.error(f"PDF下载失败: {e}")
    
    background_tasks.add_task(download_task)
    
    return {
        "message": "PDF下载任务已启动",
        "paper_id": paper_id
    }