# API 文档

本系统后端基于 FastAPI 构建，提供 RESTful API 和 WebSocket 接口。

## 1. 基础信息

*   **Base URL**: `/api`
*   **文档地址**: 启动服务后访问 `http://localhost:8000/docs` (Swagger UI) 或 `http://localhost:8000/redoc`。

## 2. 核心接口概览

### 2.1 文献管理 (Papers)

*   `GET /api/papers/`: 获取文献列表，支持分页、筛选（关键词、年份、来源等）。
*   `GET /api/papers/{paper_id}`: 获取单篇文献详情。
*   `POST /api/papers/`: 手动创建文献。
*   `PUT /api/papers/{paper_id}`: 更新文献信息。
*   `DELETE /api/papers/{paper_id}`: 删除文献。
*   `POST /api/papers/search`: (旧版) 直接触发搜索并返回结果。

### 2.2 暂存区 (Staging Papers)

*   `GET /api/staging/`: 获取暂存区文献列表。
*   `POST /api/staging/promote`: 将暂存文献提升为正式文献。
    *   参数: `paper_ids` (List[int])
*   `DELETE /api/staging/{paper_id}`: 删除暂存文献。

### 2.3 爬虫任务 (Crawl Jobs)

*   `POST /api/crawl/jobs`: 创建新的爬虫任务。
    *   参数: `keywords`, `sources`, `year_from`, `year_to`, `limit`
*   `GET /api/crawl/jobs`: 获取任务列表。
*   `GET /api/crawl/jobs/{job_id}`: 获取任务详情。
*   `GET /api/crawl/jobs/latest_status`: 获取最新任务状态（用于轮询）。

### 2.4 综述生成 (Reviews)

*   `POST /api/reviews/generate`: 生成综述。
    *   参数: `title`, `paper_ids`, `outline_only` (是否仅生成大纲)
*   `GET /api/reviews/`: 获取综述列表。
*   `GET /api/reviews/{review_id}`: 获取综述详情。
*   `POST /api/reviews/{id}/export`: 导出综述。
    *   参数: `format` (markdown/html/pdf), `include_references`

### 2.5 RAG 语义检索 (Semantic Search)

*   `POST /api/semantic-search/search`: 执行语义检索。
    *   参数: `query`, `limit`, `enable_expansion`
*   `WS /api/semantic-search/ws`: WebSocket 接口，用于流式检索和调试。
    *   **Client Send**: `{"type": "search", "payload": {"query": "...", "limit": 20}}`
    *   **Server Push**:
        *   `{"type": "debug", "debug": {...}}` (中间状态)
        *   `{"type": "partial_result", "items": [...]}` (部分结果)
        *   `{"type": "done", "total": ...}` (完成)
        *   `{"type": "error", "message": "..."}` (错误)

### 2.6 系统配置 (Settings)

*   `GET /api/settings/`: 获取当前配置。
*   `POST /api/settings/`: 更新配置（如 API Keys）。
*   `POST /api/debug/external-sources/test`: 测试外部数据源连通性。

## 3. 数据模型 Schema

详细 Schema 定义请参考 Swagger UI (`/docs`) 中的 Schemas 部分。主要包括：

*   `PaperCreate` / `PaperResponse`
*   `ReviewCreate` / `ReviewResponse`
*   `CrawlJobCreate` / `CrawlJobResponse`
*   `StagingPaperResponse`