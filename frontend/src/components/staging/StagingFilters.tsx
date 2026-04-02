import { STATUS_OPTIONS, SOURCE_OPTIONS, SCREENING_STAGE_OPTIONS } from "./types";

interface StagingFiltersProps {
  q: string;
  setQ: (v: string) => void;
  status: string;
  setStatus: (v: string) => void;
  source: string;
  setSource: (v: string) => void;
  screeningStage: string;
  setScreeningStage: (v: string) => void;
  yearFrom: string;
  setYearFrom: (v: string) => void;
  yearTo: string;
  setYearTo: (v: string) => void;
  crawlJobId: string;
  setCrawlJobId: (v: string) => void;
  loading: boolean;
  onSearch: () => void;
}

export default function StagingFilters({
  q,
  setQ,
  status,
  setStatus,
  source,
  setSource,
  screeningStage,
  setScreeningStage,
  yearFrom,
  setYearFrom,
  yearTo,
  setYearTo,
  crawlJobId,
  setCrawlJobId,
  loading,
  onSearch,
}: StagingFiltersProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "16px 0",
        borderBottom: "1px solid #e2e8f0",
        marginBottom: 16,
        flexWrap: "wrap",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          flex: 1,
          minWidth: 240,
        }}
      >
        <label
          style={{
            fontSize: 12,
            color: "#64748b",
            fontWeight: 500,
            whiteSpace: "nowrap",
          }}
        >
          关键词:
        </label>
        <div
          style={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            width: "100%",
          }}
        >
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="模糊匹配标题和摘要..."
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
          {q.trim() !== "" && (
            <button
              type="button"
              onClick={() => setQ("")}
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

      <div style={{ width: 1, height: 20, backgroundColor: "#e2e8f0" }} />

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <label style={{ fontSize: 12, color: "#64748b", fontWeight: 500 }}>
          状态:
        </label>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          style={{
            height: 36,
            padding: "0 8px",
            borderRadius: 6,
            border: "1px solid #cbd5e1",
            backgroundColor: "#ffffff",
            color: "#0f172a",
            fontSize: 13,
            boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
            cursor: "pointer",
          }}
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div style={{ width: 1, height: 20, backgroundColor: "#e2e8f0" }} />

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <label style={{ fontSize: 12, color: "#64748b", fontWeight: 500 }}>
          数据源:
        </label>
        <select
          value={source}
          onChange={(e) => setSource(e.target.value)}
          style={{
            height: 36,
            padding: "0 8px",
            borderRadius: 6,
            border: "1px solid #cbd5e1",
            backgroundColor: "#ffffff",
            color: "#0f172a",
            fontSize: 13,
            boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
            cursor: "pointer",
            minWidth: 100,
          }}
        >
          {SOURCE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div style={{ width: 1, height: 20, backgroundColor: "#e2e8f0" }} />

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <label style={{ fontSize: 12, color: "#64748b", fontWeight: 500 }}>
          筛选阶段:
        </label>
        <select
          value={screeningStage}
          onChange={(e) => setScreeningStage(e.target.value)}
          style={{
            height: 36,
            padding: "0 8px",
            borderRadius: 6,
            border: "1px solid #cbd5e1",
            backgroundColor: "#ffffff",
            color: "#0f172a",
            fontSize: 13,
            boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
            cursor: "pointer",
            minWidth: 100,
          }}
        >
          {SCREENING_STAGE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div style={{ width: 1, height: 20, backgroundColor: "#e2e8f0" }} />

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <label style={{ fontSize: 12, color: "#64748b", fontWeight: 500 }}>
          年份:
        </label>
        <input
          value={yearFrom}
          onChange={(e) => setYearFrom(e.target.value)}
          placeholder="2015"
          type="number"
          style={{
            width: 70,
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
            width: 70,
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

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <label style={{ fontSize: 12, color: "#64748b", fontWeight: 500 }}>
          Job ID:
        </label>
        <input
          value={crawlJobId}
          onChange={(e) => setCrawlJobId(e.target.value)}
          placeholder="可选"
          type="number"
          style={{
            width: 60,
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
          marginLeft: "auto",
        }}
      >
        {loading ? "检索中..." : "检索"}
      </button>
    </div>
  );
}
