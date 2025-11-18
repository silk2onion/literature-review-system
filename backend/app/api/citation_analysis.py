"""
文献引用分析 API
"""
from typing import Dict

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.services.citation_analysis import get_citation_analysis_service

router = APIRouter(
    prefix="/api/citations/analysis",
    tags=["citation-analysis"],
)

@router.post("/analyze")
def analyze_citation_network(
    db: Session = Depends(get_db),
) -> Dict[str, int]:
    """
    触发全量引用网络分析。
    
    执行步骤：
    1. 生成世代标签 (Generation X)
    2. 生成影响力标签 (Impact: High/Seminal)
    3. 执行社区发现生成聚类标签 (Cluster X)
    
    返回生成的标签数量统计。
    """
    service = get_citation_analysis_service()
    return service.analyze_network(db)