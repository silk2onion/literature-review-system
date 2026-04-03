import os
import re
import logging
from dataclasses import dataclass, field
from typing import Dict, List, Optional
from pypdf import PdfReader

logger = logging.getLogger(__name__)


# ────────────────────────────────────────────────────────────
# Data classes for page-aware chunking
# ────────────────────────────────────────────────────────────

@dataclass
class PageText:
    """单页提取结果"""
    page_number: int   # 1-based
    text: str


@dataclass
class ChunkWithPage:
    """带页码追踪的文本分块"""
    content: str
    page_number: int          # 主要所在页 (覆盖字符数最多的页)
    page_numbers: List[int]   # 跨页 chunk 涉及的所有页码
    chunk_index: int          # 分块序号 (0-based)


class PdfService:
    """
    PDF 处理服务：
    1. 提取文本（普通 / 页感知）
    2. 识别 DOI
    3. 提取摘要
    4. 文本分块（普通 / 页感知）
    """

    # 简单的 DOI 正则表达式，匹配常见的 DOI 格式
    # 10.xxxx/xxxxx
    # 增强版：支持匹配 doi.org/ 后的 DOI，允许中间有少量空格
    DOI_PATTERN = re.compile(r'\b(10\.\d{4,9}/[-._;()/:A-Z0-9]+)\b', re.IGNORECASE)
    
    # 针对 https://doi.org/ 10.xxxx 这种情况的宽松匹配
    DOI_URL_PATTERN = re.compile(r'doi\.org/\s*(10\.\d{4,9}/[-._;()/:A-Z0-9]+)', re.IGNORECASE)

    def extract_text(self, file_path: str) -> str:
        """
        从 PDF 文件中提取所有文本（不保留页码边界）
        """
        text = ""
        try:
            reader = PdfReader(file_path)
            for page in reader.pages:
                page_text = page.extract_text()
                if page_text:
                    text += page_text + "\n"
            
            # 清理常见的 PDF 乱码/伪影
            text = re.sub(r'/gid\d+', '', text)
            
        except Exception as e:
            logger.error(f"Error extracting text from PDF {file_path}: {e}")
            raise e
        return text

    def extract_text_by_pages(self, file_path: str) -> List[PageText]:
        """
        逐页提取 PDF 文本，保留页码边界。
        
        Returns:
            List[PageText]: 每个元素包含 page_number (1-based) 和该页文本。
        """
        pages: List[PageText] = []
        try:
            reader = PdfReader(file_path)
            for i, page in enumerate(reader.pages):
                page_text = page.extract_text() or ""
                # 清理 PDF 伪影
                page_text = re.sub(r'/gid\d+', '', page_text)
                pages.append(PageText(page_number=i + 1, text=page_text))
        except Exception as e:
            logger.error(f"Error extracting pages from PDF {file_path}: {e}")
            raise e
        return pages

    def chunk_text_with_pages(
        self,
        pages: List[PageText],
        chunk_size: int = 1000,
        overlap: int = 200,
    ) -> List[ChunkWithPage]:
        """
        页感知文本分块：在字符分块的同时追踪每个 chunk 对应的页码。
        
        算法:
        1. 将所有页文本拼接，同时构建 char_offset → page_number 映射表
        2. 按 chunk_size / overlap 滑窗分块
        3. 根据 chunk 的字符区间反查涉及的页码
        4. 取覆盖字符数最多的页作为 page_number
        
        Args:
            pages: extract_text_by_pages() 的输出
            chunk_size: 每个 chunk 的目标字符数
            overlap: 相邻 chunk 的重叠字符数
            
        Returns:
            List[ChunkWithPage]: 每个 chunk 带有 content、page_number、page_numbers、chunk_index
        """
        if not pages:
            return []
        
        # Step 1: 拼接全文，同时记录每个字符的页归属
        # 使用 (page_start_offset, page_number) 列表，比逐字符映射更省内存
        full_text_parts: List[str] = []
        page_boundaries: List[tuple] = []  # [(start_offset, end_offset, page_number), ...]
        current_offset = 0
        
        for pt in pages:
            text = pt.text
            if not text:
                continue
            start = current_offset
            full_text_parts.append(text)
            current_offset += len(text)
            page_boundaries.append((start, current_offset, pt.page_number))
        
        full_text = "".join(full_text_parts)
        text_len = len(full_text)
        
        if text_len == 0:
            return []
        
        # Step 2: 滑窗分块
        chunks: List[ChunkWithPage] = []
        chunk_idx = 0
        start = 0
        step = max(chunk_size - overlap, 1)
        
        while start < text_len:
            end = min(start + chunk_size, text_len)
            content = full_text[start:end]
            
            # 尝试在句号/换行处断句（优化可读性），但不超过 chunk_size * 1.1
            if end < text_len:
                # 从 end 往回找最近的句子边界
                best_break = -1
                for delim in ['\n\n', '.\n', '. ', '。', '\n']:
                    pos = content.rfind(delim, max(0, len(content) - 200))
                    if pos > len(content) * 0.5:  # 至少要保留 50% 内容
                        best_break = pos + len(delim)
                        break
                if best_break > 0:
                    content = content[:best_break]
                    end = start + best_break
            
            # Step 3: 反查该 chunk 涉及的页码
            chunk_pages = self._find_pages_for_range(start, end, page_boundaries)
            
            # Step 4: 取覆盖字符数最多的页作为主页码
            primary_page = self._find_primary_page(start, end, page_boundaries)
            
            chunks.append(ChunkWithPage(
                content=content.strip(),
                page_number=primary_page,
                page_numbers=chunk_pages,
                chunk_index=chunk_idx,
            ))
            
            chunk_idx += 1
            
            if end >= text_len:
                break
            start += step
        
        # 过滤掉空内容的 chunk
        chunks = [c for c in chunks if c.content]
        
        return chunks
    
    @staticmethod
    def _find_pages_for_range(
        start: int, end: int, boundaries: List[tuple]
    ) -> List[int]:
        """找出 [start, end) 字符区间涉及的所有页码"""
        pages = []
        for b_start, b_end, page_num in boundaries:
            # 检查是否有重叠
            if b_start < end and b_end > start:
                pages.append(page_num)
        return sorted(set(pages)) if pages else [1]
    
    @staticmethod
    def _find_primary_page(
        start: int, end: int, boundaries: List[tuple]
    ) -> int:
        """找出 [start, end) 区间中覆盖字符数最多的页"""
        max_overlap = 0
        primary = 1
        for b_start, b_end, page_num in boundaries:
            overlap_start = max(start, b_start)
            overlap_end = min(end, b_end)
            overlap = max(0, overlap_end - overlap_start)
            if overlap > max_overlap:
                max_overlap = overlap
                primary = page_num
        return primary

    def find_doi(self, text: str) -> Optional[str]:
        """
        从文本中查找第一个匹配的 DOI
        """
        # 1. 尝试匹配 doi.org/ 后的 DOI (处理空格)
        match_url = self.DOI_URL_PATTERN.search(text)
        if match_url:
            return match_url.group(1)

        # 2. 尝试直接匹配 DOI 格式
        match = self.DOI_PATTERN.search(text)
        if match:
            return match.group(1)

        return None

    def extract_abstract(self, text: str) -> Optional[str]:
        """
        尝试从 PDF 文本中提取摘要
        """
        if not text:
            return None
            
        # 统一使用 IGNORECASE，简化 pattern
        # 匹配 Abstract/Summary 标题，允许后面跟冒号、点或换行
        start_patterns = [
            r'(?:\n|^)Abstract\s*[:.\n]',
            r'(?:\n|^)Summary\s*[:.\n]',
            r'(?:\n|^)Background\s*[:.\n]', # 医学类常见
        ]
        
        # 常见摘要结束标记 (下一节标题)
        end_patterns = [
            r'(?:\n|^)Introduction\s*[:.\n]',
            r'(?:\n|^)1\.?\s*Introduction',
            r'(?:\n|^)Keywords\s*[:.\n]',
            r'(?:\n|^)Index Terms\s*[:.\n]',
        ]
        
        start_idx = -1
        for p in start_patterns:
            match = re.search(p, text, re.IGNORECASE)
            if match:
                start_idx = match.end()
                break
                
        if start_idx == -1:
            return None
            
        # 从 start_idx 开始找结束标记
        remaining_text = text[start_idx:]
        end_idx = -1
        
        for p in end_patterns:
            match = re.search(p, remaining_text, re.IGNORECASE)
            if match:
                end_idx = match.start()
                break
                
        if end_idx != -1:
            abstract = remaining_text[:end_idx].strip()
        else:
            # 如果找不到结束标记，但找到了 Abstract 头，
            # 可能是摘要很短或者格式特殊，取前 3000 字符防止过长
            abstract = remaining_text[:3000].strip()
            
        # 简单清理：合并多余空白
        abstract = re.sub(r'\s+', ' ', abstract)
        return abstract

    def chunk_text(self, text: str, chunk_size: int = 1000, overlap: int = 200) -> List[str]:
        """
        简单的文本分块策略：
        按字符数切分，带重叠。
        后续可以优化为按段落或句子切分。
        """
        if not text:
            return []
            
        chunks = []
        start = 0
        text_len = len(text)

        while start < text_len:
            end = start + chunk_size
            chunk = text[start:end]
            chunks.append(chunk)
            
            # 如果已经到了末尾，退出
            if end >= text_len:
                break
                
            # 移动步长 = chunk_size - overlap
            start += (chunk_size - overlap)
            
        return chunks

class PDFDownloadService:
    """
    PDF 下载服务

    支持三种下载策略（按优先级）：
    1. 直接下载：OA / arXiv 等有直接 pdf_url 的论文
    2. 机构认证下载：通过 EZProxy/Shibboleth session + 出版商 handler 提取 PDF
    3. Selenium 直接下载：对 JS 重度依赖的出版商页面
    """

    def __init__(self, db):
        self.db = db

    async def download_paper_pdf(self, paper_id: int) -> Optional[str]:
        """
        下载单篇论文 PDF

        Args:
            paper_id: Paper 表 ID

        Returns:
            本地 PDF 文件路径，失败返回 None
        """
        from app.models.paper import Paper

        paper = self.db.query(Paper).filter(Paper.id == paper_id).first()
        if not paper:
            logger.error("[PDFDownload] Paper %d 不存在", paper_id)
            return None

        # 已有本地 PDF
        if paper.pdf_path and os.path.exists(paper.pdf_path):
            logger.info("[PDFDownload] Paper %d 已有本地 PDF: %s", paper_id, paper.pdf_path)
            return paper.pdf_path

        # 生成保存路径
        save_path = self._make_save_path(paper)

        # 策略 1: 直接下载（OA / arXiv / 已有 pdf_url）
        if paper.pdf_url:
            result = self._download_direct(paper.pdf_url, save_path)
            if result:
                paper.pdf_path = result
                self.db.commit()
                logger.info("[PDFDownload] Paper %d 直接下载成功", paper_id)
                return result

        # 策略 2: Unpaywall — 免费获取 OA 版本的 PDF
        if paper.doi:
            result = self._download_via_unpaywall(paper.doi, save_path)
            if result:
                paper.pdf_path = result
                self.db.commit()
                logger.info("[PDFDownload] Paper %d Unpaywall OA 下载成功", paper_id)
                return result

        # 策略 3: Selenium + 机构认证（完整 Shibboleth SSO 流程）
        article_url = paper.url
        if not article_url and paper.doi:
            article_url = f"https://doi.org/{paper.doi}"
        if article_url:
            result = self._download_via_selenium(article_url, save_path)
            if result:
                paper.pdf_path = result
                if not paper.pdf_url:
                    paper.pdf_url = f"institutional://{paper.doi or ''}"
                self.db.commit()
                logger.info("[PDFDownload] Paper %d 机构 Selenium 下载成功", paper_id)
                return result

        logger.warning("[PDFDownload] Paper %d 所有下载策略均失败", paper_id)
        return None

    async def batch_download(
        self,
        paper_ids: List[int],
        progress_callback=None,
    ) -> dict:
        """
        批量下载 PDF

        Args:
            paper_ids: Paper ID 列表
            progress_callback: 可选的进度回调 fn(current, total, paper_id, status)

        Returns:
            {"success": [...], "failed": [...], "skipped": [...]}
        """
        results = {"success": [], "failed": [], "skipped": []}
        total = len(paper_ids)

        for i, pid in enumerate(paper_ids):
            try:
                from app.models.paper import Paper
                paper = self.db.query(Paper).filter(Paper.id == pid).first()

                # 跳过已有 PDF 的
                if paper and paper.pdf_path and os.path.exists(paper.pdf_path):
                    results["skipped"].append(pid)
                    if progress_callback:
                        progress_callback(i + 1, total, pid, "skipped")
                    continue

                path = await self.download_paper_pdf(pid)
                if path:
                    results["success"].append(pid)
                    status = "success"
                else:
                    results["failed"].append(pid)
                    status = "failed"

                if progress_callback:
                    progress_callback(i + 1, total, pid, status)

            except Exception as e:
                logger.error("[PDFDownload] 批量下载 paper %d 异常: %s", pid, e)
                results["failed"].append(pid)
                if progress_callback:
                    progress_callback(i + 1, total, pid, "error")

        logger.info(
            "[PDFDownload] 批量下载完成: %d 成功, %d 失败, %d 跳过",
            len(results["success"]),
            len(results["failed"]),
            len(results["skipped"]),
        )
        return results

    # ── 下载策略实现 ──────────────────────────────────────────

    def _download_direct(self, url: str, save_path: str) -> Optional[str]:
        """直接 HTTP 下载（适用于 OA / arXiv 等）"""
        import httpx

        try:
            headers = {
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
                ),
            }

            with httpx.Client(timeout=60, follow_redirects=True, headers=headers) as client:
                resp = client.get(url)

                content_type = resp.headers.get("content-type", "").lower()

                # 检查是否真的是 PDF
                if resp.status_code == 200 and (
                    "pdf" in content_type
                    or resp.content[:5] == b"%PDF-"
                ):
                    os.makedirs(os.path.dirname(save_path), exist_ok=True)
                    with open(save_path, "wb") as f:
                        f.write(resp.content)
                    logger.info("[PDFDownload] 直接下载成功: %s -> %s", url[:80], save_path)
                    return save_path

                logger.debug(
                    "[PDFDownload] 直接下载非 PDF 响应: status=%d content-type=%s url=%s",
                    resp.status_code, content_type, url[:80],
                )
                return None

        except Exception as e:
            logger.debug("[PDFDownload] 直接下载失败 %s: %s", url[:80], e)
            return None

    def _download_via_unpaywall(self, doi: str, save_path: str) -> Optional[str]:
        """通过 Unpaywall API 获取 OA 版本的 PDF（免费，无需认证）"""
        import httpx

        try:
            from app.config import settings as app_settings
            email = getattr(app_settings, "OPENALEX_EMAIL", "") or "user@example.com"

            api_url = f"https://api.unpaywall.org/v2/{doi}?email={email}"
            with httpx.Client(timeout=15, follow_redirects=True) as client:
                resp = client.get(api_url)

                if resp.status_code != 200:
                    return None

                data = resp.json()
                if not data.get("is_oa"):
                    return None

                best = data.get("best_oa_location") or {}
                pdf_url = best.get("url_for_pdf")

                if not pdf_url:
                    # 某些 OA 论文只有 landing page，没有直接 PDF URL
                    return None

                logger.info("[PDFDownload] Unpaywall 找到 OA PDF: %s", pdf_url[:100])
                return self._download_direct(pdf_url, save_path)

        except Exception as e:
            logger.debug("[PDFDownload] Unpaywall 查询失败 %s: %s", doi, e)
            return None

    def _download_with_institutional_access(
        self,
        doi: Optional[str],
        url: Optional[str],
        save_path: str,
    ) -> Optional[str]:
        """通过机构认证下载 PDF（保留但当前未直接使用，Selenium 方式更可靠）"""
        from app.config import settings
        from app.services.institutional_auth import get_institutional_auth_service
        from app.services.publisher_handlers import PublisherHandlerRegistry

        if not getattr(settings, "INSTITUTIONAL_ENABLED", False):
            return None

        auth_service = get_institutional_auth_service()

        # 确保已认证
        if not auth_service.is_authenticated:
            login_success = auth_service.login(
                login_url=settings.INSTITUTIONAL_LOGIN_URL,
                username=settings.INSTITUTIONAL_USERNAME,
                password=settings.INSTITUTIONAL_PASSWORD,
                auth_type=settings.INSTITUTIONAL_AUTH_TYPE,
                headless=settings.SELENIUM_HEADLESS,
            )
            if not login_success:
                logger.warning("[PDFDownload] 机构登录失败，跳过认证下载")
                return None

        session = auth_service.get_authenticated_session()
        if not session:
            return None

        # 确定目标 URL
        target_url = url
        if doi and not target_url:
            target_url = f"https://doi.org/{doi}"

        if not target_url:
            return None

        # 通过 EZProxy 代理
        ezproxy_prefix = getattr(settings, "INSTITUTIONAL_EZPROXY_PREFIX", "")
        if ezproxy_prefix:
            target_url = auth_service.get_proxied_url(target_url, ezproxy_prefix)

        try:
            # 访问文章页面
            resp = session.get(target_url, timeout=30, allow_redirects=True)
            if resp.status_code != 200:
                logger.debug(
                    "[PDFDownload] 机构访问失败: status=%d url=%s",
                    resp.status_code, target_url[:80],
                )
                return None

            final_url = resp.url  # 可能经过重定向

            # 检查是否直接返回了 PDF
            content_type = resp.headers.get("content-type", "").lower()
            if "pdf" in content_type or resp.content[:5] == b"%PDF-":
                os.makedirs(os.path.dirname(save_path), exist_ok=True)
                with open(save_path, "wb") as f:
                    f.write(resp.content)
                return save_path

            # 使用出版商 handler 提取 PDF 链接
            registry = PublisherHandlerRegistry()
            handler = registry.get_handler(str(final_url))

            pdf_url = handler.extract_pdf_url(resp.text, str(final_url))
            if not pdf_url:
                logger.debug(
                    "[PDFDownload] %s handler 未找到 PDF 链接: %s",
                    handler.publisher_name, str(final_url)[:80],
                )
                return None

            # 如果 PDF URL 是相对路径或需要代理
            if ezproxy_prefix and not any(
                kw in pdf_url for kw in ["ezproxy", ezproxy_prefix.split("/")[2]]
            ):
                pdf_url = auth_service.get_proxied_url(pdf_url, ezproxy_prefix)

            # 下载 PDF
            pdf_resp = session.get(pdf_url, timeout=60, allow_redirects=True)
            if pdf_resp.status_code == 200 and (
                "pdf" in pdf_resp.headers.get("content-type", "").lower()
                or pdf_resp.content[:5] == b"%PDF-"
            ):
                os.makedirs(os.path.dirname(save_path), exist_ok=True)
                with open(save_path, "wb") as f:
                    f.write(pdf_resp.content)
                logger.info(
                    "[PDFDownload] 机构认证下载成功 (%s): %s",
                    handler.publisher_name, save_path,
                )
                return save_path

            logger.debug(
                "[PDFDownload] PDF 下载响应非 PDF: status=%d content-type=%s",
                pdf_resp.status_code,
                pdf_resp.headers.get("content-type", ""),
            )
            return None

        except Exception as e:
            logger.error("[PDFDownload] 机构认证下载异常: %s", e)
            return None

    def _download_via_selenium(self, article_url: str, save_path: str) -> Optional[str]:
        """策略 4: 使用 Selenium 浏览器直接下载 PDF（处理 JS 反爬）"""
        from app.config import settings
        from app.services.institutional_auth import get_institutional_auth_service

        if not getattr(settings, "INSTITUTIONAL_ENABLED", False):
            return None

        auth_service = get_institutional_auth_service()
        ezproxy_prefix = getattr(settings, "INSTITUTIONAL_EZPROXY_PREFIX", "")

        return auth_service.download_pdf_via_selenium(
            article_url=article_url,
            save_path=save_path,
            ezproxy_prefix=ezproxy_prefix,
            headless=getattr(settings, "SELENIUM_HEADLESS", True),
        )

    # ── 工具方法 ──────────────────────────────────────────────

    def _make_save_path(self, paper) -> str:
        """生成 PDF 保存路径"""
        from app.config import settings as app_settings

        pdf_dir = os.path.join(app_settings.PAPERS_PATH, "pdfs")
        os.makedirs(pdf_dir, exist_ok=True)

        # 使用 DOI 或 ID 生成文件名
        if paper.doi:
            safe_name = re.sub(r'[^\w\-.]', '_', paper.doi)
        else:
            safe_name = f"paper_{paper.id}"

        return os.path.join(pdf_dir, f"{safe_name}.pdf")


# ── 批量下载进度追踪 ────────────────────────────────────────

_batch_download_progress: dict = {}


def get_batch_download_progress() -> dict:
    """获取当前批量下载进度"""
    return dict(_batch_download_progress)


def update_batch_download_progress(current: int, total: int, paper_id: int, status: str):
    """更新批量下载进度"""
    _batch_download_progress["current"] = current
    _batch_download_progress["total"] = total
    _batch_download_progress["last_paper_id"] = paper_id
    _batch_download_progress["last_status"] = status
    _batch_download_progress["percent"] = round(current / total * 100, 1) if total > 0 else 0


def clear_batch_download_progress():
    """清除批量下载进度"""
    _batch_download_progress.clear()


_pdf_service = None

def get_pdf_service() -> PdfService:
    global _pdf_service
    if _pdf_service is None:
        _pdf_service = PdfService()
    return _pdf_service
