"""
FastAPI主应用
城市设计文献综述系统后端
"""
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
import logging
import uvicorn

from app.config import settings
from app.database import init_db
from app.api import (
    papers_router,
    reviews_router,
    crawl_router,
    semantic_search_router,
    staging_papers_router,
    citations_router,
    citation_analysis_router,
    journal_info_router,
    recall_logs_router,
    groups_router,
)
from app.api import settings as settings_api
from app.api.agent import router as agent_router
from app.services.agent_heartbeat import heartbeat_service


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    应用生命周期管理
    启动时初始化数据库，关闭时清理资源
    """
    # 启动时执行
    print("🚀 启动文献综述系统...")
    
    # 创建必要的目录
    settings.create_directories()
    print("✓ 数据目录创建完成")
    
    # 初始化数据库
    init_db()
    print("✓ 数据库初始化完成")
    
    # 启动 AI 助手主动心跳
    await heartbeat_service.start()
    print("✓ AI 助手主动心跳已启动")
    
    print("✅ 系统启动成功！")
    
    yield
    
    # 关闭时执行
    print("👋 系统关闭")


# 创建FastAPI应用实例
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="基于爬虫和LLM的智能文献综述生成系统",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
    lifespan=lifespan
)

# 全局 logger
logger = logging.getLogger("app")

# 配置CORS
logger.info(f"配置 CORS，允许来源: {settings.CORS_ORIGINS}")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# 根路由
@app.get("/")
async def root():
    """系统首页"""
    return {
        "name": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "status": "running",
        "docs": "/api/docs"
    }


# 健康检查
@app.get("/api/health")
async def health_check(request: Request):
    """健康检查端点"""
    logger.info(
        "[health_check] from %s %s",
        request.client.host if request.client else "-",
        request.headers.get("user-agent", "-"),
    )
    return {
        "status": "healthy",
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION
    }


# 注册API路由
app.include_router(papers_router)
app.include_router(reviews_router)
app.include_router(crawl_router)
app.include_router(semantic_search_router)
app.include_router(staging_papers_router)
app.include_router(citations_router)
app.include_router(citation_analysis_router)
app.include_router(journal_info_router)
app.include_router(recall_logs_router)
app.include_router(groups_router)
app.include_router(settings_api.router)
app.include_router(agent_router)


# 全局异常处理
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """全局异常处理器"""
    logger.exception(
        "[global_exception] path=%s method=%s error=%s",
        request.url.path,
        request.method,
        exc,
    )
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "error": str(exc),
            "message": "服务器内部错误"
        }
    )


if __name__ == "__main__":
    # 直接运行此文件时使用uvicorn启动
    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG
    )