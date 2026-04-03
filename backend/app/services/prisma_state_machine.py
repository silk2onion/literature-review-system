"""
PRISMA-ScR 筛选流程状态机。

定义四阶段合法转换规则、排除原因模板，供 API 层和 Service 层共同调用。
"""

from typing import List, Optional, Tuple

# ── 阶段定义 ────────────────────────────────────────────────

PRISMA_STAGES: List[str] = [
    "identification",
    "screening",
    "eligibility",
    "included",
]

STAGE_ORDER = {stage: i for i, stage in enumerate(PRISMA_STAGES)}

# ── 合法转换 ────────────────────────────────────────────────

# 前进：只能走相邻的下一阶段
VALID_FORWARD = {
    "identification": "screening",
    "screening": "eligibility",
    "eligibility": "included",
}

# 回退：允许退回上一阶段（用于纠错）
VALID_BACKWARD = {
    "screening": "identification",
    "eligibility": "screening",
    "included": "eligibility",
}


def validate_transition(current_stage: str, target_stage: str) -> Tuple[bool, str]:
    """
    校验 PRISMA 阶段转换是否合法。

    Returns:
        (is_valid, error_message)  error_message 为空字符串时表示合法
    """
    if current_stage == target_stage:
        return True, ""
    if VALID_FORWARD.get(current_stage) == target_stage:
        return True, ""
    if VALID_BACKWARD.get(current_stage) == target_stage:
        return True, ""
    return (
        False,
        f"非法的 PRISMA 阶段转换：{current_stage} → {target_stage}。"
        f"只允许相邻阶段之间的转换（前进或回退一步）。",
    )


def get_next_stage(current_stage: str) -> Optional[str]:
    """返回当前阶段的下一阶段，若已是最后阶段则返回 None。"""
    return VALID_FORWARD.get(current_stage)


# ── 排除原因模板 ────────────────────────────────────────────

EXCLUSION_REASON_TEMPLATES: List[str] = [
    "Not relevant to research question / 与研究问题无关",
    "Duplicate / 重复文献",
    "Wrong study type / 研究类型不符",
    "Wrong population or setting / 研究对象或场景不符",
    "Full text not available / 无法获取全文",
    "Not in target language / 语言不符",
    "Published outside date range / 发表年份超出范围",
    "Insufficient methodological quality / 方法学质量不足",
    "Conference abstract only / 仅会议摘要",
]
