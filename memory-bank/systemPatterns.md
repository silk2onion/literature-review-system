# System Patterns - 城市设计文献综述系统

## 1. 后端架构模式

- 分层架构：
  - API 层：FastAPI 路由模块 app/api/*。
  - Service 层：app/services/*。
  - Domain/Model 层：app/models/* + app/schemas/*。
  - Infra 层：app/database, app/config, app/utils。
- 关键模式：
  - Repository-ish：由 SQLAlchemy Session + Model 直接操作数据库，辅以 service 封装。
  - 任务管线：CrawlJob + crawl_service.run_crawl_job_once 实现“多轮抓取 → 去重入库 → 统计更新”的流水线。
  - LLM Facade：OpenAIService 对 OpenAI/SaaS LLM 提供统一接口。

## 2. 前端架构模式

- SPA + 路由：React + React Router，在 App.tsx 中注册多个页面组件。
- 状态管理：目前以组件局部 state + props 为主，后续如需要可替换为轻量全局状态（例如 Zustand）。
- UI 结构：顶部导航 + 内容区，主要页面为“文献库”“综述助手”“抓取任务列表”“设置”。

## 3. RAG / 语义检索设计模式（规划中）

- 语义组网：SemanticGroupService 基于城市设计术语的“语义组”进行关键词扩展与激活强度计算。
- 向量检索服务：SemanticSearchService 负责
  - 调用 EmbeddingService 生成查询向量；
  - 从 Paper.embedding 载入候选向量；
  - 计算余弦相似度并返回 top K。
- RAG 开关：通过 Settings API 暴露 rag.enabled，控制综述生成是否走“语义检索增强”路径。
- 可视化调试：后续通过 HTTP + WebSocket 接口向前端暴露检索过程中的中间信息（扩展关键词、激活语义组、相似度等）。

## 4. 部署与运行模式

- 开发环境：本地 FastAPI 开发服务器 + React 开发服务器，SQLite 持久化。
- 生产环境（规划）：使用 Uvicorn/Gunicorn + Nginx 作为后端入口，前端构建为静态资源，由 Nginx 提供；数据库可切换为 PostgreSQL。

## 5. 时间戳

- [2025-11-15 04:36:50] - 初始化 systemPatterns.md，记录当前 FastAPI + React 架构与计划中的 RAG 模式。