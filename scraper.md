# ResearchGate 爬虫技术说明

## 概述

本说明整理并解释了仓库中用于从 ResearchGate 抓取论文信息与下载 PDF 的爬虫相关代码，包含两条主要抓取路径：

- 基于 requests + BeautifulSoup 的同步 HTML 解析流程（用于可通过静态 HTML 获取信息的页面）。
- 基于 Playwright 的浏览器自动化流程（用于需要 JavaScript 交互或点击才能触发下载的情况）。

此外，项目通过 Celery 提供异步任务能力以支持批量搜索与下载。

## 主要文件与组件

- `researchgate_tool/scraper/main.py`
  - 命令行入口。支持 `--keyword`（搜索）与 `--url`（单条下载）两个模式。

- `researchgate_tool/scraper/service.py`
  - 同步抓取核心实现（requests + BeautifulSoup）：
    - `parse_search_results`：解析搜索结果页，返回 (title, url) 列表与下一页链接。
    - `search_researchgate`：翻页执行搜索并收集不重复结果。
    - `get_paper_details`：解析论文详情页，抽取 title、authors、abstract、doi、pdf 链接等。
    - `download_pdf`：流式下载 PDF 并保存本地元数据（JSON）。

- `researchgate_tool/scraper/__init__.py`
  - 包声明（空文件）。

- `src/downloader.py`
  - Playwright 异步下载实现 `download_paper(page, url, download_path, worker_id)`，用于通过浏览器点击触发下载的场景。

- `researchgate_tool/tasks.py`
  - Celery 任务定义：
    - `scrape_keyword_task(job_id, keyword, max_pages)`：执行批量搜索并把结果写入数据库（SearchJob、Paper）。
    - `download_paper_task(paper_id)`：获取单条记录的详情并下载 PDF、写回数据库状态。

- `researchgate_tool/config.py`
  - 全局配置（网站基址、默认 HTTP 头、选择器、超时、延迟、默认目录、Celery 与数据库相关配置等）。

- 其它相关模块（项目根中）：
  - `researchgate_tool/models.py`：Paper 数据模型（`Paper`）。
  - `researchgate_tool/utils.py`：实用函数（`ensure_directory`、`sanitize_filename` 等）。
  - `researchgate_tool/database.py`：数据库 ORM 层（`PaperDB`、`SearchJobDB`）。

## 执行流程（数据 / 控制流）

1. 关键词搜索（同步 CLI）
   - `main.py` 调用 `search_researchgate(keyword)`。
   - `search_researchgate` 通过 `_fetch` 获取 HTML，使用 `parse_search_results` 提取每页结果与 `next_url`，直到达到 `max_pages` 或没有下一页。

2. 单条详情抓取与下载（同步 CLI 或 Celery 任务）
   - `get_paper_details(paper_url)` 解析详情页并构建 `Paper` 对象。
   - `download_pdf(paper, download_dir)` 检查 `paper.pdf_download_url`，通过 `requests` 的流式响应分块写入 PDF 文件；随后调用 `save_metadata` 生成与 PDF 同名的 JSON 元数据文件。

3. Playwright 下载（适用于需要 JS 触发的情形）
   - `src/downloader.py` 中的 `download_paper` 打开页面、查找候选“下载”按钮（多个 XPath/CSS 候选），使用 `page.expect_download()` 捕获并保存文件。

4. Celery 异步任务
   - `scrape_keyword_task`：更新 `SearchJobDB` 状态 -> 运行 `search_researchgate` -> 将结果写入 `Paper  DB`。
   - `download_paper_task`：更新 `PaperDB` 的下载状态 -> 运行 `get_paper_details` + `download_pdf` -> 将文件路径与元数据路径写回数据库。

## 关键函数与行为（概览）

- `parse_search_results(html_content: str) -> Tuple[List[Tuple[str, str]], Optional[str]]`
  - 输入：搜索结果页 HTML，使用 `config.SELECTORS` 的选择器进行解析。
  - 输出：`[(title, absolute_url), ...]` 与 `next_page_url`（若存在）。

- `search_researchgate(keyword: str, *, max_pages: Optional[int] = None, session: Optional[requests.Session] = None) -> List[Tuple[str, str]]`
  - 逐页收集搜索结果，默认最大页数为 `config.MAX_PAGES`。

- `get_paper_details(paper_url: str, *, session: Optional[requests.Session] = None) -> Paper`
  - 解析详情页，填充 `Paper` 对象的字段（title、authors、abstract、doi、pdf_download_url、publication_date、journal、keywords）。

- `download_pdf(paper: Paper, download_dir: Path, *, metadata_dir: Optional[Path] = None, session: Optional[requests.Session] = None) -> Tuple[Path, Path]`
  - 从 `paper.pdf_download_url` 下载 PDF（stream），保存到 `download_dir`，并生成元数据 JSON 文件，返回 `(pdf_path, metadata_path)`。

- `download_paper(page: Page, url: str, download_path: str, worker_id: int) -> str`（Playwright）
  - 在浏览器中打开页面，尝试一组候选选择器找到“下载/Read full-text”按钮，发起点击并等待下载完成，保存为经过清理的文件名并返回最终路径。

- Celery 任务 `scrape_keyword_task` / `download_paper_task`：负责将爬虫流程与数据库持久化、状态管理连接起来。

## 配置说明（摘自 `researchgate_tool/config.py`）

- `BASE_URL`: ResearchGate 基础 URL（默认 `https://www.researchgate.net`）。
- `SEARCH_ENDPOINT`: 搜索路径（`/search/publication`）。
- `HEADERS`: requests 默认请求头（含 User-Agent、Accept 等）。
- `SELECTORS`: 搜索结果页的 CSS 选择器（`results_container`, `result_item`, `result_title`, `pagination_next`）。
- `DETAIL_SELECTORS`: 详细页选择器（`title`, `authors`, `abstract`, `doi`, `journal`, `publication_date`, `keywords`, `pdf_link`）。
- `REQUEST_DELAY_RANGE`: 请求间隔抖动范围（tuple），用于减缓抓取速度。
- `REQUEST_TIMEOUT`: requests 超时（秒）。
- `MAX_PAGES`: 默认单次搜索最大翻页数（3）。
- `DEFAULT_DOWNLOAD_DIR` / `DEFAULT_METADATA_DIR`: 本地文件保存目录。
- `DATABASE_URL`, `CELERY_BROKER_URL`, `CELERY_RESULT_BACKEND` 等：数据库与 Celery 相关配置。

> 说明：选择器为 CSS 选择器，Playwright 端的 `src/downloader.py` 使用 XPath/CSS locator。若页面结构变化，需更新这些选择器。

## 如何运行（示例）

1. 安装依赖（基础）

```bash
python -m pip install -r researchgate_tool/requirements.txt
# 若使用 Playwright
python -m pip install playwright
python -m playwright install
```

2. 使用命令行搜索（仅列出结果）

```bash
PYTHONPATH=. python -m rg_downloader.researchgate_tool.scraper.main --keyword "deep learning" --max-pages 2
```

3. 下载单篇（同步）

```bash
PYTHONPATH=. python -m rg_downloader.researchgate_tool.scraper.main --url "https://www.researchgate.net/publication/XXXX" --download-dir downloads
```

4. 启动 Celery worker（异步任务）

```bash
export CELERY_BROKER_URL="redis://localhost:6379/0"
export CELERY_RESULT_BACKEND="redis://localhost:6379/1"
PYTHONPATH=. celery -A researchgate_tool.tasks.celery_app worker --loglevel=info
```

5. Playwright 下载示例（伪代码，需在 async 环境中运行）

```python
from playwright.async_api import async_playwright
from src.downloader import download_paper

async with async_playwright() as p:
    browser = await p.chromium.launch(headless=True)
    page = await browser.new_page(accept_downloads=True)
    final_path = await download_paper(page, url, "/absolute/path/downloads", worker_id=1)
```

## 错误处理与边界情况

- 当前实现存在基础的错误处理：HTTP 响应非 2xx 会 raise，Celery 任务中会捕获异常并将状态写回数据库，Playwright 实现捕获超时和一般异常并在 finally 中关闭 `page`。
- 建议增强的防护（尚未实现）：
  - 请求重试（exponential backoff）与连接池策略。
  - 下载时使用临时文件（如 `.part`）写入并在完成后原子重命名，避免不完整文件。
  - 当 `pdf_download_url` 为空时，自动回退到 Playwright 路径以尝试通过 JS 触发下载。
  - 更完善的日志记录（包括 URL 与 HTTP 状态），以便排查失败原因。

## 合规与伦理提醒

自动抓取网站内容可能受目标网站的服务条款或版权保护的限制，请在大量抓取或商业使用前确认 ResearchGate 的使用条款，或通过官方渠道获取许可。

## 改进建议（优先级）

1. 高优先级
   - 为 requests 加入重试机制（使用 urllib3 Retry 或 requests.adapters.HTTPAdapter）。
   - 下载写入使用临时文件 + 原子重命名。
   - 在关键位置增加更丰富的日志（包含 URL、异常上下文）。

2. 中优先级
   - 为解析选择器添加备用配置或 profile。
   - 为主要解析函数添加单元测试（静态 HTML fixture）。
   - 增加 `--use-playwright` 或自动回退到 Playwright 的逻辑。

3. 低优先级
   - 支持登录/Cookie 管理以应对需要认证的下载场景。
   - 并发控制/速率限制组件化（可与 Celery/Asyncio 集成）。

## 附录：我已检视的源码文件

- `researchgate_tool/scraper/main.py`
- `researchgate_tool/scraper/service.py`
- `researchgate_tool/scraper/__init__.py`
- `src/downloader.py`
- `researchgate_tool/tasks.py`
- `researchgate_tool/config.py`
- `researchgate_tool/requirements.txt`


---

若你希望我把这份文档以不同格式（例如 Markdown 转 rst、或直接写入项目 README 的一节），或同时实现文中提到的某个改进（例如添加请求重试与临时文件写入），告诉我你希望我接下来做什么。