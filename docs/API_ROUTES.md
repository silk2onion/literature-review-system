# ScholarNative API 路由总表

> 后端 FastAPI · 端口 5455 · Swagger 文档 `/api/docs`

## 概览

| 模块 | 前缀 | 端点数 | 说明 |
|------|------|--------|------|
| Papers | `/api/papers` | 21 | 文献库 CRUD、PDF、Embedding、enrichment |
| Staging | `/api/staging-papers` | 11 | 暂存库、PRISMA 筛选、AI 评分 |
| Reviews | `/api/reviews` | 25 | 综述生成、PhD 管线、导出 |
| Crawl | `/api/crawl` | 8 | 爬虫任务管理 |
| Semantic Search | `/api/semantic-search` | 5 | RAG 语义检索 |
| Citations | `/api/citations` | 4 | 引文图谱 |
| Groups | `/api/groups` | 8 | 文献分组 |
| Journal Info | `/api/journal-info` | 2 | 期刊信息查询 |
| Settings | `/api/settings` | 26 | 系统配置 |
| Agent | `/api/agent` | 2 | AI 助手 |
| Usage | `/api/usage` | 3 | API 调用监控 |
| Recall Logs | `/api/recall-logs` | 1 | 检索交互日志 |
| **总计** | | **~116** | |

---

## Papers `/api/papers`

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/search` | 多源文献搜索（带缓存） |
| POST | `/search-local` | 本地文献库搜索 |
| GET | `/` | 文献列表（分页） |
| GET | `/{paper_id}` | 单篇文献详情 |
| POST | `/` | 手动创建文献 |
| PUT | `/{paper_id}` | 更新文献信息 |
| DELETE | `/{paper_id}` | 删除单篇文献 |
| POST | `/batch-delete` | 批量硬删除 |
| POST | `/archive` | 批量归档 |
| POST | `/restore` | 批量恢复 |
| POST | `/{paper_id}/download-pdf` | 下载 PDF（异步，支持机构认证） |
| POST | `/batch-download-pdf` | 批量下载 PDF |
| GET | `/download-progress` | 批量下载进度 |
| GET | `/institutional-url` | DOI → EZProxy 代理 URL |
| POST | `/upload` | 上传 PDF 并解析入库 |
| GET | `/{paper_id}/pdf` | 获取/预览本地 PDF |
| POST | `/backfill-embeddings` | 批量补全 Embedding |
| POST | `/{paper_id}/chunk` | 单篇 PDF 分段 + Embedding |
| POST | `/chunk-all` | 批量分段 |
| POST | `/backfill-chunk-embeddings` | 批量补全 chunk Embedding |
| POST | `/enrich` | 批量补全元数据（CrossRef/S2/OpenAlex） |

## Staging Papers `/api/staging-papers`

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/search` | 搜索暂存库 |
| POST | `/promote` | 提升为正式文献 |
| POST | `/reject` | 标记拒绝 |
| POST | `/delete` | 永久删除 |
| GET | `/exclusion-templates` | PRISMA 排除原因模板 |
| PATCH | `/{id}/screening` | 更新 PRISMA 筛选阶段 |
| POST | `/batch-screening` | 批量更新筛选阶段 |
| GET | `/prisma-stats` | PRISMA 流程统计（含排除论文详情） |
| POST | `/ai-screen` | AI 批量筛选评分 |
| POST | `/enrich` | 批量补全暂存文献元数据 |
| GET | `/{id}` | 单篇暂存文献详情 |

## Reviews `/api/reviews`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/` | 综述列表 |
| GET | `/latest` | 最新综述 |
| GET | `/{review_id}` | 综述详情 |
| DELETE | `/{review_id}` | 删除综述 |
| POST | `/generate` | 生成/更新综述 |
| POST | `/orchestrate` | 一键综述（框架→检索→RAG→生成） |
| POST | `/generate-framework` | 生成综述框架 |
| POST | `/{review_id}/export` | 导出综述（MD/DOCX/PDF） |
| GET | `/{review_id}/export/docx` | 导出 DOCX |
| GET | `/{review_id}/export/pdf` | 导出 PDF |
| GET | `/{review_id}/export/full` | 完整导出（含元数据） |
| POST | `/{review_id}/validate-citations` | 校验引用 |
| PATCH | `/{review_id}/sections` | 更新章节 |
| POST | `/{review_id}/update-claims-evidence` | 更新论点证据 |
| GET | `/{review_id}/claims-evidence` | 获取论点证据 |

### PhD 管线 `/api/reviews/phd`

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/init` | Step 0: 初始化综述 + 生成框架 |
| POST | `/auto-search` | Step 0.5: 按框架自动检索文献 |
| POST | `/generate-claims` | Step 1: 生成主张表 |
| POST | `/attach-evidence` | Step 2: 关联证据 |
| POST | `/render-section` | Step 3: 渲染章节 |
| POST | `/assemble` | Step 4: 组装完整综述 |
| GET | `/tasks` | 异步任务列表 |
| GET | `/task/{task_id}` | 任务状态快照 |
| GET | `/task/{task_id}/stream` | SSE 实时进度流 |
| POST | `/task/{task_id}/cancel` | 取消任务 |
| POST | `/task/{task_id}/resume` | 断点续跑 |

## Crawl `/api/crawl`

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/jobs` | 创建爬取任务 |
| POST | `/jobs/{job_id}/run_once` | 执行一步 |
| GET | `/jobs` | 任务列表 |
| GET | `/jobs/latest_status` | 全局最新状态 |
| GET | `/jobs/{job_id}` | 任务详情 |
| POST | `/jobs/{job_id}/pause` | 暂停 |
| POST | `/jobs/{job_id}/resume` | 恢复 |
| POST | `/jobs/{job_id}/retry` | 重试 |

## Semantic Search `/api/semantic-search`

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/search` | Paper 级语义检索 |
| POST | `/chunks` | Chunk 级语义检索 |
| POST | `/chunks/for-section` | 章节级 chunk 召回 |
| POST | `/backfill-embeddings` | 批量补全 Embedding |
| WS | `/ws` | WebSocket 实时检索流 |

## Citations `/api/citations`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/ego-graph/{paper_id}` | 单篇引用网络 |
| POST | `/sync-for-paper/{paper_id}` | 单篇同步引用 |
| POST | `/sync-batch` | 批量同步引用 |
| POST | `/analysis/analyze` | 全库引文网络分析 |

## Groups `/api/groups`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/` | 分组列表 |
| POST | `/` | 创建分组 |
| GET | `/{group_id}` | 分组详情 |
| PUT | `/{group_id}` | 更新分组 |
| DELETE | `/{group_id}` | 删除分组 |
| POST | `/{group_id}/papers` | 添加文献到分组 |
| DELETE | `/{group_id}/papers` | 从分组移除文献 |
| GET | `/{group_id}/papers` | 获取分组内文献 |

## Settings `/api/settings`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET/PUT | `/data-sources` | 数据源配置（SerpAPI/Scopus/RAG） |
| GET/PUT | `/models` | LLM + Embedding 模型选择 |
| GET/PUT | `/llm-connection` | LLM API Key + Base URL（脱敏） |
| GET/PUT | `/system-prompt` | Agent 系统提示词 |
| GET/PUT | `/agent` | Agent 心跳配置 |
| GET/PUT | `/review-defaults` | 综述生成默认参数 |
| GET/PUT | `/crawler` | 爬虫速率/超时/重试 |
| GET/PUT | `/search` | 语义检索参数 |
| GET/PUT | `/institutional-access` | 机构访问（EZProxy/Shibboleth） |
| POST | `/institutional-access/test` | 测试机构登录 |
| GET | `/institutional-access/status` | 认证 session 状态 |
| GET/PUT | `/discipline-profile` | 学科配置 |
| GET/POST/DELETE | `/discipline-presets` | 学科预设管理 |
| POST | `/discipline-presets/{name}/load` | 加载预设 |
| GET | `/debug/external-sources/test` | 测试外部数据源 |

## Agent `/api/agent`

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/chat` | AI 对话（ask/agent 模式，23 个工具） |
| WS | `/ws` | WebSocket 主动通知 |

### Agent 工具列表（23 个）

| 工具名 | 说明 |
|--------|------|
| `search_papers` | 搜索文献并加入暂存库 |
| `list_staging` | 查看暂存库 |
| `promote_papers` | 提升为正式库 |
| `delete_staging` | 删除暂存文献 |
| `search_library` | 搜索正式库 |
| `sync_citations` | 同步引用关系 |
| `system_status` | 系统状态 |
| `general_chat` | 通用对话 |
| `generate_framework` | 生成综述框架 |
| `start_review_task` | 启动异步综述生成 |
| `run_phd_pipeline` | 运行 PhD 管线 |
| `check_task_progress` | 查看任务进度 |
| `modify_task_requirements` | 动态修改任务需求 |
| `list_reviews` | 查看综述列表 |
| `export_review` | 导出综述 |
| `semantic_search` | 语义搜索 |
| `manage_groups` | 管理分组 |
| `configure_discipline` | 学科配置 |
| `download_pdf` | 下载 PDF |
| `screen_papers` | AI 筛选 |
| `enrich_papers` | 元数据补全 |
| `prisma_stage` | PRISMA 阶段管理 |
| `institutional_login` | 机构登录 |

## Usage `/api/usage`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/logs` | API 调用日志（分页+过滤） |
| GET | `/stats` | 调用统计摘要 |
| DELETE | `/logs/cleanup` | 清理旧日志 |

## Recall Logs `/api/recall-logs`

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/` | 记录前端交互事件 |

---

## 数据源爬虫（7 个）

| 爬虫 | source_name | 认证 | 说明 |
|------|------------|------|------|
| Scopus | `scopus` | API Key | 两段式（Search + Abstract Retrieval） |
| Google Scholar | `scholar_serpapi` | API Key | 通过 SerpAPI 代理 |
| Semantic Scholar | `semantic_scholar` | 免费/可选 Key | 10 req/sec（有 Key） |
| OpenAlex | `openalex` | 免费 | 填邮箱进 polite pool |
| CrossRef | `crossref` | 免费 | DOI 元数据 |
| arXiv | `arxiv` | 免费 | 预印本 |
| Web of Science | `wos` | 机构访问 | Selenium + Shibboleth |

## i18n 双语

- 翻译文件：`frontend/src/locales/zh-CN.json` / `en.json`
- 625 个翻译键
- 切换入口：设置页侧边栏底部 `中文 | English`
- 持久化：localStorage `app-locale`
