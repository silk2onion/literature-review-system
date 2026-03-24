import re
import logging
from dataclasses import dataclass, field
from typing import List, Optional
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
    PDF 下载服务 (占位/简单实现)
    """
    def __init__(self, db):
        self.db = db

    async def download_paper_pdf(self, paper_id: int):
        # 这里应该实现实际的下载逻辑
        # 目前仅作为占位符，防止 ImportError
        logger.info(f"Mock downloading PDF for paper {paper_id}")
        pass

_pdf_service = None

def get_pdf_service() -> PdfService:
    global _pdf_service
    if _pdf_service is None:
        _pdf_service = PdfService()
    return _pdf_service
