import React from "react";
import { Loader2, Trash2 } from "lucide-react";

interface UsageCleanupProps {
  filterType: string;
  setFilterType: (v: string) => void;
  filterSource: string;
  setFilterSource: (v: string) => void;
  filterSuccess: string;
  setFilterSuccess: (v: string) => void;
  cleanupDays: number;
  setCleanupDays: (v: number) => void;
  cleaning: boolean;
  onCleanup: () => void;
}

export default function UsageCleanup({
  filterType,
  setFilterType,
  filterSource,
  setFilterSource,
  filterSuccess,
  setFilterSuccess,
  cleanupDays,
  setCleanupDays,
  cleaning,
  onCleanup,
}: UsageCleanupProps) {
  return (
    <div style={filterStyles.filterBar}>
      <div style={filterStyles.filterGroup}>
        <select
          style={filterStyles.select}
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
        >
          <option value="">全部类型</option>
          <option value="llm">LLM</option>
          <option value="embedding">Embedding</option>
          <option value="crawler">Crawler</option>
        </select>

        <input
          style={filterStyles.input}
          type="text"
          placeholder="来源 (如 openai, scopus...)"
          value={filterSource}
          onChange={(e) => setFilterSource(e.target.value)}
        />

        <select
          style={filterStyles.select}
          value={filterSuccess}
          onChange={(e) => setFilterSuccess(e.target.value)}
        >
          <option value="">全部状态</option>
          <option value="true">✓ 成功</option>
          <option value="false">✗ 失败</option>
        </select>
      </div>

      <div style={filterStyles.filterGroup}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input
            type="number"
            min={1}
            max={365}
            value={cleanupDays}
            onChange={(e) => setCleanupDays(Number(e.target.value))}
            style={{ ...filterStyles.input, width: 60, textAlign: "center" }}
          />
          <span
            style={{ color: "#8E8E93", fontSize: 12, whiteSpace: "nowrap" }}
          >
            天前
          </span>
          <button
            onClick={onCleanup}
            style={filterStyles.cleanupBtn}
            disabled={cleaning}
          >
            {cleaning ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Trash2 size={12} />
            )}
            清理
          </button>
        </div>
      </div>
    </div>
  );
}

const filterStyles: Record<string, React.CSSProperties> = {
  filterBar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
    flexWrap: "wrap" as const,
  },
  filterGroup: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  select: {
    padding: "7px 12px",
    borderRadius: 8,
    border: "1px solid #D1D1D6",
    backgroundColor: "#F5F5F7",
    color: "#1C1C1E",
    fontSize: 13,
    outline: "none",
    cursor: "pointer",
  },
  input: {
    padding: "7px 12px",
    borderRadius: 8,
    border: "1px solid #D1D1D6",
    backgroundColor: "#F5F5F7",
    color: "#1C1C1E",
    fontSize: 13,
    outline: "none",
    width: 180,
  },
  cleanupBtn: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    padding: "7px 12px",
    borderRadius: 8,
    border: "1px solid rgba(239, 68, 68, 0.2)",
    backgroundColor: "rgba(239, 68, 68, 0.04)",
    color: "#dc2626",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    whiteSpace: "nowrap" as const,
  },
};
