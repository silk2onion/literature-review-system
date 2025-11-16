"""
期刊信息增强服务（占位实现）
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import List, Optional

from sqlalchemy.orm import Session

from app.models.paper import Paper

logger = logging.getLogger(__name__)


@dataclass
class JournalInfo:
    """
    期刊元信息数据结构
    
    - name: 期刊名称
    - issn: 期刊 ISSN
    - impact_factor: 影响因子（来自外部期刊数据库）
    - quartile: 分区信息（如 JCR Q1-Q4 等）
    - indexing: 收录平台列表（如 SCI、SSCI、Scopus、CSSCI 等）
    """

    name: Optional[str]
    issn: Optional[str]
    impact_factor: Optional[float]
    quartile: Optional[str]
    indexing: Optional[List[str]]


class JournalInfoService:
    """
    期刊信息增强服务（占位实现）。

    设计目标：
    - 对接外部 Journal / Index 数据库，获取期刊影响因子、分区、收录平台等信息；
    - 为 Paper / StagingPaper 的 journal_* 与 indexing 字段提供统一的填充接口。

    当前实现仅作为占位：
    - 不做任何真实网络请求；
    - 所有 lookup / enrich 方法只记录日志并返回 None 或原对象。
    """

    def lookup_by_issn(self, issn: str) -> Optional[JournalInfo]:
        """
        根据 ISSN 查询期刊信息（占位实现）。

        未来可以在这里调用 Web of Science / Journal Citation Reports /
        Scopus Source List 等外部数据源。
        """
        logger.info("[JournalInfoService] lookup_by_issn placeholder: issn=%s", issn)
        return None

    def lookup_by_name(self, name: str) -> Optional[JournalInfo]:
        """
        根据期刊名称查询期刊信息（占位实现）。
        """
        logger.info("[JournalInfoService] lookup_by_name placeholder: name=%s", name)
        return None

    def enrich_paper(self, db: Session, paper: Paper) -> Paper:
        """
        为给定 Paper 预留的“期刊信息增强”接口。

        当前实现：
        - 仅记录日志，不修改数据库中的任何字段；
        - 直接返回传入的 paper 对象。

        后续实现建议：
        - 优先使用 Paper.journal_issn 查询期刊信息；
        - 若无 ISSN，则退化到 Paper.journal 名称匹配；
        - 将查询结果写回 Paper.journal_issn / journal_impact_factor /
          journal_quartile / indexing 字段。
        """
        logger.info(
            "[JournalInfoService] enrich_paper placeholder: paper_id=%s",
            getattr(paper, "id", None),
        )
        return paper


_journal_info_service: Optional[JournalInfoService] = None


def get_journal_info_service() -> JournalInfoService:
    """返回进程内共享的 JournalInfoService 实例"""
    global _journal_info_service
    if _journal_info_service is None:
        _journal_info_service = JournalInfoService()
    return _journal_info_service