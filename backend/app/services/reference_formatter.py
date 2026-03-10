"""
参考文献格式化服务 — 多格式支持
默认 Harvard，支持 APA 7th / IEEE / Chicago Author-Date / Vancouver
"""

from __future__ import annotations

import logging
from enum import Enum
from typing import Any, Dict, List, Optional, Union

from app.models.paper import Paper

logger = logging.getLogger(__name__)


# ------------------------------------------------------------------
# 支持的引用格式
# ------------------------------------------------------------------

class CitationStyle(str, Enum):
    HARVARD = "harvard"        # (Author, Year) — 默认
    APA = "apa"                # APA 7th — (Author, Year)
    IEEE = "ieee"              # [1], [2], ...
    CHICAGO = "chicago"        # (Author Year) — Chicago Author-Date
    VANCOUVER = "vancouver"    # (1), (2), ... — 编号制


# 每种格式的简要说明（前端展示用）
STYLE_DESCRIPTIONS = {
    CitationStyle.HARVARD: "Harvard — Author (Year) 哈佛格式（默认）",
    CitationStyle.APA: "APA 7th — (Author, Year) 美国心理学会",
    CitationStyle.IEEE: "IEEE — [1] 编号方括号格式",
    CitationStyle.CHICAGO: "Chicago Author-Date — (Author Year)",
    CitationStyle.VANCOUVER: "Vancouver — (1) 编号圆括号格式",
}


class ReferenceFormatterService:
    """参考文献格式化服务 — 多格式"""

    # ==================================================================
    # 作者字段解析（所有格式通用）
    # ==================================================================

    @staticmethod
    def _to_author_list(authors: Any) -> List[str]:
        """将各种 authors 字段统一为 List[str]"""
        if not authors:
            return []
        if isinstance(authors, list):
            return [str(a).strip() for a in authors if a]
        if isinstance(authors, str):
            return [a.strip() for a in authors.split(";") if a.strip()]
        return []

    @staticmethod
    def _extract_surname(author_str: str) -> str:
        author_str = author_str.strip()
        if not author_str:
            return "Unknown"
        if "," in author_str:
            return author_str.split(",")[0].strip()
        parts = author_str.split()
        return parts[-1].strip() if parts else author_str

    @staticmethod
    def _extract_first_author_surname(authors: Any) -> str:
        lst = ReferenceFormatterService._to_author_list(authors)
        if not lst:
            return "Unknown"
        return ReferenceFormatterService._extract_surname(lst[0])

    @staticmethod
    def _count_authors(authors: Any) -> int:
        return len(ReferenceFormatterService._to_author_list(authors))

    @staticmethod
    def _format_initials(first_names: str) -> str:
        """'Yu Min' → 'Y.M.'"""
        return "".join(f"{w[0]}." for w in first_names.split() if w)

    @staticmethod
    def _author_last_initials(author_str: str) -> str:
        """'Zhang, Yu Min' → 'Zhang, Y.M.'  /  'Yu Min Zhang' → 'Zhang, Y.M.'"""
        author_str = author_str.strip()
        if not author_str:
            return "Unknown"
        if "," in author_str:
            parts = author_str.split(",", 1)
            last = parts[0].strip()
            first = parts[1].strip() if len(parts) > 1 else ""
            initials = ReferenceFormatterService._format_initials(first) if first else ""
            return f"{last}, {initials}" if initials else last
        parts = author_str.split()
        if len(parts) >= 2:
            last = parts[-1]
            initials = ReferenceFormatterService._format_initials(" ".join(parts[:-1]))
            return f"{last}, {initials}"
        return author_str

    # ==================================================================
    # 提取 paper 字段（dict / ORM 兼容）
    # ==================================================================

    @staticmethod
    def _get(paper: Union[Paper, Dict[str, Any]], field: str, default: Any = None) -> Any:
        if isinstance(paper, dict):
            return paper.get(field, default)
        return getattr(paper, field, default)

    # ==================================================================
    # (Author, Year) 引用键 — Harvard / APA / Chicago 通用
    # ==================================================================

    def make_citation_key(
        self, paper: Union[Paper, Dict[str, Any]], style: CitationStyle = CitationStyle.HARVARD
    ) -> str:
        authors = self._get(paper, "authors")
        year = self._get(paper, "year")
        first = self._extract_first_author_surname(authors)
        count = self._count_authors(authors)
        year_str = str(year) if year else "n.d."

        if style == CitationStyle.CHICAGO:
            # Chicago: (Author Year) 无逗号
            if count <= 1:
                return f"({first} {year_str})"
            elif count == 2:
                lst = self._to_author_list(authors)
                second = self._extract_surname(lst[1])
                return f"({first} and {second} {year_str})"
            else:
                return f"({first} et al. {year_str})"

        # Harvard / APA: (Author, Year)
        if count <= 1:
            return f"({first}, {year_str})"
        elif count == 2:
            lst = self._to_author_list(authors)
            second = self._extract_surname(lst[1])
            sep = " and " if style == CitationStyle.HARVARD else " & "
            return f"({first}{sep}{second}, {year_str})"
        else:
            return f"({first} et al., {year_str})"

    # ==================================================================
    # 格式化单篇参考文献
    # ==================================================================

    # ---- Harvard ----
    def _format_one_harvard(self, paper: Union[Paper, Dict[str, Any]]) -> str:
        """Harvard: Author(s) (Year) 'Title', *Journal*, doi."""
        authors = self._get(paper, "authors")
        year = self._get(paper, "year")
        title = self._get(paper, "title", "Untitled") or "Untitled"
        journal = self._get(paper, "journal", "")
        doi = self._get(paper, "doi", "")

        author_str = self._join_authors_harvard(authors)
        year_str = f"({year})" if year else "(n.d.)"

        parts = [f"{author_str} {year_str} '{title.rstrip('.')}'"]
        if journal:
            parts[0] += f", *{journal}*"
        parts[0] += "."

        if doi:
            doi_url = doi if doi.startswith("http") else f"https://doi.org/{doi}"
            parts.append(f" Available at: {doi_url}.")
        return "".join(parts)

    def _join_authors_harvard(self, authors: Any) -> str:
        lst = self._to_author_list(authors)
        if not lst:
            return "Unknown"
        formatted = [self._author_last_initials(a) for a in lst]
        if len(formatted) == 1:
            return formatted[0]
        elif len(formatted) == 2:
            return f"{formatted[0]} and {formatted[1]}"
        elif len(formatted) <= 6:
            return ", ".join(formatted[:-1]) + f" and {formatted[-1]}"
        else:
            return ", ".join(formatted[:6]) + " et al."

    # ---- APA 7th ----
    def _format_one_apa(self, paper: Union[Paper, Dict[str, Any]]) -> str:
        """APA 7th: Author(s) (Year). Title. *Journal*. doi"""
        authors = self._get(paper, "authors")
        year = self._get(paper, "year")
        title = self._get(paper, "title", "Untitled") or "Untitled"
        journal = self._get(paper, "journal", "")
        doi = self._get(paper, "doi", "")

        author_str = self._join_authors_apa(authors)
        year_str = f"({year})" if year else "(n.d.)"

        parts = [f"{author_str} {year_str}. {title.rstrip('.')}."]
        if journal:
            parts.append(f" *{journal}*.")
        if doi:
            doi_url = doi if doi.startswith("http") else f"https://doi.org/{doi}"
            parts.append(f" {doi_url}")
        return "".join(parts)

    def _join_authors_apa(self, authors: Any) -> str:
        lst = self._to_author_list(authors)
        if not lst:
            return "Unknown"
        formatted = [self._author_last_initials(a) for a in lst]
        if len(formatted) == 1:
            return formatted[0]
        elif len(formatted) == 2:
            return f"{formatted[0]}, & {formatted[1]}"
        elif len(formatted) <= 20:
            return ", ".join(formatted[:-1]) + f", & {formatted[-1]}"
        else:
            return ", ".join(formatted[:19]) + f", ... {formatted[-1]}"

    # ---- IEEE ----
    def _format_one_ieee(self, paper: Union[Paper, Dict[str, Any]], index: int) -> str:
        """IEEE: [idx] F. Last, "Title," *Journal*, year."""
        authors = self._get(paper, "authors")
        year = self._get(paper, "year")
        title = self._get(paper, "title", "Untitled") or "Untitled"
        journal = self._get(paper, "journal", "")
        doi = self._get(paper, "doi", "")

        author_str = self._join_authors_ieee(authors)
        parts = [f"[{index}] {author_str}, \"{title.rstrip('.')}\""]

        if journal:
            parts[0] += f", *{journal}*"
        if year:
            parts[0] += f", {year}"
        parts[0] += "."

        if doi:
            doi_url = doi if doi.startswith("http") else f"https://doi.org/{doi}"
            parts.append(f" {doi_url}")
        return "".join(parts)

    def _join_authors_ieee(self, authors: Any) -> str:
        lst = self._to_author_list(authors)
        if not lst:
            return "Unknown"
        formatted = [self._author_initials_first(a) for a in lst[:6]]
        if len(lst) > 6:
            return ", ".join(formatted) + ", et al."
        elif len(formatted) >= 2:
            return ", ".join(formatted[:-1]) + ", and " + formatted[-1]
        return formatted[0]

    @staticmethod
    def _author_initials_first(author_str: str) -> str:
        """IEEE 风格: Y.M. Zhang"""
        author_str = author_str.strip()
        if not author_str:
            return "Unknown"
        if "," in author_str:
            parts = author_str.split(",", 1)
            last = parts[0].strip()
            first = parts[1].strip() if len(parts) > 1 else ""
            initials = ReferenceFormatterService._format_initials(first) if first else ""
            return f"{initials} {last}" if initials else last
        parts = author_str.split()
        if len(parts) >= 2:
            last = parts[-1]
            initials = ReferenceFormatterService._format_initials(" ".join(parts[:-1]))
            return f"{initials} {last}"
        return author_str

    # ---- Chicago Author-Date ----
    def _format_one_chicago(self, paper: Union[Paper, Dict[str, Any]]) -> str:
        """Chicago: Last, First. Year. "Title." *Journal*. doi."""
        authors = self._get(paper, "authors")
        year = self._get(paper, "year")
        title = self._get(paper, "title", "Untitled") or "Untitled"
        journal = self._get(paper, "journal", "")
        doi = self._get(paper, "doi", "")

        author_str = self._join_authors_chicago(authors)
        year_str = str(year) if year else "n.d."

        parts = [f"{author_str}. {year_str}. \"{title.rstrip('.')}.\""]
        if journal:
            parts[0] += f" *{journal}*."
        if doi:
            doi_url = doi if doi.startswith("http") else f"https://doi.org/{doi}"
            parts.append(f" {doi_url}.")
        return "".join(parts)

    def _join_authors_chicago(self, authors: Any) -> str:
        lst = self._to_author_list(authors)
        if not lst:
            return "Unknown"
        # Chicago: Last, First for first author; First Last for rest
        first_author = self._author_last_initials(lst[0])
        if len(lst) == 1:
            return first_author
        rest = [self._author_initials_first(a) for a in lst[1:]]
        if len(rest) == 1:
            return f"{first_author}, and {rest[0]}"
        if len(rest) <= 9:
            return f"{first_author}, " + ", ".join(rest[:-1]) + f", and {rest[-1]}"
        return f"{first_author}, et al."

    # ---- Vancouver ----
    def _format_one_vancouver(self, paper: Union[Paper, Dict[str, Any]], index: int) -> str:
        """Vancouver: idx. Author(s). Title. Journal. Year;doi."""
        authors = self._get(paper, "authors")
        year = self._get(paper, "year")
        title = self._get(paper, "title", "Untitled") or "Untitled"
        journal = self._get(paper, "journal", "")
        doi = self._get(paper, "doi", "")

        author_str = self._join_authors_vancouver(authors)

        parts = [f"{index}. {author_str}. {title.rstrip('.')}."]
        if journal:
            parts[0] += f" {journal}."
        if year:
            parts[0] += f" {year}."
        if doi:
            doi_url = doi if doi.startswith("http") else f"https://doi.org/{doi}"
            parts.append(f" {doi_url}")
        return "".join(parts)

    def _join_authors_vancouver(self, authors: Any) -> str:
        lst = self._to_author_list(authors)
        if not lst:
            return "Unknown"
        formatted = [self._author_last_initials(a).replace(",", "").replace(" ", "") 
                      if "," in a else self._author_last_initials(a)
                      for a in lst[:6]]
        # 简化: Last YM
        result = []
        for a in lst[:6]:
            surname = self._extract_surname(a)
            # 提取首字母
            lst2 = self._to_author_list(None)  # placeholder
            auth = a.strip()
            if "," in auth:
                ps = auth.split(",", 1)
                last = ps[0].strip()
                first = ps[1].strip() if len(ps) > 1 else ""
                initials = "".join(w[0] for w in first.split() if w) if first else ""
                result.append(f"{last} {initials}")
            else:
                ps = auth.split()
                if len(ps) >= 2:
                    last = ps[-1]
                    initials = "".join(w[0] for w in ps[:-1] if w)
                    result.append(f"{last} {initials}")
                else:
                    result.append(auth)

        if len(lst) > 6:
            return ", ".join(result) + ", et al"
        return ", ".join(result)

    # ==================================================================
    # 统一入口
    # ==================================================================

    def format_one(
        self,
        paper: Union[Paper, Dict[str, Any]],
        style: CitationStyle = CitationStyle.HARVARD,
        index: int = 1,
    ) -> str:
        """格式化单篇参考文献"""
        if style == CitationStyle.HARVARD:
            return self._format_one_harvard(paper)
        elif style == CitationStyle.APA:
            return self._format_one_apa(paper)
        elif style == CitationStyle.IEEE:
            return self._format_one_ieee(paper, index)
        elif style == CitationStyle.CHICAGO:
            return self._format_one_chicago(paper)
        elif style == CitationStyle.VANCOUVER:
            return self._format_one_vancouver(paper, index)
        else:
            return self._format_one_harvard(paper)

    def format_reference_list(
        self,
        papers: List[Union[Paper, Dict[str, Any]]],
        style: Union[str, CitationStyle] = CitationStyle.HARVARD,
    ) -> str:
        """生成参考文献列表 Markdown"""
        if not papers:
            return ""

        if isinstance(style, str):
            try:
                style = CitationStyle(style.lower())
            except ValueError:
                style = CitationStyle.HARVARD

        lines = ["## References\n"]
        for idx, paper in enumerate(papers, start=1):
            ref = self.format_one(paper, style=style, index=idx)
            lines.append(f"- {ref}")

        return "\n".join(lines)

    def make_inline_citation(
        self,
        paper: Union[Paper, Dict[str, Any]],
        style: CitationStyle = CitationStyle.HARVARD,
        index: int = 1,
    ) -> str:
        """生成正文内联引用标记"""
        if style in (CitationStyle.IEEE,):
            return f"[{index}]"
        elif style == CitationStyle.VANCOUVER:
            return f"({index})"
        else:
            return self.make_citation_key(paper, style=style)

    def build_citation_map(
        self,
        papers: List[Union[Paper, Dict[str, Any]]],
        style: CitationStyle = CitationStyle.HARVARD,
    ) -> Dict[str, Dict[str, Any]]:
        """构建 citation_key → paper info 的映射"""
        result: Dict[str, Dict[str, Any]] = {}
        for idx, paper in enumerate(papers, start=1):
            if style in (CitationStyle.IEEE,):
                key = f"[{idx}]"
            elif style == CitationStyle.VANCOUVER:
                key = f"({idx})"
            else:
                key = self.make_citation_key(paper, style=style)

            info = {
                "paper_id": self._get(paper, "id"),
                "title": self._get(paper, "title"),
                "doi": self._get(paper, "doi"),
                "year": self._get(paper, "year"),
                "authors": self._get(paper, "authors"),
            }

            # 处理重复 key
            if key in result:
                if style in (CitationStyle.IEEE, CitationStyle.VANCOUVER):
                    pass  # 编号制不会重复
                else:
                    base_key = key.rstrip(")")
                    for suffix in "abcdefghij":
                        candidate = f"{base_key}{suffix})"
                        if candidate not in result:
                            key = candidate
                            break
            result[key] = info
        return result


# ------------------------------------------------------------------
# 单例
# ------------------------------------------------------------------
_reference_formatter: Optional[ReferenceFormatterService] = None


def get_reference_formatter() -> ReferenceFormatterService:
    global _reference_formatter
    if _reference_formatter is None:
        _reference_formatter = ReferenceFormatterService()
    return _reference_formatter
