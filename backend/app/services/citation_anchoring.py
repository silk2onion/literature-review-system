"""
Citation Anchoring Post-Processor
=================================
Resolves [[REF_x]] placeholders in LLM-generated text to real academic citations.

Architecture:
    1. LLM generates text with [[REF_42]] placeholders (where 42 = paper.id)
    2. This module extracts all [[REF_x]] markers
    3. Looks up paper records by ID
    4. Replaces placeholders with formatted inline citations (Author, Year)
    5. Returns processed text + definitive list of cited paper IDs

Design Decision:
    Using deterministic integer-based anchoring instead of fragile (Author, Year) regex
    matching eliminates false positives, partial matches, and hallucinated citations.
"""

import re
import logging
from typing import Optional

from sqlalchemy.orm import Session

from app.models.paper import Paper
from app.services.reference_formatter import ReferenceFormatterService, CitationStyle

logger = logging.getLogger(__name__)

# Pattern to match [[REF_x]] where x is a positive integer (paper ID)
REF_PATTERN = re.compile(r'\[\[REF_(\d+)\]\]')

# Opt-4: 方法论关键词提取（从 abstract 中正则匹配常见方法术语）
_METHOD_KEYWORDS = [
    # Quantitative
    "regression", "GIS", "spatial analysis", "machine learning", "deep learning",
    "cluster analysis", "factor analysis", "PCA", "SEM", "structural equation",
    "meta-analysis", "systematic review", "survey", "questionnaire",
    "simulation", "agent-based", "cellular automata", "network analysis",
    "entropy", "DEA", "TOPSIS", "AHP", "fuzzy", "Bayesian",
    # Qualitative
    "case study", "interview", "ethnograph", "grounded theory", "content analysis",
    "participat", "observation", "focus group", "discourse analysis",
    # Data/Tech
    "remote sensing", "satellite", "LiDAR", "street view", "POI",
    "GPS", "mobile phone", "social media", "big data", "open data",
    "OSM", "OpenStreetMap", "Space Syntax",
    # Mixed
    "mixed method", "triangulat", "multi-criteria",
]
_METHOD_PATTERN = re.compile(
    r'\b(' + '|'.join(re.escape(k) for k in _METHOD_KEYWORDS) + r')',
    re.IGNORECASE
)


def _extract_method_tags(abstract: str) -> list[str]:
    """从 abstract 中提取方法论标签（去重、最多 5 个）"""
    if not abstract:
        return []
    matches = _METHOD_PATTERN.findall(abstract)
    # 去重并保持首次出现顺序
    seen = set()
    tags = []
    for m in matches:
        m_lower = m.lower()
        if m_lower not in seen:
            seen.add(m_lower)
            tags.append(m)
        if len(tags) >= 5:
            break
    return tags

# Enhanced pattern to match [[REF_x:pN]] (paper ID with page number)
# Group 1: paper_id, Group 2: page_number (optional)
REF_PAGE_PATTERN = re.compile(r'\[\[REF_(\d+)(?::p(\d+))?\]\]')


def extract_ref_ids(text: str) -> list[int]:
    """Extract all unique paper IDs from [[REF_x]] placeholders in text.

    Args:
        text: LLM-generated text containing [[REF_x]] markers.

    Returns:
        Sorted list of unique integer paper IDs.
    """
    if not text:
        return []
    matches = REF_PATTERN.findall(text)
    return sorted(set(int(m) for m in matches))


def build_paper_context_block(
    papers: list,
    lang: str = "zh"
) -> str:
    """Build a context block for LLM prompts with [[REF_x]] markers.

    This formats the paper list so the LLM knows which [[REF_x]] ID
    corresponds to which paper, enabling it to cite correctly.

    Args:
        papers: List of Paper ORM objects or dicts with id, title, authors, year, abstract, etc.
        lang: Language code ('zh' or 'en').

    Returns:
        Formatted string block for injection into LLM prompts.

    Example output:
        [[REF_42]] Smith, J.; Wang, L. (2021) - "Transit-Oriented Development and Urban Form"
        Journal: Journal of Urban Planning, Q1 | SCI
        Abstract: This paper examines the relationship between TOD and urban morphology...
        ---
    """
    if not papers:
        return "(No papers available)\n"

    lines = []
    for p in papers:
        # Support both ORM objects and dicts
        if isinstance(p, dict):
            pid = p.get('id', 0)
            title = p.get('title', 'Unknown Title')
            authors = p.get('authors', 'Unknown')
            year = p.get('year') or p.get('publication_year', 'N/A')
            abstract = p.get('abstract', '')
            journal = p.get('journal', '') or p.get('source', '')
            doi = p.get('doi', '')
            # Journal quality info
            quartile = p.get('quartile', '')
            impact_factor = p.get('impact_factor', '')
            indexed_by = p.get('indexed_by', '')
        else:
            pid = p.id
            title = p.title or 'Unknown Title'
            authors = p.authors or 'Unknown'
            year = p.year or getattr(p, 'publication_year', 'N/A')
            abstract = p.abstract or ''
            journal = p.journal or getattr(p, 'source', '') or ''
            doi = getattr(p, 'doi', '') or ''
            quartile = getattr(p, 'quartile', '') or ''
            impact_factor = getattr(p, 'impact_factor', '') or ''
            indexed_by = getattr(p, 'indexed_by', '') or ''

        # Header line with REF marker
        header = f"[[REF_{pid}]] {authors} ({year}) - \"{title}\""
        lines.append(header)

        # Journal info line (if available)
        journal_parts = []
        if journal:
            journal_parts.append(f"Journal: {journal}")
        if quartile:
            journal_parts.append(quartile)
        if impact_factor:
            journal_parts.append(f"IF={impact_factor}")
        if indexed_by:
            journal_parts.append(indexed_by)
        if journal_parts:
            lines.append(", ".join(journal_parts))

        # DOI (if available)
        if doi:
            lines.append(f"DOI: {doi}")

        # Abstract - use full abstract, not truncated
        if abstract:
            # Limit to ~500 chars to balance context vs token cost
            abs_text = abstract.strip()
            if len(abs_text) > 500:
                abs_text = abs_text[:497] + "..."
            lines.append(f"Abstract: {abs_text}")

        # Opt-4: 提取方法论关键词（从 abstract 中简单正则匹配）
        if abstract:
            method_tags = _extract_method_tags(abstract)
            if method_tags:
                lines.append(f"Methods: {', '.join(method_tags)}")

        lines.append("---")

    return "\n".join(lines) + "\n"


def build_chunk_context_block(
    chunk_results: list[dict],
    lang: str = "zh",
) -> str:
    """Build a context block from chunk-level search results for LLM prompts.

    Each chunk carries its own page number and [[REF_x:pN]] marker,
    enabling page-level citation in the generated text.

    Args:
        chunk_results: List of dicts from search_chunks() / search_chunks_for_section().
            Expected keys: paper_id, paper_title, paper_authors, paper_year,
                          chunk_content, page_number, chunk_index, ref_index, ref_marker
        lang: Language code ('zh' or 'en').

    Returns:
        Formatted context block for injection into LLM section-writing prompts.

    Example output:
        === Source Fragment [[REF_1:p5]] ===
        Paper: Smith, J.; Wang, L. (2021) - "Transit-Oriented Development"
        Page: 5 | Chunk: 3/12
        Content:
        The relationship between TOD and urban morphology has been extensively studied...
        ---
    """
    if not chunk_results:
        return "(No text fragments available)\n"

    lines: list[str] = []
    for cr in chunk_results:
        paper_id = cr.get("paper_id", 0)
        title = cr.get("paper_title", "Unknown Title")
        authors = cr.get("paper_authors", "Unknown")
        year = cr.get("paper_year", "N/A")
        content = cr.get("chunk_content", "")
        page_num = cr.get("page_number")
        chunk_idx = cr.get("chunk_index", 0)
        ref_marker = cr.get("ref_marker", f"[[REF_{paper_id}]]")
        score = cr.get("score", 0.0)

        # Header with ref marker
        lines.append(f"=== Source Fragment {ref_marker} ===")
        lines.append(f"Paper: {authors} ({year}) - \"{title}\"")

        # Page and chunk position info
        meta_parts = []
        if page_num is not None:
            meta_parts.append(f"Page: {page_num}")
        meta_parts.append(f"Chunk: #{chunk_idx}")
        meta_parts.append(f"Relevance: {score:.3f}")
        lines.append(" | ".join(meta_parts))

        # Content
        lines.append("Content:")
        # Truncate very long chunks for token efficiency
        content_text = content.strip()
        if len(content_text) > 1200:
            content_text = content_text[:1197] + "..."
        lines.append(content_text)
        lines.append("---")

    return "\n".join(lines) + "\n"


def build_chunk_ref_instruction(lang: str = "en") -> str:
    """Generate the LLM instruction for using [[REF_x:pN]] markers.

    This instruction block tells the LLM how to cite using page-level markers.

    Args:
        lang: Language code.

    Returns:
        Instruction string for injection into system/user prompts.
    """
    if lang == "zh":
        return (
            "\n## 引用指令\n"
            "你必须使用上面提供的 [[REF_x:pN]] 标记来引用文献片段。\n"
            "- [[REF_x:pN]] 表示引用第 x 篇文献的第 N 页内容\n"
            "- [[REF_x]] 表示引用第 x 篇文献（无特定页码）\n"
            "- 只引用上面提供的文献片段，不要编造引用\n"
            "- 在论述中自然地嵌入引用标记\n"
        )
    return (
        "\n## Citation Instructions\n"
        "You MUST use the [[REF_x:pN]] markers provided above to cite source fragments.\n"
        "- [[REF_x:pN]] cites paper x, page N (for page-specific references)\n"
        "- [[REF_x]] cites paper x (general reference, no specific page)\n"
        "- ONLY cite fragments provided above. Do NOT fabricate citations.\n"
        "- Embed citation markers naturally within your academic prose.\n"
    )


def resolve_ref_placeholders(
    text: str,
    db: Session,
    citation_style: str = "harvard",
    collect_missing: bool = True,
    linkable: bool = False,
) -> tuple[str, list[int], list[int]]:
    """Replace all [[REF_x]] placeholders with formatted inline citations.

    This is the core post-processing function. It:
    1. Extracts all [[REF_x]] IDs from the text
    2. Batch-loads corresponding Paper records from DB
    3. Replaces each [[REF_x]] with the appropriate (Author, Year) citation
    4. Tracks which IDs were successfully resolved and which were missing

    Args:
        text: LLM-generated text with [[REF_x]] placeholders.
        db: SQLAlchemy database session.
        citation_style: Citation format style (harvard/apa/ieee/chicago/vancouver).
        collect_missing: If True, collect IDs that don't exist in DB.

    Returns:
        Tuple of:
        - resolved_text: Text with [[REF_x]] replaced by (Author, Year)
        - cited_ids: List of successfully resolved paper IDs
        - missing_ids: List of paper IDs not found in database
    """
    if not text:
        return text, [], []

    ref_ids = extract_ref_ids(text)
    if not ref_ids:
        return text, [], []

    # Batch load papers from DB
    papers = db.query(Paper).filter(Paper.id.in_(ref_ids)).all()
    paper_map: dict[int, Paper] = {p.id: p for p in papers}

    cited_ids: list[int] = []
    missing_ids: list[int] = []

    formatter = ReferenceFormatterService()
    # Resolve style string to CitationStyle enum
    try:
        style_enum = CitationStyle(citation_style) if isinstance(citation_style, str) else citation_style
    except ValueError:
        style_enum = CitationStyle.HARVARD

    def replace_ref(match: re.Match) -> str:
        paper_id = int(match.group(1))
        page_num = match.group(2)  # May be None if no :pN suffix
        paper = paper_map.get(paper_id)

        if paper is None:
            if collect_missing:
                missing_ids.append(paper_id)
            logger.warning(f"Citation anchor [[REF_{paper_id}]] references non-existent paper ID {paper_id}")
            return f"[REF_{paper_id}_NOT_FOUND]"

        cited_ids.append(paper_id)

        # Build inline citation using ReferenceFormatterService
        inline = formatter.make_inline_citation(paper, style=style_enum)

        # Append page number if present: (Author, Year, p.N)
        if page_num is not None:
            if inline.endswith(")"):
                inline = inline[:-1] + f", p.{page_num})"
            else:
                inline = f"{inline} (p.{page_num})"

        # Wrap in Markdown hyperlink to reference list anchor
        if linkable:
            inline = f"[{inline}](#ref-{paper_id})"

        return inline

    resolved_text = REF_PAGE_PATTERN.sub(replace_ref, text)

    # Deduplicate while preserving order
    seen = set()
    unique_cited = []
    for pid in cited_ids:
        if pid not in seen:
            seen.add(pid)
            unique_cited.append(pid)

    unique_missing = sorted(set(missing_ids))

    if unique_missing:
        logger.warning(
            f"Citation anchoring: {len(unique_missing)} missing paper IDs: {unique_missing}"
        )

    logger.info(
        f"Citation anchoring resolved {len(unique_cited)} papers, "
        f"{len(unique_missing)} missing, from {len(ref_ids)} unique refs"
    )

    return resolved_text, unique_cited, unique_missing


def resolve_ref_placeholders_with_map(
    text: str,
    paper_map: dict[int, object],
    citation_style: str = "harvard",
) -> tuple[str, dict[str, int]]:
    """Replace [[REF_x]] placeholders using a pre-loaded paper map.

    This variant doesn't need a DB session - useful when papers are already
    loaded (e.g., in the PhD pipeline where papers are cached).

    Args:
        text: LLM-generated text with [[REF_x]] placeholders.
        paper_map: Dict mapping paper_id -> Paper object (or dict with authors/year).
        citation_style: Citation format style.

    Returns:
        Tuple of:
        - resolved_text: Text with citations resolved
        - citation_map: Dict mapping inline citation string -> paper_id
    """
    if not text:
        return text, {}

    formatter = ReferenceFormatterService()
    # Resolve style string to CitationStyle enum
    try:
        style_enum = CitationStyle(citation_style) if isinstance(citation_style, str) else citation_style
    except ValueError:
        style_enum = CitationStyle.HARVARD
    citation_map: dict[str, int] = {}

    def replace_ref(match: re.Match) -> str:
        paper_id = int(match.group(1))
        page_num = match.group(2)  # May be None if no :pN suffix
        paper = paper_map.get(paper_id)

        if paper is None:
            logger.warning(f"[[REF_{paper_id}]] not found in paper_map")
            return f"[REF_{paper_id}_NOT_FOUND]"

        inline = formatter.make_inline_citation(paper, style=style_enum)

        # Append page number if present
        if page_num is not None:
            if inline.endswith(")"):
                inline = inline[:-1] + f", p.{page_num})"
            else:
                inline = f"{inline} (p.{page_num})"

        citation_map[inline] = paper_id
        return inline

    resolved_text = REF_PAGE_PATTERN.sub(replace_ref, text)
    return resolved_text, citation_map


def generate_reference_list(
    cited_ids: list[int],
    db: Session,
    citation_style: str = "harvard",
    linkable: bool = False,
) -> str:
    """Generate a formatted reference list for all cited papers.

    Args:
        cited_ids: List of paper IDs that were cited in the text.
        db: SQLAlchemy database session.
        citation_style: Citation format style.
        linkable: If True, add HTML anchor IDs for hyperlink jumping.

    Returns:
        Formatted reference list as markdown string.
    """
    if not cited_ids:
        return ""

    papers = db.query(Paper).filter(Paper.id.in_(cited_ids)).all()
    paper_id_map = {p.id: p for p in papers}

    # Sort by first author surname, then year
    def sort_key(p):
        authors = p.authors or ""
        first_author = authors.split(",")[0].split(";")[0].strip()
        surname = first_author.split()[-1] if first_author else ""
        year = p.year or getattr(p, 'publication_year', 0) or 0
        return (surname.lower(), year)

    papers.sort(key=sort_key)

    formatter = ReferenceFormatterService()
    try:
        style_enum = CitationStyle(citation_style) if isinstance(citation_style, str) else citation_style
    except ValueError:
        style_enum = CitationStyle.HARVARD
    lines = ["## References\n"]

    for idx, p in enumerate(papers, start=1):
        ref_entry = formatter.format_one(p, style=style_enum, index=idx)
        if linkable:
            # Add anchor for hyperlink jumping from inline citations
            lines.append(f'- <a id="ref-{p.id}"></a>{ref_entry}')
        else:
            lines.append(f"- {ref_entry}")

    return "\n".join(lines)


def generate_reference_list_from_map(
    paper_map: dict[int, object],
    cited_ids: list[int],
    citation_style: str = "harvard",
    linkable: bool = False,
) -> str:
    """Generate reference list from pre-loaded paper map.

    Args:
        paper_map: Dict mapping paper_id -> Paper object.
        cited_ids: List of paper IDs to include.
        citation_style: Citation format style.

    Returns:
        Formatted reference list as markdown string.
    """
    if not cited_ids:
        return ""

    papers = [paper_map[pid] for pid in cited_ids if pid in paper_map]

    def sort_key(p):
        if isinstance(p, dict):
            authors = p.get('authors', '')
            year = p.get('year') or p.get('publication_year', 0) or 0
        else:
            authors = p.authors or ""
            year = p.year or getattr(p, 'publication_year', 0) or 0
        first_author = authors.split(",")[0].split(";")[0].strip()
        surname = first_author.split()[-1] if first_author else ""
        return (surname.lower(), year)

    papers.sort(key=sort_key)

    formatter = ReferenceFormatterService()
    try:
        style_enum = CitationStyle(citation_style) if isinstance(citation_style, str) else citation_style
    except ValueError:
        style_enum = CitationStyle.HARVARD
    lines = ["## References\n"]

    for idx, p in enumerate(papers, start=1):
        ref_entry = formatter.format_one(p, style=style_enum, index=idx)
        pid = p.get("id") if isinstance(p, dict) else getattr(p, "id", None)
        if linkable and pid:
            lines.append(f'- <a id="ref-{pid}"></a>{ref_entry}')
        else:
            lines.append(f"- {ref_entry}")

    return "\n".join(lines)