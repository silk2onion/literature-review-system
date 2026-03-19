# 数据流与一致性策略文档

## 1. 核心数据流：暂存库 (Staging) -> 正式库 (Paper)

为了保证文献数据的质量和一致性，系统采用了“二阶段入库”策略。

### 1.1 抓取阶段 (Crawl)
所有爬虫（Arxiv, Scholar, Scopus 等）抓取的原始数据（`SourcePaper`）**不会**直接写入 `Paper` 表。
而是通过 `insert_or_update_staging_from_sources` 写入 `StagingPaper` 暂存表。

- **去重逻辑**：基于 DOI 或 (Title + Year) 进行 identity 级去重。
- **状态管理**：新抓取的记录状态为 `pending`。

### 1.2 提升阶段 (Promote)
用户或自动规则将 `StagingPaper` 提升为正式 `Paper`。
此过程由 `PaperService.promote_staging_papers` 处理。

- **合并逻辑**：如果正式库中已存在对应文献，则关联之；否则创建新 `Paper`。
- **Embedding 生成**：
    - 在创建新 `Paper` 时，**强制**触发 `EmbeddingService` 生成向量。
    - 在关联已有 `Paper` 时，如果该 Paper 缺少向量，也会尝试补充生成。
    - 这一步确保了所有进入正式库的文献都能被语义检索搜到。

## 2. 向量数据一致性 (Embedding Consistency)

向量数据 (`Paper.embedding`) 是语义检索的核心。为了保持其与元数据 (`title`, `abstract`) 的一致性，我们遵循以下原则：

### 2.1 自动同步
所有对 `Paper` 的写操作都必须通过 `PaperService` 进行，严禁直接操作 DB 模型。

- **Create**: `create_paper_with_embedding` 会在事务提交前生成向量。
- **Update**: `update_paper_with_embedding` 会检测 `title` 或 `abstract` 是否变更。
    - 若变更：强制重新生成向量。
    - 若未变更：仅在向量缺失时补充。
- **Delete**: 删除 `Paper` 记录时，内嵌的 `embedding` 字段自然被删除（未来若接入外部向量库，需在此处增加 hook）。

### 2.2 异常处理
- 如果向量生成服务（如 OpenAI API）不可用，`PaperService` 会记录错误日志 (`logger.exception`) 但**不会阻断**元数据的保存。
- 这意味着可能存在少量“有元数据但无向量”的文献。
- **补救措施**：系统应提供后台任务（Background Job），定期扫描 `embedding IS NULL` 的 Paper 并尝试重新生成。

## 3. 引用关系流 (Citation Flow)

引用关系的导入也遵循类似的“先占位，后填充”策略。

- 当导入引用关系时，如果被引文献在本地不存在，会创建一个“占位 Paper” (Placeholder)。
- **关键修正**：占位 Paper 的创建流程 (`CitationIngestService`) 也已接入 `EmbeddingService`，确保即使是占位符也能参与语义检索（基于标题）。

## 4. 开发规范

1. **禁止**在 Service 层之外直接实例化 `Paper` 对象并 `db.add()`，除非你非常清楚自己在做什么。
2. **必须**使用 `PaperService` 提供的 `create/update/promote` 方法。
3. 在编写新的数据导入脚本时，请务必调用 `await embedding_service.embed_paper(paper)`。