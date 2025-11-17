```markdown
# Urban Design Literature Review Assistant (Crawler + LLM + RAG)

This project is an end-to-end system aimed at researchers in urban design and planning. It covers multi-source crawlers to collect literature, building a local literature database, automated literature review generation using large language models (LLMs), and a visual RAG (retrieval-augmented generation) semantic search and debugging interface.

The codebase already supports an end-to-end local workflow: keyword search → multi-source crawling → staging review → main literature database → LLM-generated reviews → RAG semantic search and debugging. This document provides a quick overview of features, how to use the system, and design/usage notes for the RAG subsystem.

## 1. Project Structure & Responsibilities

- Backend service: Built with FastAPI + SQLite. Responsibilities include:
  - Crawling and ingesting literature
  - Local literature search and management
  - LLM-based review generation
  - Vector embeddings and semantic search (RAG)
  - Various debugging/administration APIs
- Frontend application: Built with React + TypeScript + Vite. Provides:
  - Review assistant page (keyword search + one-click review generation)
  - Library page (filtering, paginated browsing)
  - Staging review page (inspect crawl results and promote to main DB)
  - Crawl jobs page (view job status, retry, pause)
  - RAG visualization & debugging panel (inspect retrieval and activated semantic groups)
- Data & model layer:
  - `Paper` / `StagingPaper`: main library and staging library
  - `Review`: each generated review with content and structured analysis
  - `CrawlJob`: batch crawl jobs
  - `Tag` / `TagGroup` / `PaperTag`: tags and tag groups
  - `PaperCitation`: citation relationships
  - `RecallLog`: logs of recalled papers during review generation

## 2. Feature Overview

### 2.1 Crawling and Local Library Management

- Support keyword-based batch crawls with year ranges and source combinations (e.g., arXiv, Scholar SerpAPI, Scopus).
- Crawl jobs (`CrawlJob`) perform multi-page, paginated crawling and ingest results in background.
- All crawl results are first written to the staging table (`StagingPaper`) and must be manually reviewed before promotion to the main `Paper` table.
- `Paper` records include title, authors, abstract, year, source, DOI and reserved fields like `pdf_path`, journal tier, and indexing platform.
- Staging and main library queries support filtering by keyword, batch, status, and paginated results.

### 2.2 LLM Literature Review Generation

- From the Review Assistant page the user provides topic keywords, year range, sources and max number of papers. The system will:
  - Retrieve and recall a candidate set of papers;
  - Call an LLM to generate a structured review (by default in a single pass);
  - Save the result as a `Review` record containing:
    - Review content (Markdown)
    - Structured analysis data (timeline, topic clustering, etc.) in `analysis_json`
    - Associations between the review and the papers used (many-to-many `Review` ↔ `Paper`)
- There is an entry point for a PhD-level multi-stage pipeline:
  - Option: enable the PhD multi-stage pipeline to generate an outline first, then the full text;
  - Option: generate outline only, useful for drafting chapter structure and writing plan;
- Future work will add chapter-level RAG + citation pipelines to improve citation accuracy and traceability.

### 2.3 RAG Semantic Search (Current Capabilities)

- Generate embeddings for each paper in the main library (based on title and abstract) and store them in the database.
- Provide semantic search HTTP API: input a natural language query and filters, return top-K similar papers with similarity scores.
- Provide RAG WebSocket debugging API: stream intermediate retrieval results (`partial_result`, `done`, `error`).
- Frontend includes a RAG debug panel to:
  - Inspect retrieved papers, similarity scores and activated semantic group tags in real time;
  - Run multiple queries/sessions for comparison of retrieval settings.

## 3. Environment Setup & Run Instructions

### 3.1 Requirements

- OS: macOS / Linux / Windows (development validated on macOS).
- Required components:
  - Python 3.10+ (use a virtual environment is recommended)
  - Node.js 18+ and `npm` or `pnpm`
  - An LLM service compatible with OpenAI APIs (either OpenAI or a self-hosted compatible service). Configure API key and model names.

### 3.2 Start Backend

1. Change into the `backend` directory and install Python dependencies:

```bash
cd backend
pip install -r requirements.txt
```

2. Configure environment variables:
  - Create a `.env` file under `backend/` and set:
    - Database path (if not set, the default SQLite file is used)
    - LLM service API URL and API key
    - Default LLM model and embedding model names

3. Start FastAPI in development mode:

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 5444
```

The backend will be available at http://localhost:5444 by default.

### 3.3 Start Frontend

1. Change into the `frontend` directory and install dependencies:

```bash
cd frontend
npm install
```

2. Start the Vite dev server:

```bash
npm run dev
```

3. Open the Vite local address in your browser (typically http://localhost:5173).

## 4. How to Use

### 4.1 From Keywords to First Review

1. Open the frontend and go to the Review Assistant view.
2. Fill the top input fields with:
  - Topic keywords (e.g., "transit oriented development" or any urban design topic)
  - Start and end years, and a maximum number of papers
  - Select data sources (e.g., arXiv, Scholar SerpAPI, Scopus)
3. Click the search button to fetch and display candidate papers.
4. When the candidate list looks satisfactory, click "Generate review from these papers":
  - Default: generate full review in one step;
  - PhD pipeline: generate outline first, then full text;
  - Outline-only: generate a chapter outline for planning.
5. After generation, the review content appears in the left conversation stream and the preview shows Markdown and structured analysis.

### 4.2 Library & Staging Management

- Staging page:
  - Inspect raw crawl results grouped by crawl job;
  - Filter by keyword, batch, status;
  - Promote confirmed staging papers to the main library (StagingPaper → Paper) with one click.
- Library page:
  - Filter by keyword, year, source, peer-review status, etc.;
  - Paginated browsing and future bulk operations (grouping, archiving).

Promoting a staging paper automatically generates or updates its embedding to keep vector search in sync.

### 4.3 Crawl Job Management

- Crawl Jobs page shows existing `CrawlJob` entries:
  - Keywords, sources, time range, requested count, failure count, and current status;
  - View job logs and failure reasons; supports retry/pause in future iterations.
- A top-level status bar polls crawl progress and notifies when jobs complete or fail.

### 4.4 RAG Debug Panel

This panel is intended for research and parameter tuning. Typical workflow:

1. Open the RAG Debug view on the frontend.
2. Enter a natural language query (e.g., "Impact of compact urban form on walkability and public space vitality") and choose whether to enable semantic group expansion.
3. Submit the query and receive streamed results by WebSocket:
  - Batch display of retrieved papers and similarity scores;
  - Which semantic groups were activated.
4. Use the panel to observe model behavior under current embedding and semantic group settings.

## 5. RAG System Manual

### 5.1 Design Goals

- Upgrade keyword + traditional filters to a hybrid retrieval scheme: semantic search + tag/citation enhancement.
- Recall a set of highly relevant papers for each chapter or question before review generation to serve as evidence context for the LLM.
- Enable traceable citations: every citation should map to a concrete paper or text fragment.

### 5.2 Current Implementation

1. Vector generation & storage:
  - Generate embeddings for papers in the main library and store them in the DB.
  - A vector generation service ensures new papers get embeddings on ingest.
2. Semantic search API:
  - HTTP endpoint accepts query text and filters, returns top-K similar papers and optional debug info.
3. RAG WebSocket debug API:
  - Stream retrieval results per session, supporting multi-round queries/debugging.
4. Frontend RAG debug panel:
  - Show retrieval results, similarity, activated semantic groups;
  - Can be extended to integrate with Review Assistant to preview the evidence pool before generation.

### 5.3 Future Extension: Chapter-level RAG & Citation Pipeline (Design Stage)

Planned approach:

1. Construct queries at chapter / question granularity:
  - Generate RAG queries for each chapter title or question;
  - Retrieve a set of relevant paper cards (title, authors, abstract, year).
2. LLM generates chapter text restricted to the retrieved cards and embeds citations:
  - Constrain the LLM to cite only from the candidate cards;
  - Use a numeric citation format like [1], [2,5] to avoid inventing sources.
3. The system maps citation numbers back to `paper_id`:
  - System renders the bibliography based on DB metadata rather than trusting the LLM-generated list.
4. Later extend to fragment-level RAG when PDF parsing is available:
  - Embed paper passages and retrieve fragments for direct quoting with page numbers.

This design is an important part of the PhD-level multi-stage pipeline to improve citation accuracy and traceability.

## 6. Completed Features (Brief)

- Backend:
  - FastAPI service with base routes (health, version).
  - SQLite DB and core models (`Paper`, `Review`, `CrawlJob`, `StagingPaper`, `Tag`, etc.).
- Multi-source crawlers & crawl jobs:
  - Wrappers for arXiv, Scholar SerpAPI, Scopus, etc.
  - Batch crawl tasks and a crawl job list page.
- Literature library:
  - Two-stage ingestion: staging + main library with manual review.
  - Local search and paginated display.
- LLM reviews:
  - Single-pass structured review generation (with timeline/topics).
  - Entry point for PhD multi-stage pipeline (outline first).
- Vector search & RAG:
  - Embedding generation and storage for papers.
  - Vector search service, HTTP API, and WebSocket debug interface.
  - Frontend RAG visualization panel.

## 7. Next Development Directions (related to this README)

- Integrate chapter-level RAG into the review pipeline:
  - Retrieve candidate paper cards per chapter before generation;
  - Force the LLM to write only within that candidate set and embed citation numbers.
- Build an argument–evidence structure:
  - Save each argument and its supporting paper list in `Review.analysis_json`;
  - Allow the frontend to trace conclusions back to supporting papers.
- Citation validation tools:
  - Parse review references and verify they map to real papers;
  - Flag potential inconsistencies.

After these enhancements, the system will evolve from "automatic review writing" to an "evidence-traceable, auditable citation" assistant—better suited for PhD theses and high-quality literature reviews.

```
