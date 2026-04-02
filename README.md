# ScholarNative — 学术文献综述生成系统

> **面向城市设计 / 城市规划 PhD 研究者的端到端文献综述辅助系统**
>
> 多源爬虫采集 → 暂存库审核 → 正式文献库 → 语义检索 (RAG) → LLM 自动生成学术级综述 → `[[REF_x]]` 确定性引用追踪

---

## 目录

- [系统概览](#系统概览)
- [核心特性](#核心特性)
- [技术架构](#技术架构)
- [快速启动](#快速启动)
- [功能详解](#功能详解)
- [API 参考](#api-参考)
- [数据模型](#数据模型)
- [前端页面](#前端页面)
- [配置说明](#配置说明)
- [Docker 部署](#docker-部署)
- [开发路线](#开发路线)

---

## 系统概览

ScholarNative 是一个全栈学术辅助系统，覆盖从文献采集到综述写作的完整链路：

```
关键词 → 多源爬虫 → 暂存库审核 → 正式文献库 → Embedding 向量化
                                                        ↓
                                              语义检索 (RAG) ← 查询
                                                        ↓
                                              LLM 综述生成（含 [[REF_x]] 引用锚定）
                                                        ↓
                                              多格式导出 (Markdown)
```

**当前状态**：系统已完成端到端验证，单次运行可生成 **7 章节、30+ 篇文献引用、22,000+ 词**的完整学术综述，支持 Harvard / APA / IEEE / Chicago / Vancouver 五种引用格式。

---

## 核心特性

### 📚 多源文献采集

- **6 大学术数据源**：Arxiv、Google Scholar (SerpAPI)、Scopus、CrossRef、Semantic Scholar、OpenAlex
- **两阶段入库**：爬取结果先进暂存库 (StagingPaper)，人工审核后提升至正式库 (Paper)
- **批量任务管理**：支持分页抓取、暂停/恢复/重试、实时日志

### 🔍 语义检索 (RAG)

- **向量化索引**：基于标题+摘要的 Embedding 生成（支持 Google Gemini Embedding 等模型，3072 维）
- **混合召回**：语义相似度 + 标签增强 + 关键词扩展
- **WebSocket 实时调试**：流式推送检索中间结果，可视化相似度分布与激活语义组

### 📝 智能综述生成

- **一键综述 (Orchestrate)**：输入主题 → 自动生成框架 → 逐章节语义检索 → LLM 生成 800-1500 词/章的学术叙事
- **PhD 多阶段管线**：框架生成 → 论点提取 → 证据匹配 → 章节渲染 → 全文组装（6 步异步管线，支持断点续跑）
- **`[[REF_x]]` 引用锚定系统**：LLM 输出确定性占位符 → 后处理器通过 DB 查表解析为真实引文 `(Author, Year)`，彻底消除 LLM 引用幻觉
- **多引用格式**：Harvard / APA / IEEE / Chicago / Vancouver，由 `ReferenceFormatterService` 统一渲染

### 📊 引文分析

- **引用图谱**：自动采集引用/被引关系，构建 ego-graph 可视化
- **期刊信息增强**：自动查询影响因子、JCR 分区、收录平台 (SCI/SSCI/EI)

### 🤖 AI 助手

- **Agent Chat**：内置对话式 AI 助手，支持自然语言交互与任务执行
- **主动心跳**：Agent 定期推送系统状态通知

---

## 技术架构

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (React 19)                       │
│  TypeScript 5.9 + Vite 7 (Rolldown)                          │
│  12 页面 (src/pages/) + 60+ 子组件 (src/components/)         │
│  统一 API 层 (src/api/) + 共享 Hooks + 类型系统              │
│  Port: 5173 (dev) / 80 (nginx)                               │
├─────────────────────────────────────────────────────────────┤
│                     Backend (FastAPI)                         │
│  Python 3.11 + SQLAlchemy 2 + Pydantic 2 + Uvicorn          │
│  Port: 5444                                                  │
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐           │
│  │ 13 API   │  │ Services │  │ LLM Integration  │           │
│  │ Routers  │  │ (39 files)│  │ (OpenAI Compat.) │           │
│  └──────────┘  └──────────┘  └──────────────────┘           │
│                                                              │
│  ┌──────────────────────────────────────────────┐            │
│  │ Crawler Layer (6 sources)                     │            │
│  │ arxiv / scholar_serpapi / scopus / openalex /  │            │
│  │ crossref / semantic_scholar                   │            │
│  └──────────────────────────────────────────────┘            │
│                                                              │
│  ┌──────────────────────────────────────────────┐            │
│  │ Citation Anchoring ([[REF_x]] system)         │            │
│  │ citation_anchoring.py + reference_formatter   │            │
│  └──────────────────────────────────────────────┘            │
├─────────────────────────────────────────────────────────────┤
│  SQLite + Alembic Migrations                                 │
│  18 tables / 12 core models                                  │
└─────────────────────────────────────────────────────────────┘
```

---

## 快速启动

### 环境要求

| 组件    | 版本要求                          |
| ------- | --------------------------------- |
| Python  | 3.10+                             |
| Node.js | 18+                               |
| LLM API | OpenAI 兼容接口（需配置 API Key） |

### 启动后端

```bash
cd backend
pip install -r requirements.txt

# 配置 .env 文件（见"配置说明"章节）
# 或直接修改 app/config.py 中的默认值

python run.py
# 后端监听 http://localhost:5444
# API 文档 http://localhost:5444/api/docs
```

### 启动前端

```bash
cd frontend
npm install
npm run dev
# 前端监听 http://localhost:5173
```

### 验证

1. 访问 `http://localhost:5173`，应看到系统主界面
2. 进入"设置"配置 LLM API Key 和模型
3. 前往"文献检索"页面，输入关键词开始采集文献

---

## 功能详解

### 1. 文献采集与入库

**流程**：关键词 + 年份范围 + 数据源 → CrawlJob 批量任务 → 暂存库 → 人工审核 → 正式库

```
用户输入关键词
    ↓
CrawlJob 创建（可选多个数据源并行）
    ↓
爬虫分页抓取（支持暂停/恢复/重试）
    ↓
结果写入 StagingPaper（暂存库）
    ↓
用户在暂存库页面审核 → 提升(Promote) / 拒绝(Reject) / 删除
    ↓
提升时自动生成 Embedding → 写入 Paper（正式库）
```

**数据源能力**：

| 数据源                   | 全文元数据 | 摘要 | 引用数 | PDF链接 | 认证     |
| ------------------------ | ---------- | ---- | ------ | ------- | -------- |
| Arxiv                    | ✅         | ✅   | ❌     | ✅      | 无需     |
| Google Scholar (SerpAPI) | ✅         | ✅   | ✅     | 部分    | API Key  |
| Scopus                   | ✅         | ✅   | ✅     | ✅      | API Key  |
| CrossRef                 | ✅         | 部分 | ✅     | ❌      | 无需     |
| Semantic Scholar         | ✅         | ✅   | ✅     | 部分    | 无需     |
| OpenAlex                 | ✅         | ✅   | ✅     | ❌      | 无需     |

### 2. 一键综述生成 (Orchestrate)

**入口**：综述编排页面 → 输入主题、关键词、语言、引用格式

**管线流程**：

1. **框架生成**：LLM 根据主题生成 5-8 章节的结构化大纲（含 title / description / research_gap / search_keywords）
2. **逐章节文献检索**：对每个章节的 search_keywords 进行语义检索，召回 top-K 相关文献
3. **逐章节内容生成**：将召回文献注入 `[[REF_x]]` 映射表 → LLM 生成 800-1500 词学术叙事 → 后处理器解析引用
4. **全文组装**：合并所有章节 + 生成参考文献列表 → 存入 Review 记录

**端到端验证结果**（2026-03-18）：

- 7 个章节，每章 800-1200 词的批判性学术叙事
- 30 篇文献被引用，Harvard 格式 `(Author, Year)`
- 总字数 22,236 词
- 完整的 `citation_map`、`references_markdown`、`full_markdown`

### 3. PhD 多阶段管线

**入口**：综述书架 → "从文献库生成" / PhD 管线页面

**6 步管线**（支持 SSE 流式进度推送 + 断点续跑）：

| 步骤     | 名称     | 说明                                |
| -------- | -------- | ----------------------------------- |
| Step 0   | 框架生成 | LLM 生成结构化大纲                  |
| Step 0.5 | 自动检索 | 按章节关键词自动抓取/检索文献       |
| Step 1   | 论点提取 | 从文献中提取 claims                 |
| Step 2   | 证据匹配 | 为每个 claim 匹配 supporting papers |
| Step 3   | 章节渲染 | 从 claims + evidence → 完整章节文本 |
| Step 4   | 全文组装 | 合并章节 + 参考文献列表             |

### 4. `[[REF_x]]` 引用锚定系统

**核心设计**：用确定性 ID 替代 LLM 自由格式引用，彻底消除引用幻觉。

```
Step 1: 构建映射表
  paper_id=42 → [[REF_1]], paper_id=17 → [[REF_2]], ...

Step 2: 注入提示词
  "Paper: Transit-Oriented Development... [[REF_1]]"

Step 3: LLM 输出
  "...as demonstrated by [[REF_1]] and [[REF_2]]..."

Step 4: 后处理器解析
  [[REF_1]] → DB查询 paper_id=42 → (Chen, 2023)
  [[REF_2]] → DB查询 paper_id=17 → (Wang and Li, 2024)
```

**实现文件**：`backend/app/services/citation_anchoring.py`（~355 行）

### 5. 语义检索 (RAG)

- **HTTP API**：`POST /api/semantic-search/search` — 输入查询文本，返回 top-K 相似文献
- **WebSocket 调试**：`/api/semantic-search/ws` — 流式推送检索过程
- **前端调试面板**：实时可视化相似度分布、激活语义组、扩展关键词

### 6. 引文分析

- **Ego-Graph**：`GET /api/citations/ego-graph/{paper_id}` — 获取单篇文献的引用网络
- **批量同步**：`POST /api/citations/sync-batch` — 批量采集引用关系
- **网络分析**：`POST /api/citation-analysis/analyze` — 计算引用网络指标

---

## API 参考

后端提供 **12 个 API 路由模块**，完整文档见 `http://localhost:5444/api/docs`（Swagger UI）。

| 路由前缀                 | 模块     | 核心端点                                      |
| ------------------------ | -------- | --------------------------------------------- |
| `/api/papers`            | 文献管理 | CRUD、本地搜索、PDF 上传/下载、Embedding 回填 |
| `/api/staging-papers`    | 暂存库   | 搜索、审核、提升(Promote)、拒绝、删除         |
| `/api/reviews`           | 综述管理 | 一键综述、PhD管线（6步）、SSE进度流、导出     |
| `/api/crawl`             | 爬虫任务 | 创建任务、分页抓取、暂停/恢复/重试            |
| `/api/semantic-search`   | 语义检索 | HTTP搜索、WebSocket调试、Embedding回填        |
| `/api/citations`         | 引文关系 | Ego-graph、单篇同步、批量同步                 |
| `/api/citation-analysis` | 引文分析 | 网络指标计算                                  |
| `/api/groups`            | 文献分组 | CRUD、文献关联管理                            |
| `/api/journal-info`      | 期刊信息 | 期刊查询、文献信息增强                        |
| `/api/recall-logs`       | 召回日志 | 记录检索交互行为                              |
| `/api/agent`             | AI 助手  | 对话 API、WebSocket 通知                      |
| `/api/settings`          | 系统设置 | 数据源配置、模型选择、系统提示词、Agent配置   |

---

## 数据模型

系统包含 **15 张数据表**、**11 个核心 ORM 模型**：

| 模型               | 说明        | 关键字段                                                            |
| ------------------ | ----------- | ------------------------------------------------------------------- |
| `Paper`            | 正式文献库  | title, authors, abstract, year, doi, embedding, journal_quartile    |
| `StagingPaper`     | 暂存文献    | 同 Paper + batch_id, status (pending/promoted/rejected)             |
| `Review`           | 综述记录    | title, framework(JSON), content(Markdown), citation_map, word_count |
| `CrawlJob`         | 爬虫任务    | keywords, sources, status, fetched_count, log                       |
| `PipelineTask`     | PhD管线任务 | task_id, status, state_data(checkpoint JSON), steps                 |
| `Citation`         | 引文关系    | citing_paper_id, cited_paper_id, source                             |
| `Tag` / `TagGroup` | 标签体系    | 文献标签与标签分组                                                  |
| `PaperChunk`       | 文本片段    | paper_id, chunk_text, chunk_embedding (PDF分段)                     |
| `RecallLog`        | 召回日志    | query_keywords, paper_id, rank, score                               |
| `Group`            | 文献分组    | name, description, paper associations                               |
| `SystemSetting`    | 系统配置    | key-value 键值对存储                                                |

---

## 前端架构

### 模块化组件体系

前端采用模块化架构，12 个页面拆分为 60+ 个可复用子组件：

```
frontend/src/
├── pages/              # 12 个页面文件
├── components/         # 8 个组件子目录
│   ├── settings/       # 9 个设置子组件
│   ├── library/        # 8 个文献库子组件
│   ├── review/         # 8 个综述子组件
│   ├── phd/            # 10 个 PhD 管线子组件
│   ├── staging/        # 5 个暂存库子组件
│   ├── crawler/        # 3 个爬虫子组件
│   ├── usage/          # 3 个监控子组件
│   └── agent/          # 4 个聊天子组件
├── api/                # 12 个 API 模块 (统一调用层)
├── hooks/              # 共享 Hooks (防抖/竞态/分页)
└── types/              # 6 个领域类型文件
```

### 页面一览

| 页面       | 路径                                    | 功能                                            |
| ---------- | --------------------------------------- | ----------------------------------------------- |
| 文献检索   | `pages/CrawlerSearchPage.tsx`           | 关键词输入 → 多源爬取 → 任务管理                |
| 文献库     | `pages/LibraryPage.tsx`                 | 正式库浏览、筛选、排序、PDF管理、引文分析、分组 |
| 暂存库     | `pages/StagingPapersPage.tsx`           | 暂存文献审核：提升/拒绝/删除、PRISMA 筛选      |
| 综述编排   | `pages/ReviewOrchestratePage.tsx`       | 一键综述入口（主题→框架→全文）                  |
| 综述书架   | `pages/ReviewListPage.tsx`              | 已生成综述列表、校验、导出                      |
| 从库生成   | `pages/ReviewGenerateFromLibraryPage.tsx` | 从已有文献库选文 → 生成综述                   |
| PhD 管线   | `pages/PhdPipelinePage.tsx`             | 6步管线交互界面                                 |
| PRISMA 筛选| `pages/PrismaFlowPage.tsx`              | PRISMA 流程统计与可视化                         |
| RAG 调试   | `pages/RagDebugPage.tsx`                | 语义检索可视化调试                              |
| 任务监控   | `pages/MonitoringDashboard.tsx`         | PhD任务 + 爬虫任务实时状态                      |
| API 监控   | `pages/ApiUsagePage.tsx`                | LLM/Embedding/爬虫 API 调用日志与统计           |
| 设置       | `pages/SettingsModal.tsx`               | API配置、模型选择、数据源设置 (9 个子面板)      |

---

## 配置说明

### 后端配置

在 `backend/` 目录下创建 `.env` 文件：

```env
# LLM 服务（OpenAI 兼容接口）
LLM_API_KEY=sk-your-api-key
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4o

# Embedding 模型
EMBEDDING_MODEL=text-embedding-3-large

# 数据库（默认使用 SQLite）
DATABASE_URL=sqlite:///./data/literature.db

# 爬虫 API Keys（按需配置）
SERPAPI_KEY=your-serpapi-key
SCOPUS_API_KEY=your-scopus-key
```

也可在前端"设置"页面动态配置 LLM 模型、Embedding 模型和数据源参数。

### 前端配置

前端通过 `vite.config.ts` 中的 proxy 配置自动代理 API 请求到后端 `localhost:5444`，无需额外配置。

---

## Docker 部署

```bash
# 项目根目录
docker-compose -f deployment/docker-compose.yml up -d

# 访问
# 前端: http://localhost (nginx 反代)
# API 文档: http://localhost/api/docs
```

配置文件位于 `deployment/` 目录：

- `docker-compose.yml` — 服务编排
- `Dockerfile.backend` — 后端镜像
- `Dockerfile.frontend` — 前端镜像
- `nginx.conf` — Nginx 反代配置

---

## 开发路线

### ✅ 已完成

- [x] 多源爬虫采集（6 个数据源 + OpenAlex）+ 两阶段入库
- [x] 语义检索 RAG（Embedding + 余弦相似度 + 标签增强）
- [x] 一键综述生成（Orchestrate 管线 + 框架 → 逐章生成）
- [x] `[[REF_x]]` 确定性引用锚定系统
- [x] PhD 6 步多阶段管线（SSE 进度推送 + 断点续跑）
- [x] 5 种引用格式（Harvard / APA / IEEE / Chicago / Vancouver）
- [x] 引文图谱 + 期刊信息增强
- [x] AI Agent Chat 助手
- [x] 前端模块化重构（12 页面 + 60+ 子组件 + 统一 API 层 + 类型系统）
- [x] Abstract / Conclusion 自动生成（LLM 驱动，管线集成 + 独立 API）
- [x] 综述导出为 DOCX 格式（`python-docx` 学术排版：Times New Roman、1.5 倍行距、标题层级）
- [x] 论点-证据结构化存储（`analysis_json.claims_evidence` 中保存 claim → supporting_papers 映射）
- [x] 引用校验工具（7 项自动检测：未解析占位符、未引用文献、括号不匹配、孤立映射、重复引用等）
- [x] 文本片段级 RAG（PDF 分段 Embedding + 带页码引用 `[[REF_x:pN]]`，双层 RAG：chunk-first → paper-fallback）
- [x] Citation Anchoring 增强（章节级 RAG 独立召回 → LLM 仅在召回范围内写作）
- [x] 综述导出为 PDF 格式（`xhtml2pdf` 学术排版：A4、页码、1.6 倍行距、参考文献悬挂缩进）
- [x] Alembic 数据库迁移管理
- [x] 爬虫完成原因追踪（区分穷尽/达上限/错误零结果）
- [x] 前端竞态保护（AbortController）+ useEffect 依赖修复
- [x] 浅色 Mac 风格 UI 统一（全页面主题一致性）
- [x] 局域网自适应访问（API_BASE_URL 动态适配）

---

## 许可

本项目为个人学术研究工具，仅供学习和研究使用。
