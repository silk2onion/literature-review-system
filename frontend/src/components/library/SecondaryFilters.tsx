type SortField = "year" | "title" | "firstAuthor" | "source" | "createdAt";
type SortOrder = "asc" | "desc";
type SourceFilter = "all" | "arxiv" | "crossref" | "semantic_scholar";

interface SecondaryFiltersProps {
  sortField: SortField;
  sortOrder: SortOrder;
  filterSource: SourceFilter;
  filterYearFromInput: string;
  filterYearToInput: string;
  filterTitleInitial: string;
  filterAuthorInitial: string;
  showArchived: boolean;
  onSortFieldChange: (f: SortField) => void;
  onSortOrderChange: (o: SortOrder) => void;
  onFilterSourceChange: (s: SourceFilter) => void;
  onFilterYearFromInputChange: (v: string) => void;
  onFilterYearToInputChange: (v: string) => void;
  onFilterTitleInitialChange: (v: string) => void;
  onFilterAuthorInitialChange: (v: string) => void;
  onShowArchivedChange: (v: boolean) => void;
}

export default function SecondaryFilters({
  sortField,
  sortOrder,
  filterSource,
  filterYearFromInput,
  filterYearToInput,
  filterTitleInitial,
  filterAuthorInitial,
  showArchived,
  onSortFieldChange,
  onSortOrderChange,
  onFilterSourceChange,
  onFilterYearFromInputChange,
  onFilterYearToInputChange,
  onFilterTitleInitialChange,
  onFilterAuthorInitialChange,
  onShowArchivedChange,
}: SecondaryFiltersProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        flexWrap: "wrap",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <label style={{ fontSize: 12, color: "#64748b" }}>排序:</label>
        <select
          value={sortField}
          onChange={(e) => onSortFieldChange(e.target.value as SortField)}
          style={{
            height: 30,
            padding: "0 8px",
            borderRadius: 6,
            border: "1px solid #e2e8f0",
            backgroundColor: "transparent",
            color: "#475569",
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          <option value="year">年份</option>
          <option value="title">标题</option>
          <option value="firstAuthor">第一作者</option>
          <option value="source">来源</option>
          <option value="createdAt">添加时间</option>
        </select>
        <select
          value={sortOrder}
          onChange={(e) => onSortOrderChange(e.target.value as SortOrder)}
          style={{
            height: 30,
            padding: "0 8px",
            borderRadius: 6,
            border: "1px solid #e2e8f0",
            backgroundColor: "transparent",
            color: "#475569",
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          <option value="desc">降序</option>
          <option value="asc">升序</option>
        </select>
      </div>

      <div style={{ width: 1, height: 20, backgroundColor: "#e2e8f0" }} />

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <label style={{ fontSize: 12, color: "#64748b" }}>来源:</label>
        <select
          value={filterSource}
          onChange={(e) =>
            onFilterSourceChange(e.target.value as SourceFilter)
          }
          style={{
            height: 30,
            padding: "0 8px",
            borderRadius: 6,
            border: "1px solid #e2e8f0",
            backgroundColor: "transparent",
            color: "#475569",
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          <option value="all">全部</option>
          <option value="arxiv">arXiv</option>
          <option value="crossref">CrossRef</option>
          <option value="semantic_scholar">Semantic Scholar</option>
        </select>
      </div>

      <div style={{ width: 1, height: 20, backgroundColor: "#e2e8f0" }} />

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <label style={{ fontSize: 12, color: "#64748b" }}>本地年份:</label>
        <input
          value={filterYearFromInput}
          onChange={(e) => onFilterYearFromInputChange(e.target.value)}
          placeholder="2015"
          type="number"
          style={{
            width: 60,
            height: 30,
            padding: "0 8px",
            borderRadius: 6,
            border: "1px solid #e2e8f0",
            backgroundColor: "transparent",
            color: "#475569",
            fontSize: 12,
          }}
        />
        <span style={{ color: "#cbd5e1" }}>-</span>
        <input
          value={filterYearToInput}
          onChange={(e) => onFilterYearToInputChange(e.target.value)}
          placeholder="2025"
          type="number"
          style={{
            width: 60,
            height: 30,
            padding: "0 8px",
            borderRadius: 6,
            border: "1px solid #e2e8f0",
            backgroundColor: "transparent",
            color: "#475569",
            fontSize: 12,
          }}
        />
      </div>

      <div style={{ width: 1, height: 20, backgroundColor: "#e2e8f0" }} />

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <label style={{ fontSize: 12, color: "#64748b" }}>首字母:</label>
        <input
          value={filterTitleInitial}
          onChange={(e) => onFilterTitleInitialChange(e.target.value)}
          placeholder="标题..."
          maxLength={1}
          style={{
            width: 60,
            height: 30,
            padding: "0 8px",
            borderRadius: 6,
            border: "1px solid #e2e8f0",
            backgroundColor: "transparent",
            color: "#475569",
            fontSize: 12,
          }}
        />
        <input
          value={filterAuthorInitial}
          onChange={(e) => onFilterAuthorInitialChange(e.target.value)}
          placeholder="作者..."
          maxLength={1}
          style={{
            width: 60,
            height: 30,
            padding: "0 8px",
            borderRadius: 6,
            border: "1px solid #e2e8f0",
            backgroundColor: "transparent",
            color: "#475569",
            fontSize: 12,
          }}
        />
      </div>

      <div style={{ flex: 1 }} />

      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          cursor: "pointer",
          fontSize: 12,
          color: "#64748b",
        }}
      >
        <input
          type="checkbox"
          checked={showArchived}
          onChange={(e) => onShowArchivedChange(e.target.checked)}
          style={{ cursor: "pointer" }}
        />
        显示归档
      </label>
    </div>
  );
}
