# Product Context - 城市设计文献综述系统

## 1. 项目目标

- 面向城市设计 / 城市规划领域研究者，提供一站式文献检索、管理与综述写作辅助。
- 通过多数据源爬虫批量获取文献，集中存储到本地数据库。
- 使用 LLM 自动生成综述大纲、正文与结构化分析结果，支持导出与后期编辑。

## 2. 当前实现状态（以代码为准）

- 后端：FastAPI 应用 app.main:app，使用 SQLAlchemy + SQLite。
- 数据模型：Paper / Review / CrawlJob 等，存储在 backend/app/models/ 目录。
- 爬虫：支持 Arxiv、多源 Orchestrator（SerpAPI Scholar、Scopus 占位等），统一通过 search_across_sources 调用。
- 文献管理：本地文献搜索 API search_papers_local 提供分页与按年过滤。
- LLM：OpenAI 兼容客户端封装在 app/services/llm 中，用于生成综述框架与详细内容。
- 前端：React + TypeScript + Vite，提供关键词搜索、文献库浏览、综述生成与抓取任务监控等页面。

> 说明：仓库中的文档 architecture.md、implementation-guide.md 与 quick-start.md 以 Flask 为例进行说明，实际实现以 FastAPI 项目结构为准。Memory Bank 用于记录“实际实现”的演进情况。

## 3. 关键特性（当前 vs 规划）

- 已实现：
  - 多源关键词检索 + 去重入库；
  - 本地文献库检索与前端展示；
  - 基于 LLM 的综述生成（支持按 CrawlJob 或关键词触发）；
  - 抓取任务管理与前端任务列表。

- 规划中：
  - RAG 语义检索与可视化调试面板；
  - 文献分组与基于分组的综述；
  - 期刊分区 / 收录平台信息增强；
  - 多格式导出（Markdown / HTML / PDF）；
  - 更完善的批量抓取监控与错误恢复。

## 4. 时间戳

- [2025-11-15 04:35:16] - 初始化 productContext.md，基于现有代码与文档建立产品级概览。