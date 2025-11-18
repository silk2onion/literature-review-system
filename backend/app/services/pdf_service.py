import os
import httpx
import aiofiles
from sqlalchemy.orm import Session
from app.models.paper import Paper
from app.config import settings
import logging

logger = logging.getLogger(__name__)

class PDFDownloadService:
    def __init__(self, db: Session):
        self.db = db
        self.base_path = "data/papers/pdfs"
        os.makedirs(self.base_path, exist_ok=True)

    async def download_paper_pdf(self, paper_id: int) -> dict:
        """
        下载指定 Paper 的 PDF
        """
        paper = self.db.query(Paper).filter(Paper.id == paper_id).first()
        if not paper:
            return {"success": False, "message": "Paper not found"}

        if not paper.pdf_url:
            return {"success": False, "message": "No PDF URL available for this paper"}

        # 构造保存路径: data/papers/pdfs/{year}/{paper_id}.pdf
        year_dir = os.path.join(self.base_path, str(paper.year) if paper.year else "unknown")
        os.makedirs(year_dir, exist_ok=True)
        
        filename = f"{paper_id}.pdf"
        file_path = os.path.join(year_dir, filename)

        # 如果文件已存在，直接返回成功（或者可以选择覆盖）
        if os.path.exists(file_path) and paper.pdf_path == file_path:
             return {"success": True, "message": "PDF already exists", "path": file_path}

        try:
            async with httpx.AsyncClient(follow_redirects=True, timeout=30.0) as client:
                response = await client.get(paper.pdf_url)
                response.raise_for_status()
                
                # 检查内容类型是否为 PDF
                content_type = response.headers.get("content-type", "").lower()
                if "application/pdf" not in content_type and not paper.pdf_url.endswith(".pdf"):
                     logger.warning(f"Content-Type is {content_type}, might not be a PDF. URL: {paper.pdf_url}")
                     # 仍然尝试保存，有些服务器配置不当

                async with aiofiles.open(file_path, 'wb') as f:
                    await f.write(response.content)

            # 更新数据库
            paper.pdf_path = file_path
            self.db.commit()
            self.db.refresh(paper)
            
            return {"success": True, "message": "Download successful", "path": file_path}

        except httpx.HTTPStatusError as e:
            logger.error(f"HTTP error downloading PDF for paper {paper_id}: {e}")
            return {"success": False, "message": f"HTTP error: {e.response.status_code}"}
        except Exception as e:
            logger.error(f"Error downloading PDF for paper {paper_id}: {e}")
            return {"success": False, "message": str(e)}
