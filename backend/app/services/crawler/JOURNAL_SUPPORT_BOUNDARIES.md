# 爬虫与数据源：期刊分区与收录信息支持边界说明

## 1. 现状概述

当前系统主要包含以下爬虫/数据源：
1.  **Arxiv**: 已实现 (Active)
2.  **Google Scholar (via SerpAPI)**: 占位 (Stub)
3.  **Scopus**: 占位 (Stub)

## 2. 数据源支持边界

### 2.1 Arxiv
*   **支持内容**:
    *   基础元数据 (标题, 作者, 摘要, 年份)
    *   `categories`: Arxiv 自身的学科分类 (e.g., `cs.AI`, `stat.ML`)
    *   `doi`: 部分文献提供
    *   `journal_ref`: 部分文献提供非结构化的期刊引用字符串
*   **不支持内容**:
    *   **期刊影响因子 (Impact Factor)**: Arxiv 是预印本平台，不涉及此指标。
    *   **JCR/CAS 分区 (Quartile)**: 不提供。
    *   **收录平台 (Indexing)**: 不提供 (如 SCI, SSCI 等信息)。
*   **结论**: Arxiv 仅作为文献发现源，无法直接提供期刊评价指标。

### 2.2 Google Scholar (SerpAPI)
*   **预期支持**:
    *   `venue`: 出版物名称 (期刊名或会议名)
    *   `publisher`: 出版商信息
*   **不支持**:
    *   结构化的 IF 或 分区数据。Google Scholar 搜索结果通常不包含这些专有指标。
*   **结论**: 需依赖提取出的 `venue` 字段进行后续匹配增强。

### 2.3 Scopus
*   **预期支持**:
    *   `prism:publicationName`: 规范的出版物名称
    *   `prism:issn` / `prism:eIssn`: ISSN 号 (关键匹配字段)
    *   Scopus 自身指标 (CiteScore, SJR, SNIP)
*   **限制**:
    *   不直接提供 JCR Impact Factor (Clarivate 专有数据)。
    *   不直接提供中科院分区数据。
*   **结论**: Scopus 是获取 ISSN 和规范期刊名的最佳来源，但 JCR/分区数据仍需外部映射。

## 3. 解决方案：两阶段增强策略

鉴于单一数据源无法直接提供完整的期刊评价信息，系统采用 **“爬虫抓取 + 后端增强”** 的两阶段策略：

1.  **阶段一：爬虫抓取 (Crawling)**
    *   **目标**: 尽可能准确地获取 **期刊名称 (Journal Name)** 和 **ISSN**。
    *   **字段**: 填充 `Paper.journal`, `Paper.journal_issn`, `Paper.doi`。

2.  **阶段二：信息增强 (Enrichment)**
    *   **组件**: `JournalInfoService` (已规划)
    *   **机制**:
        *   基于 `journal_issn` (首选) 或 `journal` (名称模糊匹配) 查询本地维护的期刊数据库或外部 API。
        *   **本地数据库**: 维护一份包含 ISSN, IF, JCR分区, 中科院分区, 收录情况(SCI/SSCI) 的映射表。
    *   **回填字段**:
        *   `Paper.journal_impact_factor`
        *   `Paper.journal_quartile`
        *   `Paper.indexing`

## 4. 开发指导

*   **爬虫开发者**: 请专注于清洗和提取 `journal` 和 `issn` 字段。不要尝试在爬虫类中硬编码分区逻辑。
*   **数据模型**: `SourcePaper` 中已包含 `journal` 字段。后续入库时，`PaperIngestService` 可触发增强流程。