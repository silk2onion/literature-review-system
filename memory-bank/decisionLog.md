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
