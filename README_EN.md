# ScholarNative — Academic Literature Review Generation System

> **An end-to-end literature review assistant for Urban Design / Urban Planning PhD researchers**
>
> Multi-source crawling → Staging review → Main library → Semantic search (RAG) → LLM-powered academic review generation → `[[REF_x]]` deterministic citation tracking

---

## Table of Contents

- [System Overview](#system-overview)
- [Core Features](#core-features)
- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [Feature Guide](#feature-guide)
- [API Reference](#api-reference)
- [Data Models](#data-models)
- [Frontend Pages](#frontend-pages)
- [Configuration](#configuration)
- [Docker Deployment](#docker-deployment)
- [Roadmap](#roadmap)

---

## System Overview

ScholarNative is a full-stack academic assistant covering the entire pipeline from literature collection to review writing:

```
Keywords → Multi-source Crawlers → Staging Review → Main Library → Embedding Vectorization
                                                                        ↓
                                                              Semantic Search (RAG) ← Query
                                                                        ↓
                                                              LLM Review Generation (with [[REF_x]] Citation Anchoring)
                                                                        ↓
                                                              Multi-format Export (Markdown)
```

**Current Status**: The system has been validated end-to-end. A single run can produce a complete academic review with **7 chapters, 30+ cited papers, 22,000+ words**, supporting Harvard / APA / IEEE / Chicago / Vancouver citation formats.

---

## Core Features

### 📚 Multi-Source Literature Collection

- **5 Academic Sources**: Arxiv, Google Scholar (SerpAPI), Scopus, CrossRef, Semantic Scholar
- **Two-Stage Ingestion**: Crawled results enter a staging library (StagingPaper) first, then get promoted to the main library (Paper) after manual review
- **Batch Job Management**: Paginated crawling, pause/resume/retry, real-time logs

### 🔍 Semantic Search (RAG)

- **Vector Indexing**: Title + abstract based embedding generation (supports Google Gemini Embedding and other models, 3072 dimensions)
- **Hybrid Recall**: Semantic similarity + tag enhancement + keyword expansion
- **WebSocket Real-time Debugging**: Stream intermediate retrieval results, visualize similarity distributions and activated semantic groups

### 📝 Intelligent Review Generation

- **One-Click Review (Orchestrate)**: Input topic → auto-generate framework → per-section semantic search → LLM generates 800-1500 words/section of academic narrative
- **PhD Multi-Stage Pipeline**: Framework generation → claim extraction → evidence matching → section rendering → full document assembly (6-step async pipeline with checkpoint/resume)
- **`[[REF_x]]` Citation Anchoring System**: LLM outputs deterministic placeholders → post-processor resolves them to real citations `(Author, Year)` via DB lookup, completely eliminating LLM citation hallucinations
- **Multiple Citation Formats**: Harvard / APA / IEEE / Chicago / Vancouver, unified rendering by `ReferenceFormatterService`

### 📊 Citation Analysis

- **Citation Graph**: Automatically collect citing/cited relationships, build ego-graph visualization
- **Journal Info Enhancement**: Auto-query impact factors, JCR quartiles, indexing platforms (SCI/SSCI/EI)

### 🤖 AI Assistant

- **Agent Chat**: Built-in conversational AI assistant supporting natural language interaction and task execution
- **Proactive Heartbeat**: Agent periodically pushes system status notifications

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend                              │
│  React 18 + TypeScript + Vite                                │
│  10 feature pages + Agent Chat sidebar                       │
│  Port: 5173 (dev) / 80 (nginx)                               │
├─────────────────────────────────────────────────────────────┤
│                        Backend                               │
│  FastAPI + SQLAlchemy + SQLite                               │
│  Port: 5444                                                  │
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐           │
│  │ 12 API   │  │ Services │  │ LLM Integration  │           │
│  │ Routers  │  │ Layer    │  │ (OpenAI Compat.) │           │
│  └──────────┘  └──────────┘  └──────────────────┘           │
│                                                              │
│  ┌──────────────────────────────────────────────┐            │
│  │ Crawler Layer (5 sources)                     │            │
│  │ arxiv / scholar_serpapi / scopus /             │            │
│  │ crossref / semantic_scholar                   │            │
│  └──────────────────────────────────────────────┘            │
│                                                              │
│  ┌──────────────────────────────────────────────┐            │
│  │ Citation Anchoring ([[REF_x]] system)         │            │
│  │ citation_anchoring.py + reference_formatter   │            │
│  └──────────────────────────────────────────────┘            │
├─────────────────────────────────────────────────────────────┤
│  SQLite Database                                             │
│  15 tables / 11 core models                                  │
└─────────────────────────────────────────────────────────────┘
```

---

## Quick Start

### Requirements

| Component | Version                                       |
| --------- | --------------------------------------------- |
| Python    | 3.10+                                         |
| Node.js   | 18+                                           |
| LLM API   | OpenAI-compatible endpoint (API Key required) |

### Start Backend

```bash
cd backend
pip install -r requirements.txt

# Configure .env file (see "Configuration" section)
# Or modify defaults in app/config.py

python run.py
# Backend listens on http://localhost:5444
# API docs at http://localhost:5444/api/docs
```

### Start Frontend

```bash
cd frontend
npm install
npm run dev
# Frontend listens on http://localhost:5173
```

### Verify

1. Visit `http://localhost:5173` — you should see the main interface
2. Go to "Settings" to configure LLM API Key and models
3. Navigate to "Literature Search" page, enter keywords to start collecting papers

---

## Feature Guide

### 1. Literature Collection & Ingestion

**Flow**: Keywords + year range + data sources → CrawlJob batch task → staging library → manual review → main library

```
User enters keywords
    ↓
CrawlJob created (multiple sources can run in parallel)
    ↓
Crawlers paginate through results (supports pause/resume/retry)
    ↓
Results written to StagingPaper (staging library)
    ↓
User reviews in staging page → Promote / Reject / Delete
    ↓
On promotion: auto-generate Embedding → write to Paper (main library)
```

**Source Capabilities**:

| Source                   | Full Metadata | Abstract | Citation Count | PDF Link |
| ------------------------ | ------------- | -------- | -------------- | -------- |
| Arxiv                    | ✅            | ✅       | ❌             | ✅       |
| Google Scholar (SerpAPI) | ✅            | ✅       | ✅             | Partial  |
| Scopus                   | ✅            | ✅       | ✅             | ✅       |
| CrossRef                 | ✅            | Partial  | ✅             | ❌       |
| Semantic Scholar         | ✅            | ✅       | ✅             | Partial  |

### 2. One-Click Review Generation (Orchestrate)

**Entry**: Review Orchestrate page → input topic, keywords, language, citation format

**Pipeline Flow**:

1. **Framework Generation**: LLM generates a structured outline of 5-8 sections (with title / description / research_gap / search_keywords)
2. **Per-Section Literature Search**: Semantic search using each section's search_keywords, recall top-K relevant papers
3. **Per-Section Content Generation**: Inject recalled papers into `[[REF_x]]` mapping table → LLM generates 800-1500 word academic narrative → post-processor resolves citations
4. **Full Document Assembly**: Merge all sections + generate reference list → save as Review record

**End-to-End Validation Results** (2026-03-18):

- 7 sections, each with 800-1200 words of critical academic narrative
- 30 papers cited with Harvard format `(Author, Year)`
- Total word count: 22,236
- Complete `citation_map`, `references_markdown`, `full_markdown`

### 3. PhD Multi-Stage Pipeline

**Entry**: Review Shelf → "Generate from Library" / PhD Pipeline page

**6-Step Pipeline** (supports SSE progress streaming + checkpoint/resume):

| Step     | Name              | Description                                  |
| -------- | ----------------- | -------------------------------------------- |
| Step 0   | Framework         | LLM generates structured outline             |
| Step 0.5 | Auto Search       | Auto-crawl/search papers by section keywords |
| Step 1   | Claim Extraction  | Extract claims from literature               |
| Step 2   | Evidence Matching | Match supporting papers to each claim        |
| Step 3   | Section Rendering | From claims + evidence → full section text   |
| Step 4   | Document Assembly | Merge sections + reference list              |

### 4. `[[REF_x]]` Citation Anchoring System

**Core Design**: Replace LLM free-form citations with deterministic IDs, completely eliminating citation hallucinations.

```
Step 1: Build mapping table
  paper_id=42 → [[REF_1]], paper_id=17 → [[REF_2]], ...

Step 2: Inject into prompt
  "Paper: Transit-Oriented Development... [[REF_1]]"

Step 3: LLM output
  "...as demonstrated by [[REF_1]] and [[REF_2]]..."

Step 4: Post-processor resolves
  [[REF_1]] → DB lookup paper_id=42 → (Chen, 2023)
  [[REF_2]] → DB lookup paper_id=17 → (Wang and Li, 2024)
```

**Implementation**: `backend/app/services/citation_anchoring.py` (~355 lines)

### 5. Semantic Search (RAG)

- **HTTP API**: `POST /api/semantic-search/search` — input query text, return top-K similar papers
- **WebSocket Debug**: `/api/semantic-search/ws` — stream retrieval process
- **Frontend Debug Panel**: Real-time visualization of similarity distributions, activated semantic groups, expanded keywords

### 6. Citation Analysis

- **Ego-Graph**: `GET /api/citations/ego-graph/{paper_id}` — get citation network for a single paper
- **Batch Sync**: `POST /api/citations/sync-batch` — batch collect citation relationships
- **Network Analysis**: `POST /api/citation-analysis/analyze` — compute citation network metrics

---

## API Reference

The backend provides **12 API router modules**. Full interactive documentation at `http://localhost:5444/api/docs` (Swagger UI).

| Route Prefix             | Module             | Key Endpoints                                                    |
| ------------------------ | ------------------ | ---------------------------------------------------------------- |
| `/api/papers`            | Paper Management   | CRUD, local search, PDF upload/download, embedding backfill      |
| `/api/staging-papers`    | Staging Library    | Search, review, promote, reject, delete                          |
| `/api/reviews`           | Review Management  | One-click review, PhD pipeline (6 steps), SSE progress, export   |
| `/api/crawl`             | Crawl Jobs         | Create jobs, paginated crawling, pause/resume/retry              |
| `/api/semantic-search`   | Semantic Search    | HTTP search, WebSocket debug, embedding backfill                 |
| `/api/citations`         | Citation Relations | Ego-graph, single sync, batch sync                               |
| `/api/citation-analysis` | Citation Analysis  | Network metrics computation                                      |
| `/api/groups`            | Paper Groups       | CRUD, paper association management                               |
| `/api/journal-info`      | Journal Info       | Journal lookup, paper info enrichment                            |
| `/api/recall-logs`       | Recall Logs        | Log search interaction behavior                                  |
| `/api/agent`             | AI Assistant       | Chat API, WebSocket notifications                                |
| `/api/settings`          | System Settings    | Data source config, model selection, system prompt, agent config |

---

## Data Models

The system contains **15 database tables** and **11 core ORM models**:

| Model              | Description        | Key Fields                                                          |
| ------------------ | ------------------ | ------------------------------------------------------------------- |
| `Paper`            | Main Library       | title, authors, abstract, year, doi, embedding, journal_quartile    |
| `StagingPaper`     | Staging Library    | Same as Paper + batch_id, status (pending/promoted/rejected)        |
| `Review`           | Review Records     | title, framework(JSON), content(Markdown), citation_map, word_count |
| `CrawlJob`         | Crawl Jobs         | keywords, sources, status, fetched_count, log                       |
| `PipelineTask`     | PhD Pipeline Tasks | task_id, status, state_data(checkpoint JSON), steps                 |
| `Citation`         | Citation Relations | citing_paper_id, cited_paper_id, source                             |
| `Tag` / `TagGroup` | Tag System         | Paper tags and tag groups                                           |
| `PaperChunk`       | Text Fragments     | paper_id, chunk_text, chunk_embedding (PDF segments)                |
| `RecallLog`        | Recall Logs        | query_keywords, paper_id, rank, score                               |
| `Group`            | Paper Groups       | name, description, paper associations                               |
| `SystemSetting`    | System Config      | key-value pair storage                                              |

---

## Frontend Pages

The system includes **10 feature pages** + 1 sidebar Agent Chat:

| Page               | Component File                                      | Function                                                          |
| ------------------ | --------------------------------------------------- | ----------------------------------------------------------------- |
| Literature Search  | `CrawlerSearchPage.tsx`                             | Keyword input → multi-source crawling → job management            |
| Library            | `LibraryPage.tsx`                                   | Browse, filter, sort, PDF management, citation analysis, grouping |
| Staging Library    | `StagingPapersPage.tsx`                             | Review staging papers: promote/reject/delete                      |
| Review Orchestrate | `ReviewOrchestratePage.tsx`                         | One-click review entry (topic → framework → full text)            |
| Review Shelf       | `ReviewListPage.tsx`                                | Generated review list, export                                     |
| Generate from Lib  | `ReviewGenerateFromLibraryPage.tsx`                 | Select papers from library → generate review                      |
| PhD Pipeline       | `PhdPipelinePage.tsx`                               | 6-step pipeline interactive interface                             |
| RAG Debug          | `RagDebugPage.tsx` + `SemanticSearchDebugPanel.tsx` | Semantic search visualization & debugging                         |
| Task Monitor       | `MonitoringDashboard.tsx`                           | PhD tasks + crawl jobs real-time status                           |
| Settings           | `SettingsModal.tsx`                                 | API config, model selection, data source settings                 |
| Agent Chat         | `AgentChatPanel.tsx`                                | Sidebar AI assistant chat                                         |

---

## Configuration

### Backend Configuration

Create a `.env` file in the `backend/` directory:

```env
# LLM Service (OpenAI-compatible endpoint)
LLM_API_KEY=sk-your-api-key
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4o

# Embedding Model
EMBEDDING_MODEL=text-embedding-3-large

# Database (defaults to SQLite)
DATABASE_URL=sqlite:///./data/literature.db

# Crawler API Keys (configure as needed)
SERPAPI_KEY=your-serpapi-key
SCOPUS_API_KEY=your-scopus-key
```

LLM models, embedding models, and data source parameters can also be configured dynamically from the frontend "Settings" page.

### Frontend Configuration

The frontend uses the proxy config in `vite.config.ts` to automatically proxy API requests to the backend at `localhost:5444`. No additional configuration needed.

---

## Docker Deployment

```bash
# From project root
docker-compose -f deployment/docker-compose.yml up -d

# Access
# Frontend: http://localhost (nginx reverse proxy)
# API docs: http://localhost/api/docs
```

Configuration files are in the `deployment/` directory:

- `docker-compose.yml` — service orchestration
- `Dockerfile.backend` — backend image
- `Dockerfile.frontend` — frontend image
- `nginx.conf` — nginx reverse proxy config

---

## Roadmap

### ✅ Completed

- [x] Multi-source literature crawling (5 data sources) + two-stage ingestion
- [x] Semantic search RAG (embedding + cosine similarity + tag enhancement)
- [x] One-click review generation (Orchestrate pipeline: framework → per-section generation)
- [x] `[[REF_x]]` deterministic citation anchoring system
- [x] PhD 6-step multi-stage pipeline (SSE progress streaming + checkpoint/resume)
- [x] 5 citation formats (Harvard / APA / IEEE / Chicago / Vancouver)
- [x] Citation graph + journal info enhancement
- [x] AI Agent Chat assistant
- [x] 10 frontend feature pages

### 🔄 In Progress / Planned

- [ ] Fragment-level RAG (PDF segment embedding + page-numbered citations)
- [ ] Citation Anchoring enhancement (per-section independent RAG recall → LLM writes only within recalled scope)
- [ ] Abstract / Conclusion auto-generation
- [ ] Export to DOCX / PDF formats
- [ ] Claim-evidence structured storage (`analysis_json` with claim → supporting_papers mapping)
- [ ] Citation validation tools (auto-detect citation anomalies in reviews)

---

## License

This project is a personal academic research tool, intended for learning and research purposes only.
