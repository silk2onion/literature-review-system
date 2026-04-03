import type { StagingPaper } from "./types";

interface PrismaStagePanelProps {
  stage: string;
  stageLabel: string;
  stageColor: string;
  papers: StagingPaper[];
  loading: boolean;
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  selectedIds: number[];
  onToggleSelect: (id: number) => void;
  onToggleSelectAll: () => void;
  allSelected: boolean;
  onAdvance: () => void;
  onExclude: () => void;
  onClose: () => void;
  onPageChange: (page: number) => void;
  nextStageLabel?: string;
  canAdvance: boolean;
  canRunAI: boolean;
  onRunAI?: () => void;
}

export default function PrismaStagePanel({
  stage: _stage,
  stageLabel,
  stageColor,
  papers,
  loading,
  total,
  page,
  pageSize,
  totalPages,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  allSelected,
  onAdvance,
  onExclude,
  onClose,
  onPageChange,
  nextStageLabel,
  canAdvance,
  canRunAI,
  onRunAI,
}: PrismaStagePanelProps) {
  void _stage; // used by parent for key identification
  return (
    <div
      style={{
        border: `1px solid ${stageColor}40`,
        borderRadius: 8,
        backgroundColor: "#ffffff",
        marginTop: 8,
        marginBottom: 16,
        overflow: "hidden",
      }}
    >
      {/* Toolbar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 12px",
          backgroundColor: `${stageColor}0a`,
          borderBottom: `1px solid ${stageColor}20`,
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600, color: stageColor }}>
          {stageLabel} — {total} 篇文献
        </span>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {canRunAI && onRunAI && (
            <button
              onClick={onRunAI}
              style={{
                padding: "4px 10px",
                borderRadius: 6,
                border: "1px solid #8b5cf6",
                backgroundColor: "#f5f3ff",
                color: "#7c3aed",
                fontSize: 12,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              🤖 AI 筛选
            </button>
          )}
          {canAdvance && (
            <button
              onClick={onAdvance}
              disabled={selectedIds.length === 0}
              style={{
                padding: "4px 10px",
                borderRadius: 6,
                border: "1px solid #22c55e",
                backgroundColor:
                  selectedIds.length > 0 ? "#f0fdf4" : "#f9fafb",
                color: selectedIds.length > 0 ? "#16a34a" : "#9ca3af",
                fontSize: 12,
                fontWeight: 500,
                cursor: selectedIds.length > 0 ? "pointer" : "default",
              }}
            >
              推进到 {nextStageLabel || "下一阶段"}
              {selectedIds.length > 0 ? ` (${selectedIds.length})` : ""}
            </button>
          )}
          <button
            onClick={onExclude}
            disabled={selectedIds.length === 0}
            style={{
              padding: "4px 10px",
              borderRadius: 6,
              border:
                selectedIds.length > 0
                  ? "1px solid #f97316"
                  : "1px solid #d1d5db",
              backgroundColor:
                selectedIds.length > 0 ? "#fff7ed" : "#f9fafb",
              color: selectedIds.length > 0 ? "#ea580c" : "#9ca3af",
              fontSize: 12,
              fontWeight: 500,
              cursor: selectedIds.length > 0 ? "pointer" : "default",
            }}
          >
            排除 {selectedIds.length > 0 ? `(${selectedIds.length})` : ""}
          </button>
          <button
            onClick={onClose}
            style={{
              padding: "4px 10px",
              borderRadius: 6,
              border: "1px solid #d1d5db",
              backgroundColor: "#ffffff",
              color: "#6b7280",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            收起
          </button>
        </div>
      </div>

      {/* Table */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ backgroundColor: "#f8fafc" }}>
              <th style={{ width: 36, padding: "6px 8px", textAlign: "left" }}>
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={onToggleSelectAll}
                />
              </th>
              <th style={{ padding: "6px 8px", textAlign: "left" }}>标题</th>
              <th style={{ width: 60, padding: "6px 8px" }}>年份</th>
              <th style={{ width: 100, padding: "6px 8px" }}>来源</th>
              <th style={{ width: 70, padding: "6px 8px" }}>AI 评分</th>
              <th style={{ width: 80, padding: "6px 8px" }}>状态</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} style={{ padding: 16, textAlign: "center", color: "#9ca3af" }}>
                  加载中...
                </td>
              </tr>
            )}
            {!loading && papers.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: 16, textAlign: "center", color: "#9ca3af" }}>
                  该阶段暂无文献
                </td>
              </tr>
            )}
            {papers.map((p) => {
              const checked = selectedIds.includes(p.id);
              return (
                <tr
                  key={p.id}
                  style={{
                    borderBottom: "1px solid #f1f5f9",
                    backgroundColor: checked ? "#eff6ff" : "transparent",
                  }}
                >
                  <td style={{ padding: "6px 8px" }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggleSelect(p.id)}
                    />
                  </td>
                  <td
                    style={{
                      padding: "6px 8px",
                      maxWidth: 400,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={p.title}
                  >
                    {p.title}
                  </td>
                  <td style={{ padding: "6px 8px", textAlign: "center", color: "#4b5563" }}>
                    {p.year ?? "-"}
                  </td>
                  <td style={{ padding: "6px 8px", textAlign: "center", color: "#6b7280" }}>
                    {p.source || "-"}
                  </td>
                  <td style={{ padding: "6px 8px", textAlign: "center" }}>
                    {p.llm_score != null ? (
                      <span
                        style={{
                          padding: "1px 6px",
                          borderRadius: 999,
                          fontSize: 10,
                          fontWeight: 600,
                          backgroundColor:
                            p.llm_score >= 7 ? "#dcfce7" : p.llm_score >= 4 ? "#fef9c3" : "#fee2e2",
                          color:
                            p.llm_score >= 7 ? "#16a34a" : p.llm_score >= 4 ? "#ca8a04" : "#dc2626",
                        }}
                      >
                        {p.llm_score}/10
                      </span>
                    ) : (
                      <span style={{ color: "#d1d5db" }}>-</span>
                    )}
                  </td>
                  <td style={{ padding: "6px 8px", textAlign: "center", color: "#6b7280" }}>
                    {p.status || "-"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {total > pageSize && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "6px 12px",
            borderTop: "1px solid #f1f5f9",
            fontSize: 11,
            color: "#9ca3af",
          }}
        >
          <span>
            第 {page}/{totalPages} 页，共 {total} 条
          </span>
          <div style={{ display: "flex", gap: 4 }}>
            <button
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
              style={{
                padding: "2px 8px",
                borderRadius: 4,
                border: "1px solid #e2e8f0",
                backgroundColor: "#fff",
                fontSize: 11,
                cursor: page <= 1 ? "default" : "pointer",
                opacity: page <= 1 ? 0.4 : 1,
              }}
            >
              上一页
            </button>
            <button
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages}
              style={{
                padding: "2px 8px",
                borderRadius: 4,
                border: "1px solid #e2e8f0",
                backgroundColor: "#fff",
                fontSize: 11,
                cursor: page >= totalPages ? "default" : "pointer",
                opacity: page >= totalPages ? 0.4 : 1,
              }}
            >
              下一页
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
