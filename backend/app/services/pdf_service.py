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
    DOI_PATTERN = re.compile(r'\b(10\.\d{4,9}/[-._;()/:A-Z0-9]+)\b', re.IGNORECASE)

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
        except Exception as e:
            logger.error(f"Error extracting text from PDF {file_path}: {e}")
            raise e
        return text

    def find_doi(self, text: str) -> Optional[str]:
        """
        从文本中查找第一个匹配的 DOI
        """
        match = self.DOI_PATTERN.search(text)
        if match:
            return match.group(1)
        return None

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
