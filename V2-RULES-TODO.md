# 文献综述系统 V2 开发规则与 Todo 清单

本文件是 V2 版本的「规则 README + Todo 看板」。  
后续所有开发以此为准，完成后在对应项前打勾 `[x]`，并在下一行简要备注。

---

## 总体目标

- 把现有“爬虫 + LLM + 文献综述”系统升级为：
  1. ChatGPT 风格的前端交互界面；
  2. 后端支持 LLM 自动生成结构化文献综述，并输出可视化所需的统计数据；
  3. 提示词架构（Prompt）可在前端查看和自定义，默认使用系统提示词，用户可覆盖。

---

## 一、后端升级 Todo（LLM + 数据结构）

### 1. 扩展综述生成请求/响应结构

- [x] 在 [`backend/app/schemas/review.py`](backend/app/schemas/review.py:73) 中扩展 `ReviewGenerate`
  - 增加字段：`custom_prompt: Optional[str]`，用于接受前端自定义提示词。
  - 2025-11-14 完成，已在 `ReviewGenerate` 中加入 `custom_prompt` 字段示例。
- [x] 在 [`backend/app/schemas/review.py`](backend/app/schemas/review.py:97) 中扩展 `ReviewGenerateResponse`
  - 增加字段：
    - `preview_markdown: Optional[str]`  // 给前端直接展示的 Markdown 文本
    - `used_prompt: Optional[str]`       // 实际使用的完整提示词内容
    - `summary_stats: Optional[dict]`    // 用于可视化的数据（timeline/topics 等）
  - 2025-11-14 完成，已在 `ReviewGenerateResponse` 中加入上述字段，并使用 `Dict[str, Any]` 类型。

### 2. 设计 LLM 输出结构的 schema

- [x] 在 `schemas` 层定义 LLM 输出的结构体（可以放在 [`backend/app/schemas/review.py`](backend/app/schemas/review.py:52) 或新文件）：
  - `LitReviewLLMResult`：
    - `markdown: str`
    - `timeline: List[TimelinePoint]`
    - `topics: List[TopicStat]`
  - `TimelinePoint`：
    - `period: str`       // 例如 "2018-2020"
    - `topic: str`        // 该时期研究主题
    - `paper_ids: List[int]`
  - `TopicStat`：
    - `label: str`        // 主题名称
    - `count: int`        // 该主题下文献数量
- [ ] 确定上述结构如何存入数据库（`reviews` 表的字段，如 content / analysis_json），并在 schema 中体现。
  - 说明：当前已在 `ReviewFullExport.analysis` 和 `ReviewGenerateResponse.summary_stats` 预留 `Dict[str, Any]`，后续落库时会在 `models/review.py` 中增加 JSON 字段（例如 analysis_json）。

### 3. 默认提示词结构与配置

- [x] 定义提示词配置 schema（例如 `PromptConfig`、`PromptPreviewResponse`）：
  - `PromptConfig`：
    - `system_prompt: str`
    - `user_template: str`  // 包含占位符：`{{keywords}}`, `{{year_range}}`, `{{paper_summaries}}` 等
  - 2025-11-14 完成，已在 [`backend/app/services/llm/prompts.py`](backend/app/services/llm/prompts.py:1) 中定义 `PromptConfig` 与 `PromptPreviewResponse`。
- [x] 在后端新增一个专门存放 Prompt 的模块，例如：
  - [`backend/app/services/llm/prompts.py`](backend/app/services/llm/prompts.py:1)
  - 定义 `DEFAULT_LIT_REVIEW_PROMPT_CONFIG: PromptConfig`
  - 2025-11-14 完成，默认提示词配置已落地为 `DEFAULT_LIT_REVIEW_PROMPT_CONFIG`，供 LLM 调用使用。
- [x] 默认提示词要明确要求 LLM：
  - 输出结构化 Markdown（背景 / 进展 / 对比 / 研究空白）；
  - 在文末输出一个 JSON block，包含 timeline 与 topics 统计。
  - 2025-11-14 完成，默认模板中已加入 timeline/topics JSON 示例说明。

### 4. 实现统一的 LLM 调用服务入口

- [ ] 在 [`backend/app/services/llm/openai_service.py`](backend/app/services/llm/openai_service.py:1) 或新模块中新增函数：
  - `async def generate_lit_review(papers, prompt_config, task_config) -> LitReviewLLMResult`
- [ ] 功能设计：
  - 根据 `ReviewGenerate` 的参数和 papers 列表，生成 `paper_summaries` 文本；
  - 将默认/自定义 PromptConfig 填入占位；
  - 调用 OpenAI 兼容接口（或你当前在用的 LLM）；
  - 从返回结果中解析出：
    - 综述 Markdown 正文；
    - 末尾 JSON 中的 timeline 与 topics 数据；
  - 将其封装为 `LitReviewLLMResult` 返回。

### 5. 改造 `POST /api/reviews/generate` 接口

- [ ] 在 [`backend/app/api/reviews.py`](backend/app/api/reviews.py:47) 中：
  - 用真实 LLM 服务替换当前的“占位 Review”实现，具体步骤：
    1. 根据 `ReviewGenerate` 调用现有文献搜索/数据访问逻辑，拿到本次使用的文献列表；
    2. 调用 `generate_lit_review`，获得 `LitReviewLLMResult`；
    3. 在数据库中创建或更新 `Review` 记录：
       - `title` / `keywords`；
       - `framework` 或 `content` 存储 Markdown；
       - 新增字段存储 `analysis_json`（timeline/topics 原始 JSON）；
       - `paper_count`、`status` 等；
    4. 返回 `ReviewGenerateResponse`：
       - `success`、`review_id`、`status`；
       - `preview_markdown` ← LLM 返回的 Markdown；
       - `used_prompt` ← 最终发送给 LLM 的完整 prompt；
       - `summary_stats` ← 从 LLM 结果中的 timeline/topics 整理后的统计。

### 6. 新增提示词配置 API

- [ ] 在 [`backend/app/api/reviews.py`](backend/app/api/reviews.py:1) 中新增：
  - `GET /api/reviews/prompt/default`
    - 返回当前默认 `PromptConfig`（用于前端展示和编辑初始值）。
- [ ] （可选）新增：
  - `POST /api/reviews/prompt/preview`
    - 接收一个 `PromptConfig`，返回渲染后的 prompt 字符串，便于前端预览（调试功能，可后置）。

### 7. 扩展导出接口返回数据

- [ ] 在 `GET /api/reviews/{review_id}/export/full` 中：
  - 在现有返回的基础上增加：
    - `analysis: Optional[dict]` 或 `summary_stats` 字段，包含 timeline/topics；
  - 这样前端刷新页面时，无需再次调用 LLM，即可重绘可视化图表。

---

## 二、前端 V2 Todo（ChatGPT UI + Markdown + 可视化 + Prompt 编辑）

### 1. 改造主布局为 ChatGPT 风格三区域

- [x] 在 [`frontend/src/App.tsx`](frontend/src/App.tsx:1) 对整体布局进行重构：
- 2025-11-14 已完成初版 ChatGPT 风格三栏布局，但根据当前规划暂不继续深度重构，仅作为基础交互原型保留，后续前端重点转向“文献库视图 / 任务视图 / 综述编辑视图”。
  - 左侧：配置面板
    - 关键词输入（tag 输入）
    - 年份范围选择（起止年份）
    - 数据源选择（arxiv 等）
    - 文献数量 slider
    - 按钮：“搜索文献”（调用 `/api/papers/search`）；
    - 按钮：“生成综述”（调用 `POST /api/reviews/generate`）。
  - 中间：Chat 区域
    - 显示用户请求（关键词等）；
    - 显示 LLM 返回的 Markdown 综述（多轮生成时按时间顺序排列）；
  - 右侧：信息/可视化面板（使用 Tabs 切换文献列表和图表）。

### 2. 引入并配置 Markdown 渲染

- [ ] 在 `frontend` 安装：
  - `react-markdown`
  - `remark-gfm`
- [ ] 在 Chat 区域使用：

  ```tsx
  import ReactMarkdown from "react-markdown";
  import remarkGfm from "remark-gfm";

  <ReactMarkdown remarkPlugins={[remarkGfm]}>
    {reviewMarkdown}
  </ReactMarkdown>
  ```

  - 其中 `reviewMarkdown` 来自后端 `preview_markdown` 或 `/api/reviews/{id}`/`export/full`。

### 3. 文献列表面板

- [ ] 在右侧面板中增加文献列表组件：
  - 调用 `GET /api/reviews/{id}/export/full` 获取 `papers` 列表；
  - 展示字段：
    - `title`
    - `authors`
    - `year`
    - `journal`
    - `pdf_url` / `abs_url`（可点击链接）；
  - 支持基本交互：
    - 点击标题跳转到 pdf 链接；
    - 鼠标悬停展示更多细节（可选）。

### 4. 研究进展可视化图表

- [ ] 选择并安装一个图表库（例如 Recharts / ECharts for React / Chart.js）。
- [ ] 根据 `summary_stats.timeline` 绘制时间轴/柱状图：
  - X 轴为时间段 `period`；
  - Y 轴为该时间段内论文数量或主题数量。
- [ ] 根据 `summary_stats.topics` 绘制主题分布图：
  - 可以用条形图/饼图显示各主题的论文数。
- [ ] 当用户点击“生成综述”后，使用返回的 `summary_stats` 即时刷新图表；
  - 页面刷新后，再用 `/api/reviews/{id}/export/full` 返回的 `analysis` 重绘。

### 5. 提示词编辑 Modal（二级窗口）

- [ ] 新建组件 `PromptEditorModal`（或类似命名）：
  - 打开时：
    - 调用 `GET /api/reviews/prompt/default` 拉取默认 `PromptConfig`；
  - 左侧区域：
    - 展示默认提示词（只读），如系统级说明；
  - 右侧区域：
    - Textarea 供用户编辑“当前自定义提示词”；
  - 提供按钮：
    - “恢复默认提示词”：重置为 `PromptConfig`；
    - “保存并用于本次生成”：将当前编辑内容存入前端 state。
- [ ] 在主界面增加一个入口按钮（例如“配置提示词”），点击打开该 Modal。
- [ ] 调用 `POST /api/reviews/generate` 时：
  - 若用户有自定义 Prompt → 填入 `custom_prompt`；
  - 否则不传该字段，由后端使用默认提示词。

### 6. 整合生成流程

- [ ] 统一生成流程逻辑：
  1. 用户在左侧配置面板设置关键词、时间范围、文献数、数据源；
  2. 点击“生成综述”：
     - 构造 `ReviewGenerate` 请求体（含 `custom_prompt`）；
     - 调用 `POST /api/reviews/generate`；
  3. 收到响应后：
     - 在 Chat 区域追加一条 AI 消息，内容为 `preview_markdown`；
     - 保存 `review_id` 和 `summary_stats`；
  4. 使用 `review_id`：
     - 调用 `GET /api/reviews/{id}/export/full` 获取 `papers` 及 `analysis`；
     - 更新右侧文献列表和图表。

---

## 三、V2.1 扩展：长周期多源抓取 + 本地文献库 + PhD 级综述管线

> 本节总结“长周期多源大规模抓取 → 去重入库 → 支撑 PhD 级综述生成”的开发方向，拆解为可执行的 Todo。

### 1. 抓取层：从单次搜索到“抓取任务系统”

- [ ] 设计“抓取任务”数据模型 `CrawlJob` / `CrawlBatch`
  - 字段示例：
    - `id`
    - `keywords: List[str]`（JSON）
    - `sources: List[str]`（例如 `["arxiv", "crossref"]`）
    - `year_from: Optional[int]`
    - `year_to: Optional[int]`
    - `max_results: int`（目标总数量，例如 500）
    - `page_size: int`
    - `current_page: int`
    - `status: str`（pending / running / completed / failed / paused）
    - `log: JSON`（错误、告警、统计）
  - 后端落地位置建议：`backend/app/models/crawl_job.py` + 对应 schema 和 CRUD。

- [x] 给每个数据源设计独立 crawler/service，并抽象 Orchestrator
  - 已有：
    - `ArxivCrawler`（[`backend/app/services/crawler/arxiv_crawler.py`](backend/app/services/crawler/arxiv_crawler.py:15)）
  - 待实现：
    - `CrossRefCrawler`：负责基于关键词/年份获取正式出版物（期刊、会议），补齐 DOI / journal / publisher；
    - 预留 `GenericScholarCrawler` 接口，未来对接 Google Scholar / Semantic Scholar 等“发现源”。
  - 统一接口：
    - `search(keywords, year_from, year_to, page, page_size) -> List[Paper]`
  - 在 `Papers API` 中增加 Orchestrator 方法，例如：
    - `search_across_sources(search_request)`：根据 `sources` 调用不同 crawler，merge 并去重后返回。

- [ ] 设计批量抓取 API 以支持“任务 + 批处理”
  - `POST /api/crawl/jobs`
    - 创建抓取任务，只记录参数，不立即抓完所有数据。
  - `POST /api/crawl/jobs/{id}/run_once`
    - 执行该任务的一“步”：抓下一页（对 arxiv / crossref 分别分页）；
    - 更新 `current_page`、累积抓取数量，并写入 `log`。
  - `GET /api/crawl/jobs/{id}`
    - 查询任务进度：抓取篇数、失败条数、当前状态、参与的数据源。

- [ ] 设计调度方式（开发阶段可简化）
  - 开发期：
    - 通过前端按钮或简单管理接口重复调用 `run_once`；
    - 或使用 FastAPI 的 `BackgroundTasks` / 线程做后台抓取。
  - 后期：
    - 预留与 Celery / RQ / APScheduler 等调度框架集成的空间。

### 2. 去重与清洗：从“结果列表”到“语料库”

- [ ] 在 `Paper` 表中增加去重和质量控制相关字段/索引
  - 强主键相关：
    - `doi`（唯一索引）；
    - `source` + `source_id` 联合索引（例如 `("arxiv","2401.12345")`）；
  - 模糊去重相关：
    - `title_norm` 字段（小写、去标点、去停用词后的标准化标题）；
    - 为 `title_norm` 建立普通索引，支持快速查重。

- [ ] 设计并实现“强 + 弱”组合的去重逻辑
  - 强匹配：
    - 优先用 `doi` 判断是否已有记录；
    - 其次用 `arxiv_id` / `source_id`。
  - 弱匹配（可选但推荐）：
    - 基于 `title_norm + first_author + year` 构造 hash；
    - 再使用相似度（Levenshtein / fuzzywuzzy）判断，阈值如 0.9 视为相同。
  - 将逻辑封装到一个服务函数，如：
    - `merge_or_create_paper(new_paper) -> Paper`。

- [ ] 冲突合并与信息补全策略
  - 当发现新抓文献与库中已有记录冲突时：
    - 如果新记录有 `doi` / `journal` / `publisher`，而旧记录缺失 → 更新旧记录；
    - `authors` / `keywords` 可以合并或选择信息更完整的一侧；
  - 在 `Paper` 表增加：
    - `sources_meta: JSON`（记录来自哪些源，每次抓取时间等）；
  - 在 `CrawlJob.log` 中记录：
    - 去重合并时的行为（例如：合并了哪些字段、舍弃了哪些来源）。

### 3. 数据库结构扩展：支撑上百/上千篇文献

- [ ] 为大规模文献检索优化索引
  - `papers` 表：
    - `doi` 唯一索引；
    - `title_norm` 索引；
    - `year` 索引；
    - `source` 索引。
  - `review_papers` 表：
    - `(review_id, order_index)` 联合索引；
    - `paper_id` 索引。

- [ ] 在 `Paper` 模型中扩展语义字段（为后续 PhD 级综述管线做准备）
  - `venue`：期刊/会议名称；
  - `venue_type`：journal / conference / book / thesis / preprint；
  - `is_peer_reviewed: bool`：是否为同行评议文献（arxiv 等预印本填 False）；
  - `method_tags: JSON`：方法/技术标签（可后续用 LLM 批量标注）；
  - `topic_tags: JSON`：研究主题标签（可由聚类/LLM 生成）；
  - 这些字段将用于按方法流派/主题子领域分章节组织综述。

### 4. LLM 综述管线：从“一次生成”到“多阶段 PhD 流程”

- [ ] 设计多阶段综述管线：探索 → 结构 → 细化 → 写作
  - 探索阶段（Exploration）：
    - 输入：大量 `Paper` 的元数据 + 摘要（可抽样，比如 200 篇中的 50~100 篇）；
    - 输出：
      - 主题簇（topic clusters）；
      - 时间分段（time slices）；
      - 方法流派列表（method families）。
    - 新接口示例：
      - `POST /api/reviews/cluster`：
        - 基于 embedding + 聚类，或直接让 LLM 读标题+摘要给出主题划分。
  - 结构阶段（Framework Design）：
    - 输入：探索阶段结果 + 研究问题/PhD 题目；
    - 输出：章节级结构（每个章节对应一个文献集合）；
    - 接近当前的 `framework` 生成，但需要明确“章节 ↔ 文献集合”的映射。
  - 细化阶段（Per-chapter notes）：
    - 对每个章节选一批核心文献（如每章 30~50 篇）；
    - 让 LLM 生成该章节的“笔记/要点”列表（bullet notes），存入 DB。
  - 写作阶段（Writing）：
    - 按章节调用 LLM 生成正文：
      - `Introduction`；
      - 各主题章节；
      - `Discussion / Future Work` 等。

- [ ] 在现有 `Review` 模型基础上新增步骤化接口
  - 示例接口：
    - `POST /api/reviews/plan`：
      - 输入：`keywords` + 当前 DB 中相关文献；
      - 输出：综述规划（章节、每章目标文献数等）。
    - `POST /api/reviews/{id}/chapter/{chapter_id}/draft`：
      - 为单个章节生成初稿或章节笔记。
    - `POST /api/reviews/{id}/synthesize`：
      - 将章节级草稿整合成完整文档，可分多次执行。
  - 内部复用现有 `OpenAIService`：
    - 核心变化是 **按章节/阶段切块调用**，而不是一次性塞入所有文献。

### 5. 本地文献库与合法文献来源

- [ ] 扩展 `Paper` 模型以区分预印本与正式出版物
  - 字段：
    - `doi`：正式文献唯一标识；
    - `venue`、`venue_type`；
    - `is_peer_reviewed`；
    - `source` + `source_id`；
  - 设计策略：
    - CrossRef / WOS / Scopus 等作为“正式出版主源”；
    - arxiv 等作为“preprint channel”，明确标记为 `venue_type = "preprint"`, `is_peer_reviewed = False`。

- [ ] 设计“本地文献库检索” API（优先从自建库查，再考虑外部抓取）
  - 新接口示例：`GET /api/papers/search-local`
    - 查询参数：
      - `q`: 关键词（对标题、摘要、keywords 做模糊匹配）；
      - `field`: 领域（映射到 `field_tags` / `topic_tags`）；
      - `year_from`, `year_to`；
      - `venue_type`: journal / conference / thesis / preprint；
      - `is_peer_reviewed`: true/false；
      - `source`: arxiv / crossref / wos / scopus 等；
      - 分页：`page`, `page_size`。
  - SQL 组合查询示意：
    - 基于 `title`/`abstract` LIKE；
    - 基于 `year`、`venue_type`、`is_peer_reviewed` 精确过滤；
    - 基于 `field_tags`/`topic_tags` 做 LIKE 或简单字符串包含过滤（SQLite 阶段先简化实现）。
  - 返回：
    - `total` + `items: List[PaperResponse]`；
    - 支持按 `year desc` 等排序。

- [ ] 定义本地检索与外部抓取的协作关系
  - 前端用户检索时：
    - 优先走 `/api/papers/search-local`；
    - 若结果不足（如 < 50 篇），提供“补充抓取”按钮：
      - 触发一个新的 `CrawlJob`，从 CrossRef / Arxiv 等外部源拉取新文献，再入库。

### 6. 前端：任务视图、文献库视图与综述编辑视图

- [ ] 任务视图（抓取任务 & 综述任务）
  - 新增任务看板页面或面板：
    - 抓取任务列表：
      - 显示：关键词、状态、已抓数量、错误数、数据源等；
      - 操作：继续抓取（调用 `/api/crawl/jobs/{id}/run_once`）、暂停、查看日志。
    - 综述任务列表：
      - 显示：关联关键词、关联 `CrawlJob`、当前阶段（规划 / 笔记 / 写作）、整体进度。

- [ ] 文献管理视图（本地文献库二级页面）
  - 新增前端路由与页面：
    - `"/"`：现有 ChatGPT 风格综述助手首页；
    - `"/library"`：文献库页面。
  - 文献库页面功能：
    - 顶部高级筛选区：
      - 关键词输入 `q`；
      - 领域/主题下拉（映射到 `field_tags`/`topic_tags`）；
      - 年份区间筛选；
      - 文献类型（journal / conference / thesis / preprint）；
      - “只看同行评议文献”开关。
    - 结果列表区：
      - 表格或卡片展示：标题、作者、年份、venue、doi、source、是否 peer-reviewed 等；
      - 支持分页、排序（按年份、来源等）。
    - 操作：
      - 勾选若干文献 → “加入综述任务/章节”；
      - 或“基于本页文献生成某个章节的草稿”。

- [ ] 综述编辑视图
  - 针对单个 `Review`：
    - 显示不同阶段产物：
      - 规划结果（章节结构）；
      - 各章节草稿/笔记；
      - 整体合成后的完整文档。
    - 提供人机协同能力：
      - 手动编辑章节文本；
      - 再调用 LLM 做 rewrite / polish；
      - 版本记录（至少在 DB 层记录 updated_at、status）。

### 7. 引用图系统（三阶段：结构化源 + LLM 解析 + 订阅源）

- [ ] Phase 1：Crossref + OpenAlex 引用图（核心结构化源）+ 基础可视化
  - [x] 实现 Crossref 引用同步服务，基于 DOI 从 Crossref 抓取 reference 列表，匹配本地 Paper 并写入 PaperCitation，更新 citations_count。
    - 2025-11-15 完成，已在 [`CitationIngestService.sync_citations_for_paper()`](backend/app/services/citation_ingest.py:190) 中实现 Crossref 引用同步管线。
  - [x] 实现自中心引用图服务与 API，返回 `nodes` + `edges` + `stats` 结构。
    - 2025-11-15 完成，已在 [`CitationGraphService.get_ego_graph()`](backend/app/services/citation_graph.py:30) 与 [`get_citation_ego_graph()`](backend/app/api/citations.py:24) 中提供 `GET /api/citations/ego-graph/{paper_id}`。
  - [x] 在前端实现单论文引用图面板，并与本地文献库集成。
    - 2025-11-15 完成，已在 [`CitationGraphPanel.tsx`](frontend/src/CitationGraphPanel.tsx:1) 和 [`LibraryPage.tsx`](frontend/src/LibraryPage.tsx:1) 中提供每篇文献的“查看引用”入口与引用图统计视图。
  - [ ] 接入 OpenAlex 引用数据源：通过 DOI 获取 OpenAlex ID 和 referenced_works，映射回本地 Paper 并写入 PaperCitation（`source="openalex"`），与 Crossref 结果合并去重。

- [ ] Phase 2：PDF/HTML + LLM 解析引用 + 源/置信度可视化
  - 设计 `CitationLLMExtractService`（新服务模块），从本地 PDF/HTML 提取参考文献文本，调用现有 LLM 接口解析为结构化引用列表，匹配本地 Paper 并写入 PaperCitation（`source="llm_parsed_pdf"`，含 `confidence` 与部分原始引用字符串存入 `source_meta`）。
  - 在 `GET /api/citations/ego-graph/{paper_id}` 中支持按 `source`、`min_confidence` 等参数过滤边，前端引用图面板增加来源/置信度过滤控件，并用线型/透明度区分 Crossref/OpenAlex 与 LLM 解析来源。

- [ ] Phase 3：接入 Scopus 等订阅源 + 多源叠加可视化
  - 在现有 [`scopus_crawler`](backend/app/services/crawler/scopus_crawler.py:1) 基础上增加引用同步能力，将 Scopus 引用写入 PaperCitation（`source="scopus"`），并在 `CitationIngestService` 中串联 Crossref / OpenAlex / Scopus 引用同步与去重。
  - 在前端引用图面板中，用不同颜色/线型区分各来源边，并展示 `stats.by_source`（按 source 聚合的引用数量），形成多源叠加的引用视图。

---

## 四、执行与打勾规则

- 开发过程中，你（以及我在本会话中）应当以本文件作为唯一权威的 V2 任务清单。
- 每完成一个子任务，就将对应项由：
  - `[ ]` 改为 `[x]`，并在下方追加一行简短说明（例如：`- 2025-11-14 完成，已在 XXX 文件中实现`）。
- 若在执行中发现新的必要任务：
  - 按对应分区（后端/前端）添加新的 Todo 项，保持简洁清晰。
- 若某任务不再需要执行：
  - 将其标记为 `[x]`，并备注“已取消：原因”。

本 README 既是「规则」也是「进度板」，后续所有 V2 相关修改都应在此同步状态，以便随时回溯和对齐目标。