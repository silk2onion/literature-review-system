"""
文献全文切片模型
"""
from sqlalchemy import Column, Integer, String, Text, JSON, ForeignKey
from sqlalchemy.orm import relationship

from app.database import Base


class PaperChunk(Base):
    """文献全文切片模型"""
    __tablename__ = "paper_chunks"
    
    id = Column(Integer, primary_key=True, index=True)
    paper_id = Column(Integer, ForeignKey("papers.id", ondelete="CASCADE"), nullable=False, index=True)
    
    # 切片信息
    chunk_index = Column(Integer, nullable=False)  # 切片序号
    content = Column(Text, nullable=False)  # 切片文本内容
    page_number = Column(Integer)  # 页码（如果能提取到）
    
    # 向量嵌入
    embedding = Column(JSON)  # 文本嵌入向量
    
    # 关系
    paper = relationship("Paper", back_populates="chunks")
    
    def to_dict(self):
        return {
            "id": self.id,
            "paper_id": self.paper_id,
            "chunk_index": self.chunk_index,
            "content": self.content,
            "page_number": self.page_number,
            # embedding 通常不直接返回给前端，除非调试
        }
