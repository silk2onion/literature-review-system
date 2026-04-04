"""
统一文档组装器 — Single Source of Truth 出口

从 Review 的四个独立字段（title, abstract, content/body, conclusion, references_json）
动态组装完整 Markdown 文档。
"""
import re
from typing import Optional, Any


def compose_full_document(review) -> str:
    """
    从 review 的独立字段组装完整 Markdown 文档。

    组装顺序：
    1. # Title
    2. ## Abstract（如有）
    3. body（review.content 中的纯章节正文）
    4. ## Conclusion（如有）
    5. ## References（从 references_json 生成）

    参数:
        review: Review ORM 对象（需有 title, abstract, content, conclusion, references_json 属性）

    返回:
        完整 Markdown 字符串
    """
    parts: list[str] = []

    # 1. Title
    title = getattr(review, "title", "") or ""
    if title:
        parts.append(f"# {title}\n")

    # 2. Abstract
    abstract = getattr(review, "abstract", None)
    if abstract and abstract.strip():
        parts.append(f"## Abstract\n\n{abstract.strip()}\n")

    # 3. Body — 从 content 中提取纯正文（防御性清理）
    body = extract_body(getattr(review, "content", None))
    if body:
        parts.append(body)

    # 4. Conclusion
    conclusion = getattr(review, "conclusion", None)
    if conclusion and conclusion.strip():
        parts.append(f"\n## Conclusion\n\n{conclusion.strip()}\n")

    # 5. References
    refs_json = getattr(review, "references_json", None)
    refs_md = references_json_to_markdown(refs_json)
    if refs_md:
        parts.append(f"\n{refs_md}")

    return "\n".join(parts)


def extract_body(content: Optional[str]) -> str:
    """
    从 content 中提取纯 body 部分。
    移除可能残留的 # Title、## Abstract、## Conclusion、## References 段落。

    迁移完成后 content 应当已经由 composer 生成（含所有部分），
    此函数用于从完整文档中提取出 body 部分，
    也用于清理旧数据中残留的段落。
    """
    if not content:
        return ""

    text = content

    # 移除开头的 # Title 行（单个 # 开头的一级标题）
    text = re.sub(r'^#\s+[^\n]+\n*', '', text)

    # 移除 ## Abstract 段（到下一个 ## 或末尾）
    text = re.sub(
        r'##\s*Abstract\s*\n.*?(?=\n##\s|\Z)',
        '', text, flags=re.DOTALL | re.IGNORECASE
    )

    # 移除 ## Conclusion(s) 段
    text = re.sub(
        r'##\s*Conclusion[s]?\s*\n.*?(?=\n##\s|\Z)',
        '', text, flags=re.DOTALL | re.IGNORECASE
    )

    # 移除 ## References 段（通常在末尾，贪婪匹配到末尾）
    text = re.sub(
        r'##\s*References\s*\n.*\Z',
        '', text, flags=re.DOTALL | re.IGNORECASE
    )

    return text.strip()


def references_json_to_markdown(refs_json: Any) -> str:
    """
    从 references_json 生成 Markdown 格式的参考文献列表。

    refs_json 格式:
    {
        "style": "harvard",
        "items": [
            {"paper_id": 42, "order_index": 1, "citation_key": "(Smith, 2023)",
             "formatted": "Smith, J. (2023) ...", "raw": {...}}
        ]
    }
    """
    if not refs_json or not isinstance(refs_json, dict):
        return ""

    items = refs_json.get("items", [])
    if not items:
        return ""

    lines = ["## References\n"]
    for item in items:
        formatted = item.get("formatted", "")
        paper_id = item.get("paper_id")
        if formatted:
            if paper_id:
                lines.append(f'- <a id="ref-{paper_id}"></a>{formatted}')
            else:
                lines.append(f"- {formatted}")

    return "\n".join(lines)