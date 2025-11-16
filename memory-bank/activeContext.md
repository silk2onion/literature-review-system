# Active Context - 城市设计文献综述系统

## 1. 当前工作焦点

- 初始化 Memory Bank 文件：productContext, activeContext, systemPatterns, decisionLog, progress。
- 在现有 FastAPI + React 代码基础上，规划并实现 RAG 语义检索能力（Paper.embedding + 语义组 + 向量相似度）。
- 为后续 RAG 可视化调试面板设计合理的后端 API（HTTP + WebSocket）与前端交互流程。

## 2. 近期关键变更

- 依据仓库中的文档 [`architecture.md`](architecture.md:1) / [`implementation-guide.md`](implementation-guide.md:1) / [`quick-start.md`](quick-start.md:1) / [`workflow-diagrams.md`](workflow-diagrams.md:1) 结合实际代码结构，确认项目已从 Flask 方案演进为 FastAPI 应用。
- 在 backend 中已实现多源文献抓取、去重入库、本地文献库检索和基于 LLM 的综述生成。
- 新建 Memory Bank 文件 [`productContext.md`](memory-bank/productContext.md:1)，用来记录“真实实现”的产品视图，而不是文档中早期的 Flask 示例。

## 3. 打算近期推进的工作块

1. 补齐并启用 Memory Bank 其余文件：
   - `activeContext.md`：记录当前关注点、近期变更和开放问题。
   - `systemPatterns.md`：记录系统采用的关键架构 / 设计模式及其演进。
   - `decisionLog.md`：记录重要设计决策与取舍。
   - `progress.md`：按时间线记录阶段性进展。
2. 针对 RAG：在现有 todo 列表基础上，梳理一条清晰的“RAG + 可视化检索”实施路线，并与 Code 模式开发任务对齐。
3. 在 Architect 模式下维护一份适合实施的开发 todo（通过 update_todo_list），并在需要时请求切换到 Code 模式执行。

## 4. 当前开放问题 / 待定决策

- RAG 的向量存储方案：
  - 短期：沿用当前设计，将 embedding 存在 SQLite 的 Paper.embedding 字段，通过内存加载 + 相似度计算实现检索。
  - 中期：是否需要引入独立向量库（如 ChromaDB / Qdrant）以支持更大规模与更复杂的查询。
- RAG 检索粒度：
  - 以“文献级别向量”作为起点，后续是否需要细化到段落级 / 句子级向量，以提升综述生成的精细度。
- 前端可视化形式：
  - 是否采用单独的“RAG 调试面板”页面，还是作为综述助手 / 文献库页面右侧抽屉。

## 5. 时间戳

- [2025-11-15 04:36:06] - 初始化 activeContext.md，记录当前主要关注 Memory Bank 初始化与 RAG 规划工作。