<div align="center">

# ScholarNative

**面向 PhD 研究者的端到端学术文献综述生成系统**

多源文献采集 &rarr; PRISMA 筛选 &rarr; 语义检索 (RAG) &rarr; LLM 智能综述生成

[![Python](https://img.shields.io/badge/Python-3.10+-3776AB?logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://typescriptlang.org)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

</div>

---

## 简介

ScholarNative 自动化文献综述写作中最耗时的环节——从 7 个学术数据库采集论文，通过 PRISMA 方法论筛选整理，再利用大语言模型生成带有可追溯、零幻觉引用的学术级综述章节。

```
关键词 ──→ 多源爬虫采集 ──→ PRISMA 筛选 ──→ 正式文献库
                                                    │
                                     语义检索 (RAG) ← 查询
                                                    │
                                     LLM 综述生成 + [[REF_x]] 引用锚定
                                                    │
                                     多格式导出 (Markdown / DOCX / PDF)
```

---

## 核心功能

### 多源文献采集

| 数据源 | 元数据 | 摘要 | 引用数 | 认证方式 |
|--------|--------|------|--------|----------|
| Scopus | ✅ | ✅ | ✅ | API Key |
| Google Scholar (SerpAPI) | ✅ | ✅ | ✅ | API Key |
| Semantic Scholar | ✅ | ✅ | ✅ | 免费 |
| OpenAlex | ✅ | ✅ | ✅ | 免费 |
| CrossRef | ✅ | 部分 | ✅ | 免费 |
| arXiv | ✅ | ✅ | ❌ | 免费 |
| Web of Science | ✅ | ✅ | ✅ | 机构访问 |

- **两阶段入库**：爬取结果先进暂存库审核，人工确认后提升至正式文献库
- **布尔查询**：支持 `AND` / `OR` / `AND NOT` 精确检索
- **穷尽模式**：PRISMA 规范的 Scoping Review，获取所有匹配结果

### PRISMA 筛选与 AI 评分

- **四阶段流程**：Identification → Screening → Eligibility → Included
- **AI 自动筛选**：LLM 评分（0–10 分），高分自动纳入、低分自动排除并附理由
- **状态机校验**：只允许相邻阶段间转换，防止误操作
- **排除原因模板**：预定义常用排除理由，支持自定义

### 语义检索 (RAG)

- **向量化索引**：基于标题+摘要生成 Embedding（支持 OpenAI、Gemini 等模型）
- **混合召回**：语义相似度 + 标签增强 + 关键词扩展
- **片段级 RAG**：PDF 按段落索引并带页码，支持精确引用 `[[REF_x:pN]]`
- **WebSocket 调试面板**：实时可视化相似度分布与检索过程

### 智能综述生成

- **一键综述**：输入主题 → 自动生成框架 → 逐章节语义检索 → LLM 生成学术叙事 → 全文组装
- **PhD 六步管线**：框架生成 → 自动检索 → 论点提取 → 证据匹配 → 章节渲染 → 全文组装（SSE 实时进度 + 断点续跑）
- **`[[REF_x]]` 引用锚定**：LLM 输出确定性占位符 → 后处理器通过数据库查表解析为 `(Author, Year)` 真实引文——**彻底消除引用幻觉**
- **五种引用格式**：Harvard / APA / IEEE / Chicago / Vancouver
- **多格式导出**：Markdown、DOCX（Times New Roman 学术排版）、PDF（A4 页码）

### 引文分析

- **引用图谱**：单篇文献 ego-network 可视化
- **批量同步**：一键采集引用/被引关系
- **期刊信息增强**：自动补全影响因子、JCR 分区、收录平台（SCI / SSCI / EI）

### 机构访问与 PDF 下载

- **EZProxy / Shibboleth 登录**：Selenium 自动化大学机构认证
- **多策略 PDF 下载**：直接下载 → Unpaywall 开放获取 → 机构认证 Selenium
- **8 个出版商适配器**：Elsevier、Springer、Wiley、T&F、IEEE、SAGE、ACM、通用
- **前端"机构下载"按钮**：在用户浏览器中直接打开代理后的文章页，零反爬

### AI 助手

- **Agent 对话**：内置对话式 AI 助手，支持自然语言交互
- **主动心跳**：Agent 定期推送系统状态通知

---

## 系统架构

```
┌──────────────────────────────────────────────────────────────────┐
│                   前端 — React 19 + Vite 7                       │
│  TypeScript 5.9 · 12 个页面 · 60+ 组件 · 统一 API 调用层        │
│  端口: 5173 (开发) / 80 (nginx)                                  │
├──────────────────────────────────────────────────────────────────┤
│                   后端 — FastAPI + Python                         │
│  SQLAlchemy 2 · Pydantic 2 · Uvicorn · 端口: 5455               │
│                                                                  │
│  ┌────────────────┐  ┌──────────────┐  ┌──────────────────┐     │
│  │  13 个 API 路由 │  │ 40+ 服务模块  │  │ LLM 集成层       │     │
│  └────────────────┘  └──────────────┘  └──────────────────┘     │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │  爬虫层: 7 个数据源 + MultiSourceOrchestrator             │    │
│  │  Scopus · Scholar · Semantic Scholar · OpenAlex ·          │    │
│  │  CrossRef · arXiv · Web of Science                        │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │  引用锚定: [[REF_x]] → 数据库查表 → (Author, Year)        │    │
│  └──────────────────────────────────────────────────────────┘    │
├──────────────────────────────────────────────────────────────────┤
│  SQLite + Alembic 数据库迁移 · 18 张表 · 12 个核心模型          │
└──────────────────────────────────────────────────────────────────┘
```

---

## 快速启动

### 环境要求

| 组件 | 版本 |
|------|------|
| Python | 3.10+ |
| Node.js | 18+ |
| LLM API | 任意 OpenAI 兼容接口 |

### 一键启动（Windows）

```powershell
# 项目根目录
.\start.ps1
# 或
start.bat
```

### 手动启动

```bash
# 后端
cd backend
pip install -r requirements.txt
cp .env.example .env   # 填入你的 API Key
python run.py           # http://localhost:5455  |  接口文档: /api/docs

# 前端
cd frontend
npm install
npm run dev             # http://localhost:5173
```

### 使用流程

1. 打开 `http://localhost:5173`
2. 进入 **设置** → 配置 LLM API Key 和模型
3. 进入 **文献检索** → 输入关键词 → 开始采集
4. 在 **暂存库** 审核论文 → 提升至 **正式文献库**
5. 进入 **综述编排** → 一键生成文献综述

---

## 配置说明

在 `backend/` 目录下创建 `.env` 文件：

```env
# LLM 服务（OpenAI 兼容接口）
OPENAI_API_KEY=sk-your-key
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o

# Embedding 模型
EMBEDDING_MODEL=text-embedding-3-small

# 爬虫 API Key（按需配置）
SERPAPI_API_KEY=your-key
SCOPUS_ENABLED=true
SCOPUS_API_KEY=your-key
OPENALEX_EMAIL=your@email.com

# 机构访问（可选）
INSTITUTIONAL_ENABLED=true
INSTITUTIONAL_LOGIN_URL=https://your-university.idm.oclc.org/login
INSTITUTIONAL_EZPROXY_PREFIX=https://your-university.idm.oclc.org/login?url=
INSTITUTIONAL_USERNAME=your-username
INSTITUTIONAL_PASSWORD=your-password
```

所有配置也可以在前端 **设置** 页面中动态修改，即时生效。

---

## Docker 部署

```bash
docker-compose -f deployment/docker-compose.yml up -d

# 前端: http://localhost
# 接口文档: http://localhost/api/docs
```

---

## API 一览

完整交互式文档请访问 `/api/docs`（Swagger UI）。

| 路由前缀 | 模块 | 说明 |
|----------|------|------|
| `/api/papers` | 文献管理 | 增删改查、搜索、PDF 上传/下载、Embedding 回填 |
| `/api/staging-papers` | 暂存库 | 搜索、AI 筛选、PRISMA 阶段管理、提升/拒绝 |
| `/api/reviews` | 综述管理 | 一键生成、PhD 管线、SSE 进度推送、导出 |
| `/api/crawl` | 爬虫任务 | 任务管理、分页抓取、暂停/恢复/重试 |
| `/api/semantic-search` | 语义检索 | HTTP 搜索、WebSocket 调试流 |
| `/api/citations` | 引文关系 | Ego-graph、批量同步 |
| `/api/citation-analysis` | 引文分析 | 网络指标、世代/影响力/聚类标签 |
| `/api/groups` | 文献分组 | 分组管理与文献关联 |
| `/api/journal-info` | 期刊信息 | 影响因子、分区查询、批量增强 |
| `/api/settings` | 系统设置 | 数据源、模型、机构访问、Agent 配置 |
| `/api/agent` | AI 助手 | 对话 API、WebSocket 通知 |
| `/api/recall-logs` | 召回日志 | 检索交互行为记录 |
| `/api/` (usage) | API 监控 | LLM / Embedding / 爬虫调用日志与统计 |

---

## 项目结构

```
backend/
├── app/
│   ├── api/              # 13 个 FastAPI 路由
│   ├── models/           # SQLAlchemy ORM 模型
│   ├── schemas/          # Pydantic 请求/响应模型
│   ├── services/         # 业务逻辑（40+ 服务文件）
│   │   ├── crawler/      # 7 个数据源爬虫 + 编排器
│   │   ├── llm/          # LLM 集成 + Prompt 模板
│   │   └── review/       # 综述生成管线
│   ├── utils/            # 工具函数
│   ├── config.py         # 配置管理
│   └── main.py           # 应用入口
├── alembic/              # 数据库迁移
└── requirements.txt

frontend/
├── src/
│   ├── pages/            # 12 个页面组件
│   ├── components/       # 60+ 可复用组件
│   │   ├── settings/     # 10 个设置面板
│   │   ├── library/      # 文献库表格、筛选、弹窗
│   │   ├── staging/      # PRISMA 筛选 UI
│   │   ├── review/       # 综述展示组件
│   │   ├── phd/          # PhD 管线步骤表单
│   │   ├── crawler/      # 爬虫任务表单与历史
│   │   └── ...
│   ├── api/              # 类型化 API 调用模块
│   ├── hooks/            # 共享 Hooks
│   └── types/            # TypeScript 类型定义
└── vite.config.ts
```

---

## 许可

本项目为个人学术研究工具，仅供学习和研究使用。
