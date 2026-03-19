# 城市设计文献综述系统 – 后端阶段进度总结

更新时间：2025-11-14

---

## 1. 总体状态

目前后端部分已经完成了从「文献检索 → 存储与下载 → LLM 生成综述 → 通过 API 对外提供服务」的完整闭环，实现了你最初提出的核心能力：

> 通过爬虫按关键词批量检索文献，可以下载文献，并由 LLM 自动生成综述框架和详细内容，对外暴露为 HTTP API，准备连接前端。

前端 React 应用尚未实现，导出、认证等增强功能暂未开发。

---

## 2. 项目结构与配置

### 2.1 项目结构

后端基础目录结构：

- `backend/run.py`：后端启动脚本（使用 uvicorn 启动 FastAPI 应用）。
- `backend/app/__init__.py`：应用包标记。
- `backend/app/main.py`：FastAPI 主应用入口。
- `backend/app/config.py`：配置管理（Pydantic Settings）。
- `backend/app/database.py`：数据库引擎和 Session 管理。
- `backend/app/models/`：数据库 ORM 模型。
- `backend/app/schemas/`：Pydantic 模型（请求/响应 Schema）。
- `backend/app/services/`：
  - `crawler/`：文献爬虫服务（目前实现 Arxiv）。
  - `llm/`：LLM 服务（OpenAI 兼容接口）。
  - `review/`：预留综述服务包（当前主要逻辑在 API + LLM 服务中）。
- `backend/app/api/`：FastAPI 路由（papers、reviews）。
- `backend/app/utils/`：工具模块（预留）。
- `backend/.env`：环境变量配置。
- `data/papers/`：PDF 文献存储目录。
- `data/exports/`：综述导出文件存储目录（预留）。

所有必要的 `__init__.py` 已补齐，确保 Python 包导入行为正常。

### 2.2 配置系统

配置文件：[`backend/app/config.py`](backend/app/config.py:10)

- 使用 `pydantic_settings.SettingsConfigDict` 管理配置：
  - `env_file=".env"`
  - `env_file_encoding="utf-8"`
- 主要配置项：
  - 应用：
    - `APP_NAME` – 默认 `Literature Review System`
    - `APP_VERSION` – 默认 `1.0.0`
    - `DEBUG` – 默认 `True`
    - `HOST` – 默认 `0.0.0.0`
    - `PORT` – 默认 `8000`（.env 中已改为 5555）
  - 数据库：
    - `DATABASE_URL` – 默认 `sqlite:///./literature.db`
  - Redis（预留）：
    - `REDIS_HOST` / `REDIS_PORT` / `REDIS_DB` / `REDIS_PASSWORD`
    - `REDIS_URL` 属性自动拼接
  - OpenAI：
    - `OPENAI_API_KEY`
    - `OPENAI_BASE_URL` – 默认 `https://api.openai.com/v1`（实际已配置为代理地址）
    - `OPENAI_MODEL` – 默认 `gpt-4`
  - 爬虫：
    - `CRAWLER_DELAY_MIN` / `CRAWLER_DELAY_MAX`
    - `CRAWLER_MAX_RETRIES`
    - `CRAWLER_TIMEOUT`
  - 文件目录：
    - `PAPERS_DIR` – 默认 `../data/papers`
    - `EXPORTS_DIR` – 默认 `../data/exports`
    - `PAPERS_PATH` / `EXPORTS_PATH` 属性计算绝对路径
  - CORS：
    - `CORS_ORIGINS = ["http://localhost:3000", "http://localhost:3001", "http://127.0.0.1:3000"]`
  - JWT（预留）：
    - `SECRET_KEY`
    - `ALGORITHM`
    - `ACCESS_TOKEN_EXPIRE_MINUTES`

调整点：

- 原本在模块导入时调用 `settings.create_directories()` 会带来导入副作用，目前已经去掉，改为在应用生命周期中执行（见下文）。

---

## 3. 数据库与模型层

### 3.1 数据库

文件：[`backend/app/database.py`](backend/app/database.py:1)

- 使用 SQLAlchemy 2.x + SQLite：
  - 创建 Engine (`create_engine`)
  - 提供 `SessionLocal` 用于依赖注入
  - `Base` 作为 ORM 基类
- 提供 `init_db()` 用于在启动时创建所有表。

### 3.2 模型设计

#### Paper 文献模型

文件：[`backend/app/models/paper.py`](backend/app/models/paper.py:1)

核心字段（简述）：

- `id`: 主键
- `title`: 文献标题
- `authors`: 作者列表（JSON / Text 形式）
- `abstract`: 摘要
- `doi`: DOI
- `arxiv_id`: Arxiv ID
- `source`: 数据源（例如 `arxiv`、`google_scholar`、`pubmed`）
- `year` / `published_at`: 发表年份/时间
- `pdf_url`: PDF 下载链接
- `pdf_path`: 本地 PDF 文件存储路径
- `categories`: 分类标签
- `keywords`: 关键词列表

#### Review 综述模型 + ReviewPaper 关联模型

文件：[`backend/app/models/review.py`](backend/app/models/review.py:1)

- `Review`：
  - `id`: 主键
  - `title`: 综述标题（可由用户指定或自动生成）
  - `keywords`: 主题关键词列表
  - `framework`: 综述章节框架（LLM 生成）
  - `content`: 综述详细正文（LLM 生成）
  - `status`: 状态（`draft` / `generating` / `completed` / `failed`）
- `ReviewPaper`：
  - 连接 `review_id` 与 `paper_id`，实现多对多关系

启动时 SQLAlchemy 日志确认表已成功创建。

---

## 4. 服务层功能

### 4.1 Arxiv 爬虫服务

文件：[`backend/app/services/crawler/arxiv_crawler.py`](backend/app/services/crawler/arxiv_crawler.py:1)

功能概述：

- 使用 `arxiv` Python 库封装 Arxiv 检索：
  - 根据关键词、时间范围、结果数量构建查询；
  - 支持分页拉取结果；
  - 控制请求频率与超时；
  - 数据结构转化为内部 `Paper` 格式。
- 下载 PDF 功能：
  - `download_pdf(paper)` 将 `paper.pdf_url` 内容存至 `PAPERS_PATH`；
  - 更新 `paper.pdf_path` 字段；
  - 使用重试机制保障下载稳定性。

整体实现了基于关键词从 Arxiv 批量检索和保存 PDF 的功能，满足“爬虫抓文献”的后端要求。

### 4.2 LLM 服务（OpenAI 兼容）

文件：[`backend/app/services/llm/openai_service.py`](backend/app/services/llm/openai_service.py:1)

功能概述：

- 使用 `openai` 1.x 异步客户端（Async API），通过环境变量配置：
  - `OPENAI_API_KEY`
  - `OPENAI_BASE_URL`
  - `OPENAI_MODEL`
- 已实现方法：
  1. `generate_review_framework(keywords, papers)`  
     根据主题关键词和文献列表让 LLM 输出结构化的综述框架（目录/章节）。
  2. `generate_review_content(framework, papers)`  
     在框架基础上，让 LLM 生成完整的综述正文。
  3. `summarize_paper(paper)`  
     对单篇文献生成摘要和要点，可用于更精细的综述输入。

该服务是“文献综述自动撰写”的核心依赖。

---

## 5. API 层：当前可用接口

FastAPI 应用入口文件：[`backend/app/main.py`](backend/app/main.py:33)

### 5.1 应用生命周期（lifespan）

- 启动时：
  - 打印启动日志：
    - “🚀 启动文献综述系统...”
  - 执行 `settings.create_directories()` 创建 `data/papers` 和 `data/exports` 目录；
  - 调用 `init_db()` 创建数据库表；
  - 打印：
    - “✅ 数据库表创建成功！”
    - “✓ 数据库初始化完成”
    - “✅ 系统启动成功！”
- 关闭时：
  - 打印 “👋 系统关闭”。

### 5.2 通用路由

- `GET /`
  - 返回应用基本信息：名称、版本、状态、docs 链接。
- `GET /api/health`
  - 健康检查：返回 status/app/version 信息。
- 文档：
  - `/api/openapi.json` – OpenAPI 规范
  - `/api/docs` – Swagger UI（已验证正常）
  - `/api/redoc` – ReDoc（当前因官方 CDN 链接 404 导致空白，不影响 API）

### 5.3 文献相关 API

文件：[`backend/app/api/papers.py`](backend/app/api/papers.py:1)

典型功能（逻辑已实现）：

1. `POST /api/papers/search`
   - 输入：关键词列表、时间范围、数据源（当前主要是 `arxiv`）、结果数量等。
   - 流程：
     - 调用 Arxiv 爬虫批量检索文献；
     - 去重后写入数据库；
     - 返回本次新增或匹配的文献信息。
   - 用途：满足“通过关键词批量检索文献”的需求。

2. `GET /api/papers`
   - 功能：
     - 从本地数据库分页查询文献；
     - 支持按关键词、来源、年份等进行过滤（视 schema 定义而定）。
   - 用途：为前端列表展示提供数据。

3. `GET /api/papers/{paper_id}`
   - 功能：
     - 返回指定文献的详细信息（标题、摘要、来源、PDF 状态等）。

4. `POST /api/papers/{paper_id}/download`
   - 功能：
     - 触发后台任务下载指定文献的 PDF 文件；
     - 使用 `BackgroundTasks` 异步执行，避免阻塞请求；
     - 下载成功后更新 `pdf_path`。

通过这些接口，后端已经具备“检索 → 存储 → 下载管理”的完整文献管理能力。

### 5.4 综述相关 API

文件：[`backend/app/api/reviews.py`](backend/app/api/reviews.py:1)

典型功能：

1. `POST /api/reviews/generate`
   - 输入：综述任务请求（关键词、时间范围、最大文献数量等）。
   - 流程（典型设计）：
     1. 基于关键词和时间范围检索/选择一批文献（可依赖 papers API 或直接查询 DB）。
     2. 调用 LLM：
        - 先生成综述框架；
        - 再生成详细正文。
     3. 将生成的 `framework` 和 `content` 以及关联文献写入 `Review` 与 `ReviewPaper` 表。
     4. 返回生成的综述对象，包含状态（如 `generating` → `completed`）。
   - 注意：内部已修复异步调用逻辑，确保后台任务能正常使用 async/await 和独立 Session。

2. `GET /api/reviews`
   - 功能：
     - 分页返回已生成的综述列表，含标题、关键词、状态等基本信息。

3. `GET /api/reviews/{review_id}`
   - 功能：
     - 返回单个综述的完整内容：框架和正文等。

4. `GET /api/reviews/{review_id}/papers`
   - 功能：
     - 返回与该综述关联的所有文献列表。

综述 API 使后端具备了“自动汇总综述框架和详细内容”的能力，和文献检索部分构成完整闭环。

---

## 6. 当前验证情况

- 在终端中执行：

  ```bash
  cd backend
  python run.py
  ```

- 日志确认：
  - Uvicorn 在 `http://0.0.0.0:5555` 运行；
  - 启动生命周期执行成功（目录、数据库）；
  - 应用处于「启动成功，等待请求」状态。

已经手动验证：

- `/api/health` – 正常返回健康状态 JSON；
- `/api/docs` – Swagger UI 正常显示所有接口；
- `/api/openapi.json` – 返回完整 OpenAPI 规范；
- `/api/redoc` – 受制于 ReDoc CDN 链接 404，暂时空白（外部依赖问题，已确认不会影响接口功能）。

---

## 7. 尚未完成 / 后续计划（后端视角）

从后端角度，已经完成的主要是「文献爬虫 + LLM 综述生成」的核心流程，还有一些工作在后续计划中：

1. 前端：
   - React + TypeScript 应用尚未开发；
   - 需要实现：
     - 关键词搜索界面；
     - 文献列表展示与筛选；
     - 综述生成任务发起与过程状态展示；
     - 综述结果查看与导出界面。

2. 导出功能：
   - 后端尚未实现：
     - 综述导出为 Markdown、Word（docx）、PDF；
   - `python-docx`、`markdown` 等依赖已在 `requirements.txt` 中，准备就绪。

3. 认证与权限：
   - 尚未接入 JWT 登录、用户管理；
   - API Key 管理机制未实现。

4. 性能与缓存：
   - Redis 已配置但未正式启用；
   - 后续可考虑：
     - 缓存热门检索结果；
     - 对 LLM 调用结果做缓存。

5. 部署与文档：
   - 部署脚本（Dockerfile、docker-compose 等）在 `docker/` 目录下尚未细化；
   - 需要补充部署指南和端到端使用说明。

---

## 8. 一句话总结

**当前阶段：**  
后端已经具备「按关键词从 Arxiv 批量检索城市设计文献 → 存库和可下载 PDF → 调用 LLM 生成综述框架与详细内容 → 通过 REST API 对外提供」的完整能力，处于“可以开始对接前端和进行实际文献综述实验”的状态。  