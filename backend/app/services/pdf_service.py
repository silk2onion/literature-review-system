import re
import logging
from typing import List, Optional
from pypdf import PdfReader

logger = logging.getLogger(__name__)

class PdfService:
    """
    PDF 处理服务：
    1. 提取文本
    2. 识别 DOI
    3. 文本分块 (Chunking)
    """

    # 简单的 DOI 正则表达式，匹配常见的 DOI 格式
    # 10.xxxx/xxxxx
    # 增强版：支持匹配 doi.org/ 后的 DOI，允许中间有少量空格
    DOI_PATTERN = re.compile(r'\b(10\.\d{4,9}/[-._;()/:A-Z0-9]+)\b', re.IGNORECASE)
    
    # 针对 https://doi.org/ 10.xxxx 这种情况的宽松匹配
    DOI_URL_PATTERN = re.compile(r'doi\.org/\s*(10\.\d{4,9}/[-._;()/:A-Z0-9]+)', re.IGNORECASE)

    def extract_text(self, file_path: str) -> str:
        """
        从 PDF 文件中提取所有文本
        """
        text = ""
        try:
            reader = PdfReader(file_path)
            for page in reader.pages:
                page_text = page.extract_text()
                if page_text:
                    text += page_text + "\n"
            
            # 清理常见的 PDF 乱码/伪影
            # 例如 /gid00030/gid00035...
            text = re.sub(r'/gid\d+', '', text)
            
        except Exception as e:
            logger.error(f"Error extracting text from PDF {file_path}: {e}")
            raise e
        return text

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
