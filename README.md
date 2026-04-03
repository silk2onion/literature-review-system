<div align="center">

# ScholarNative

**End-to-end Literature Review System for PhD Researchers**

Multi-source crawling &rarr; PRISMA screening &rarr; Semantic search (RAG) &rarr; LLM-powered review generation

[![Python](https://img.shields.io/badge/Python-3.10+-3776AB?logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://typescriptlang.org)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

</div>

---

## What is ScholarNative?

ScholarNative automates the most time-consuming parts of writing a literature review. It fetches papers from 7 academic databases, helps you screen and organise them using the PRISMA methodology, and uses LLMs to generate publication-ready review chapters with fully traceable, hallucination-free citations.

```
Keywords ──→ Multi-source Crawling ──→ PRISMA Screening ──→ Formal Library
                                                                   │
                                                    Semantic Search (RAG) ← Query
                                                                   │
                                                    LLM Review Generation
                                                    with [[REF_x]] anchoring
                                                                   │
                                                    Export (Markdown / DOCX / PDF)
```

---

## Features

### Literature Acquisition

| Source | Metadata | Abstract | Citations | Auth |
|--------|----------|----------|-----------|------|
| Scopus | ✅ | ✅ | ✅ | API Key |
| Google Scholar (SerpAPI) | ✅ | ✅ | ✅ | API Key |
| Semantic Scholar | ✅ | ✅ | ✅ | Free |
| OpenAlex | ✅ | ✅ | ✅ | Free |
| CrossRef | ✅ | Partial | ✅ | Free |
| arXiv | ✅ | ✅ | ❌ | Free |
| Web of Science | ✅ | ✅ | ✅ | Institutional |

- **Two-stage ingestion**: crawled papers enter a staging library for review before promotion to the formal library
- **Boolean query support**: `AND` / `OR` / `AND NOT` operators for precise searches
- **Exhaustive mode**: PRISMA-compliant scoping reviews that fetch all matching results

### PRISMA Screening & AI Scoring

- **4-stage pipeline**: Identification → Screening → Eligibility → Included
- **AI screening**: LLM auto-scores relevance (0–10), auto-promotes or rejects with reasons
- **State machine validation**: only adjacent stage transitions allowed
- **Exclusion reason templates**: predefined and customisable

### Semantic Search (RAG)

- **Embedding-based retrieval**: title + abstract vectors (supports OpenAI, Gemini, and compatible models)
- **Hybrid recall**: semantic similarity + tag boosting + keyword expansion
- **Chunk-level RAG**: PDF paragraphs indexed with page numbers for precise `[[REF_x:pN]]` citations
- **WebSocket debug panel**: real-time visualisation of similarity distributions

### Review Generation

- **One-click orchestration**: topic → framework → per-chapter RAG retrieval → LLM generation → assembly
- **PhD 6-step pipeline**: framework → auto-search → claim extraction → evidence matching → chapter rendering → full-text assembly (with SSE progress + checkpoint resume)
- **`[[REF_x]]` citation anchoring**: deterministic ID placeholders → post-processor resolves to `(Author, Year)` via DB lookup — **zero citation hallucination**
- **5 citation formats**: Harvard / APA / IEEE / Chicago / Vancouver
- **Export**: Markdown, DOCX (Times New Roman, 1.5 line spacing), PDF (A4, page numbers)

### Citation Analysis

- **Citation graph**: ego-network visualisation for any paper
- **Batch sync**: bulk citation relationship harvesting
- **Journal enrichment**: auto-fill impact factor, JCR quartile, indexing (SCI/SSCI/EI)

### Institutional Access & PDF Download

- **EZProxy / Shibboleth login**: automated institutional authentication via Selenium
- **Multi-strategy PDF download**: direct download → Unpaywall OA → institutional Selenium
- **8 publisher handlers**: Elsevier, Springer, Wiley, T&F, IEEE, SAGE, ACM, generic
- **Frontend "Institutional Download" button**: opens proxied article URL in user's browser

### AI Assistant

- **Agent chat**: conversational AI with natural-language task execution
- **Proactive heartbeat**: periodic system status notifications

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                    Frontend — React 19 + Vite 7                  │
│  TypeScript 5.9 · 12 pages · 60+ components · unified API layer │
│  Port: 5173 (dev) / 80 (nginx)                                  │
├──────────────────────────────────────────────────────────────────┤
│                    Backend — FastAPI + Python                     │
│  SQLAlchemy 2 · Pydantic 2 · Uvicorn · Port: 5455               │
│                                                                  │
│  ┌────────────────┐  ┌─────────────────┐  ┌──────────────────┐  │
│  │  13 API Routers │  │  40+ Services   │  │ LLM Integration  │  │
│  └────────────────┘  └─────────────────┘  └──────────────────┘  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │  Crawler Layer: 7 sources + MultiSourceOrchestrator      │    │
│  │  Scopus · Scholar · Semantic Scholar · OpenAlex ·         │    │
│  │  CrossRef · arXiv · Web of Science                       │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │  Citation Anchoring: [[REF_x]] system                    │    │
│  │  Deterministic IDs → DB lookup → (Author, Year)          │    │
│  └──────────────────────────────────────────────────────────┘    │
├──────────────────────────────────────────────────────────────────┤
│  SQLite + Alembic migrations · 18 tables · 12 core models       │
└──────────────────────────────────────────────────────────────────┘
```

---

## Quick Start

### Prerequisites

| Component | Version |
|-----------|---------|
| Python | 3.10+ |
| Node.js | 18+ |
| LLM API | Any OpenAI-compatible endpoint |

### One-click (Windows)

```powershell
# From the project root
.\start.ps1
# or
start.bat
```

### Manual

```bash
# Backend
cd backend
pip install -r requirements.txt
cp .env.example .env   # edit with your API keys
python run.py           # http://localhost:5455  |  Swagger: /api/docs

# Frontend
cd frontend
npm install
npm run dev             # http://localhost:5173
```

### First steps

1. Open `http://localhost:5173`
2. Go to **Settings** → configure your LLM API key and model
3. Go to **Literature Search** → enter keywords → start crawling
4. Review papers in **Staging Library** → promote to **Formal Library**
5. Go to **Review Orchestration** → generate your literature review

---

## Configuration

Create `backend/.env`:

```env
# LLM (OpenAI-compatible)
OPENAI_API_KEY=sk-your-key
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o

# Embedding
EMBEDDING_MODEL=text-embedding-3-small

# Crawlers (optional — configure as needed)
SERPAPI_API_KEY=your-key
SCOPUS_ENABLED=true
SCOPUS_API_KEY=your-key
OPENALEX_EMAIL=your@email.com

# Institutional Access (optional)
INSTITUTIONAL_ENABLED=true
INSTITUTIONAL_LOGIN_URL=https://your-university.idm.oclc.org/login
INSTITUTIONAL_EZPROXY_PREFIX=https://your-university.idm.oclc.org/login?url=
INSTITUTIONAL_USERNAME=your-username
INSTITUTIONAL_PASSWORD=your-password
```

All settings can also be configured at runtime via the **Settings** page in the UI.

---

## Docker

```bash
docker-compose -f deployment/docker-compose.yml up -d

# Frontend: http://localhost
# API docs: http://localhost/api/docs
```

---

## API Reference

Full interactive documentation available at `/api/docs` (Swagger UI).

| Prefix | Module | Description |
|--------|--------|-------------|
| `/api/papers` | Library | CRUD, search, PDF upload/download, embedding backfill |
| `/api/staging-papers` | Staging | Search, AI screening, PRISMA stages, promote/reject |
| `/api/reviews` | Reviews | One-click generation, PhD pipeline, SSE progress, export |
| `/api/crawl` | Crawling | Job management, pagination, pause/resume/retry |
| `/api/semantic-search` | RAG | HTTP search, WebSocket debug stream |
| `/api/citations` | Citations | Ego-graph, batch sync, relationship management |
| `/api/citation-analysis` | Analysis | Network metrics, generation/impact/cluster tags |
| `/api/groups` | Groups | Literature group management |
| `/api/journal-info` | Journals | Impact factor, quartile lookup, bulk enrichment |
| `/api/settings` | Settings | Data sources, models, institutional access, agent config |
| `/api/agent` | AI Assistant | Chat API, WebSocket notifications |
| `/api/recall-logs` | Logging | Search interaction tracking |
| `/api/` (usage) | Monitoring | LLM/Embedding/Crawler API call logs and stats |

---

## Project Structure

```
backend/
├── app/
│   ├── api/              # 13 FastAPI routers
│   ├── models/           # SQLAlchemy ORM models
│   ├── schemas/          # Pydantic request/response schemas
│   ├── services/         # Business logic (40+ service files)
│   │   ├── crawler/      # 7 data source crawlers + orchestrator
│   │   ├── llm/          # LLM integration + prompt templates
│   │   └── review/       # Review generation pipeline
│   ├── utils/            # Shared utilities
│   ├── config.py         # Pydantic settings
│   └── main.py           # FastAPI app entry point
├── alembic/              # Database migrations
└── requirements.txt

frontend/
├── src/
│   ├── pages/            # 12 page components
│   ├── components/       # 60+ reusable components
│   │   ├── settings/     # 10 settings panels
│   │   ├── library/      # Library table, filters, modals
│   │   ├── staging/      # PRISMA screening UI
│   │   ├── review/       # Review display components
│   │   ├── phd/          # PhD pipeline step forms
│   │   ├── crawler/      # Crawl job form and history
│   │   └── ...
│   ├── api/              # Typed API client modules
│   ├── hooks/            # Shared React hooks
│   └── types/            # TypeScript type definitions
└── vite.config.ts
```

---

## License

This project is a personal academic research tool, intended for learning and research purposes only.
