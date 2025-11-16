"""
语义组管理服务
用于基于城市设计领域术语做简单的语义组激活和关键词扩展。
当前实现为纯字符串匹配 + 配置驱动，不依赖向量。
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parent.parent  # 指向 app/ 目录
DEFAULT_GROUPS_FILE = BASE_DIR / "semantic_groups.json"


# 一些城市设计领域的默认语义组配置，若 semantic_groups.json 不存在则回退到这里
DEFAULT_SEMANTIC_GROUPS = {
    "步行性与街道活力": {
        "words": [
            "步行性", "可步行性", "walkability",
            "街道活力", "street vitality",
            "行人友好", "pedestrian friendly",
            "步行指数", "walkability index"
        ],
        "auto_learned": [],
        "weight": 1.2,
    },
    "公共空间与开敞空间": {
        "words": [
            "公共空间", "public space",
            "开放空间", "open space",
            "城市广场", "urban plaza",
            "街道广场", "pocket plaza"
        ],
        "auto_learned": [],
        "weight": 1.0,
    },
    "TOD 与轨道导向开发": {
        "words": [
            "TOD", "transit-oriented development",
            "轨道导向开发", "公共交通导向开发",
            "交通枢纽", "站城一体"
        ],
        "auto_learned": [],
        "weight": 1.1,
    },
    "街景感知与视觉环境": {
        "words": [
            "街景", "street view",
            "街景图像", "streetscape imagery",
            "视觉感知", "visual perception",
            "视觉质量", "visual quality",
            "街道空间围合度", "enclosure"
        ],
        "auto_learned": [],
        "weight": 1.0,
    },
}


@dataclass
class ActivatedGroup:
    """被激活的语义组信息"""
    name: str
    strength: float
    matched_words: List[str]
    all_words: List[str]
    weight: float = 1.0


class SemanticGroupService:
    """
    轻量级语义组服务：
    - 从 semantic_groups.json 或内置 DEFAULT_SEMANTIC_GROUPS 加载组配置
    - 基于字符串包含关系检测激活组
    - 提供关键词扩展能力
    """
    _instance: Optional["SemanticGroupService"] = None

    def __init__(self, groups_file: Optional[Path] = None) -> None:
        self.groups_file = groups_file or DEFAULT_GROUPS_FILE
        self.config: Dict = {}
        self.groups: Dict[str, Dict] = {}
        self._load_groups()

    @classmethod
    def get_shared(cls) -> "SemanticGroupService":
        """获取进程内共享实例（简单单例）。"""
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def _load_groups(self) -> None:
        """从 JSON 文件加载语义组配置，若不存在则使用内置默认配置。"""
        if self.groups_file.exists():
            try:
                data = json.loads(self.groups_file.read_text(encoding="utf-8"))
                self.config = data.get("config", {}) or {}
                self.groups = data.get("groups", {}) or {}
                logger.info("已从 %s 加载 %d 个语义组", self.groups_file, len(self.groups))
                if not self.groups:
                    self.groups = DEFAULT_SEMANTIC_GROUPS.copy()
            except Exception as exc:
                logger.error("解析 %s 失败，将回退到内置默认语义组: %s", self.groups_file, exc)
                self.config = {}
                self.groups = DEFAULT_SEMANTIC_GROUPS.copy()
        else:
            logger.info("未找到 %s，将使用内置默认语义组配置", self.groups_file)
            self.config = {}
            self.groups = DEFAULT_SEMANTIC_GROUPS.copy()

    def reload(self) -> None:
        """显式重新加载配置文件。"""
        self._load_groups()

    def detect_and_activate_groups(self, text: str) -> Dict[str, ActivatedGroup]:
        """
        在给定文本中检测所有被激活的语义组。
        当前采用大小写不敏感的简单包含匹配。
        """
        if not text:
            return {}
        lower_text = text.lower()
        activated: Dict[str, ActivatedGroup] = {}
        for name, group in self.groups.items():
            words = group.get("words") or []
            auto_learned = group.get("auto_learned") or []
            all_words: List[str] = []
            seen = set()
            for w in list(words) + list(auto_learned):
                if not w:
                    continue
                lw = w.strip()
                if lw and lw not in seen:
                    seen.add(lw)
                    all_words.append(lw)
            if not all_words:
                continue
            matched: List[str] = []
            for w in all_words:
                if w.lower() in lower_text:
                    matched.append(w)
            if not matched:
                continue
            strength = len(matched) / float(len(all_words))
            weight = float(group.get("weight", 1.0) or 1.0)
            activated[name] = ActivatedGroup(
                name=name,
                strength=strength,
                matched_words=matched,
                all_words=all_words,
                weight=weight,
            )
        return activated

    def expand_keywords(self, keywords: List[str], text: Optional[str] = None) -> Dict[str, object]:
        """
        基于语义组对关键词进行扩展。
        - keywords: 原始关键词列表
        - text: 可选，用户自然语言描述，用于检测语义组
        返回: {"keywords": 扩展后的去重关键词列表, "activated_groups": {...}}
        """
        base_keywords = [k.strip() for k in (keywords or []) if k and k.strip()]
        joined_text = text or " ".join(base_keywords)
        activated = self.detect_and_activate_groups(joined_text)
        extra_terms: List[str] = []
        for ag in activated.values():
            extra_terms.extend(ag.all_words)
        # 去重，保持原始顺序优先
        seen = set()
        merged: List[str] = []
        for w in base_keywords + extra_terms:
            lw = w.lower()
            if lw in seen:
                continue
            seen.add(lw)
            merged.append(w)
        return {
            "keywords": merged,
            "activated_groups": activated,
        }


# 方便其它模块直接使用的快捷函数
def get_semantic_group_service() -> SemanticGroupService:
    """返回全局共享的 SemanticGroupService 实例。"""
    return SemanticGroupService.get_shared()