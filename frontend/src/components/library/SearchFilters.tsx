import type { LiteratureGroup } from "../../types";

interface SearchFiltersProps {
  query: string;
  setQuery: (q: string) => void;
  yearFrom: string;
  setYearFrom: (y: string) => void;
  yearTo: string;
  setYearTo: (y: string) => void;
  groups: LiteratureGroup[];
  selectedGroupId: number | null;
  onGroupChange: (id: number | null) => void;
  onSearch: () => void;
  loading: boolean;
  searchContext?: {
    query_keywords: string[];
    expanded_keywords: string[];
    group_keys: string[];
  };
}

export default function SearchFilters({
  query,
  setQuery,
  yearFrom,
  setYearFrom,
  yearTo,
  setYearTo,
  groups,
  selectedGroupId,
  onGroupChange,
  onSearch,
  loading,
}: SearchFiltersProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        gap: 12,
        flexWrap: "wrap",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <label style={{ fontSize: 12, color: "#64748b", fontWeight: 500 }}>
          分组
        </label>
        <select
          value={selectedGroupId || ""}
          onChange={(e) => {
            const val = e.target.value ? Number(e.target.value) : null;
            onGroupChange(val);
          }}
          style={{
            minWidth: 140,
            height: 36,
            padding: "0 12px",
            borderRadius: 6,
            border: "1px solid #cbd5e1",
            backgroundColor: "#ffffff",
            color: "#0f172a",
            fontSize: 13,
            boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
          }}
        >
          <option value="">所有文献</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name} ({g.paper_count})
            </option>
          ))}
        </select>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 4,
          flex: 1,
        }}
      >
        <label style={{ fontSize: 12, color: "#64748b", fontWeight: 500 }}>
          关键词
        </label>
        <div
          style={{
            position: "relative",
            display: "flex",
            alignItems: "center",
          }}
        >
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索标题、摘要、作者..."
            style={{
              width: "100%",
              height: 36,
              padding: "0 30px 0 12px",
              borderRadius: 6,
              border: "1px solid #cbd5e1",
              backgroundColor: "#ffffff",
              color: "#0f172a",
              fontSize: 13,
              boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
            }}
          />
          {query.trim() !== "" && (
            <button
              type="button"
              onClick={() => setQuery("")}
              style={{
                position: "absolute",
                right: 8,
                border: "none",
                background: "transparent",
                color: "#9ca3af",
                cursor: "pointer",
                fontSize: 16,
                padding: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              ×
            </button>
          )}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <label style={{ fontSize: 12, color: "#64748b", fontWeight: 500 }}>
          年份范围
        </label>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            value={yearFrom}
            onChange={(e) => setYearFrom(e.target.value)}
            placeholder="2015"
            type="number"
            style={{
              width: 80,
              height: 36,
              padding: "0 8px",
              borderRadius: 6,
              border: "1px solid #cbd5e1",
              backgroundColor: "#ffffff",
              color: "#0f172a",
              fontSize: 13,
              boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
            }}
          />
          <span style={{ color: "#94a3b8" }}>-</span>
          <input
            value={yearTo}
            onChange={(e) => setYearTo(e.target.value)}
            placeholder="2025"
            type="number"
            style={{
              width: 80,
              height: 36,
              padding: "0 8px",
              borderRadius: 6,
              border: "1px solid #cbd5e1",
              backgroundColor: "#ffffff",
              color: "#0f172a",
              fontSize: 13,
              boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
            }}
          />
        </div>
      </div>

      <button
        onClick={onSearch}
        disabled={loading}
        style={{
          height: 36,
          padding: "0 20px",
          borderRadius: 6,
          border: "none",
          background: "linear-gradient(180deg, #3b82f6 0%, #2563eb 100%)",
          color: "#ffffff",
          fontSize: 13,
          fontWeight: 500,
          cursor: loading ? "default" : "pointer",
          opacity: loading ? 0.7 : 1,
          boxShadow: "0 1px 2px rgba(37, 99, 235, 0.2)",
        }}
      >
        {loading ? "检索中..." : "检索"}
      </button>
    </div>
  );
}
