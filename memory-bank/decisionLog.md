# Decision Log - 城市设计文献综述系统

> 记录本项目中的重要架构与产品决策，包括原因与影响。

---

[2025-11-15 04:37:24] - 后端技术栈从文档示例中的 Flask 固化为当前 FastAPI 实现  
- 决策内容：  
  - 文档 [`architecture.md`](architecture.md:1) 与 [`implementation-guide.md`](implementation-guide.md:1) 中使用 Flask 作为讲解示例，但代码仓库实际已经采用 FastAPI + SQLAlchemy + Pydantic v2 的结构。  
- 原因：  
  - FastAPI 在类型提示、自动文档、异步支持方面更适合当前多数据源爬虫与 LLM 调用场景。  
- 影响：  
  - 后续所有新功能（RAG、分组、导出等）都应以 FastAPI 现有结构为准，不再新增 Flask 相关代码。  
  - 文档中涉及 Flask 的部分仅作为参考示例，在需要时逐步补充 FastAPI 版实现说明。

---

[2025-11-15 04:37:24] - 引入 Memory Bank 机制管理长期架构与上下文  
- 决策内容：  
  - 在项目根目录新增 `memory-bank/`，包含 [`productContext.md`](memory-bank/productContext.md:1)、[`activeContext.md`](memory-bank/activeContext.md:1)、[`systemPatterns.md`](memory-bank/systemPatterns.md:1)、`decisionLog.md`、`progress.md` 五个文件，用于跨会话保存关键上下文。  
- 原因：  
  - 项目迭代周期长、模块多（多源爬虫、LLM 综述、RAG、分组等），需要一个轻量、可版本管理的“项目记忆”。  
- 影响：  
  - Architect 模式在做方案调整时需要同步更新 Memory Bank。  
  - Code / Debug 模式在遇到架构级变更时也应回写简短记录，以便后续继续演进。

---

[2025-11-15 04:37:24] - 采用“轻量 RAG in DB”作为第一阶段语义检索方案  
- 决策内容：  
  - 第一阶段 RAG 不引入独立向量库，而是：  
    - 在 `Paper.embedding` 字段中存储向量（JSON 数组）；  
    - 通过 `SemanticGroupService` 进行关键词扩展与语义组激活；  
    - 由 `SemanticSearchService` 在应用层计算余弦相似度并返回 top K。  
- 原因：  
  - 当前数据量尚可由 SQLite / PostgreSQL 承载；  
  - 避免前期就增加额外服务（如 ChromaDB/Qdrant），降低部署复杂度；  
  - 先把“RAG 检索链路 + 可视化调试体验”打通，再根据数据量和性能决定是否引入专用向量库。  
- 影响：  
  - 与 RAG 相关的 TODO 设计，应围绕“应用层向量检索 + 数据库存储”来规划；  
  - 后续如果引入向量库，需要在此基础上替换检索实现，但上层 API 与前端交互可以保持不变。

---

[2025-11-15 04:37:24] - 将 RAG 功能通过运行时配置开关控制  
- 决策内容：  
  - 在 Settings API 中增加 `rag.enabled` 配置项，后端默认从环境变量 `RAG_ENABLED` 读取，前端在设置弹窗中提供“启用 RAG”开关。  
- 原因：  
  - 允许在同一套代码中平滑切换“纯关键词 + 传统检索”和“RAG 语义增强检索”，方便调试与对比。  
- 影响：  
  - 所有会调用 SemanticSearchService / 向量检索的流程（如综述生成）都应先检查 RAG 开关。  
  - 前端在展示 RAG 可视化面板时，也需依赖此开关决定是否展现相关入口。

---

[2025-11-17 16:53:10] - 纠正严重错误：恢复被错误覆盖的权威 To-Do List  
- 决策内容：  
  - 助理在处理任务时发生严重错误，忽略了已存在的、包含 72 项任务的权威 To-Do List (`reminders`)，并用一个全新的、仅 10 项的列表覆盖了它，导致项目上下文严重污染。  
  - 在用户明确指出错误后，立即采取纠正措施，将权威的 72 项 To-Do List 恢复到 `reminders` 系统中。  
- 原因：  
  - 助理的内部状态管理出现严重失误，未能正确识别和尊重项目中已建立的、作为“单一事实来源”的任务列表。  
- 影响：  
  - 此次事故导致了不必要的工作中断和上下文混乱。  
  - 未来的所有操作都必须严格以 `reminders` 中的 To-Do List 为唯一依据。在任何操作之前，必须首先同步和确认当前的任务状态。

---

[2025-11-18 16:02:00] - 拆分综述生成工作流：Search vs Generate
- 决策内容：
  - 将原有的“搜索即生成”单一视图拆分为两个独立视图：
    1. **Search & Filter**：用于从外部源抓取文献并入库（Ingestion）。
    2. **Generate Review**：仅基于本地库（Library）中已有的文献进行综述生成（Synthesis）。
- 原因：
  - 解决原有流程中“直接对未入库/未清洗的搜索结果生成综述”导致的数据质量不可控问题。
  - 强化“先入库、后综述”的严谨科研流程。
- 影响：
  - 前端 `App.tsx` 结构调整，引入 `ReviewGenerateFromLibraryPage`。
  - 后端 `generate_review` 接口支持直接接收 `paper_ids`，不再强制依赖实时搜索结果。
