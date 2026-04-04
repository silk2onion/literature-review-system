import React, { useState } from "react";
import type { StagingPaper } from "./types";
import { useLocale } from "../../hooks/useLocale";

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
  const { t } = useLocale();
  const [expandedId, setExpandedId] = useState<number | null>(null);
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
          {stageLabel} — {t("prisma.panel.paperCount", { total })}
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
              🤖 {t("prisma.panel.aiScreen")}
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
              {t("prisma.panel.advanceTo")} {nextStageLabel || t("prisma.panel.nextStage")}
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
            {t("prisma.panel.exclude")} {selectedIds.length > 0 ? `(${selectedIds.length})` : ""}
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
            {t("prisma.panel.collapse")}
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
              <th style={{ padding: "6px 8px", textAlign: "left" }}>{t("prisma.panel.tableTitle")}</th>
              <th style={{ width: 60, padding: "6px 8px" }}>{t("prisma.panel.tableYear")}</th>
              <th style={{ width: 100, padding: "6px 8px" }}>{t("prisma.panel.tableSource")}</th>
              <th style={{ width: 70, padding: "6px 8px" }}>{t("prisma.panel.tableAiScore")}</th>
              <th style={{ width: 80, padding: "6px 8px" }}>{t("prisma.panel.tableStatus")}</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} style={{ padding: 16, textAlign: "center", color: "#9ca3af" }}>
                  {t("common.loading")}
                </td>
              </tr>
            )}
            {!loading && papers.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: 16, textAlign: "center", color: "#9ca3af" }}>
                  {t("prisma.panel.noData")}
                </td>
              </tr>
            )}
            {papers.map((p) => {
              const checked = selectedIds.includes(p.id);
              const isExpanded = expandedId === p.id;
              const aiReason = Array.isArray(p.llm_tags) && p.llm_tags.length > 1 ? p.llm_tags[1] : null;
              return (
                <React.Fragment key={p.id}>
                  <tr
                    onClick={() => setExpandedId(isExpanded ? null : p.id)}
                    style={{
                      borderBottom: isExpanded ? "none" : "1px solid #f1f5f9",
                      backgroundColor: checked ? "#eff6ff" : "transparent",
                      cursor: "pointer",
                    }}
                  >
                    <td style={{ padding: "6px 8px" }} onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => onToggleSelect(p.id)}
                      />
                    </td>
                    <td style={{ padding: "6px 8px", maxWidth: 400 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ color: "#94a3b8", fontSize: 10, flexShrink: 0 }}>{isExpanded ? "▼" : "▶"}</span>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</span>
                      </div>
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
                            padding: "1px 6px", borderRadius: 999, fontSize: 10, fontWeight: 600,
                            backgroundColor: p.llm_score >= 7 ? "#dcfce7" : p.llm_score >= 4 ? "#fef9c3" : "#fee2e2",
                            color: p.llm_score >= 7 ? "#16a34a" : p.llm_score >= 4 ? "#ca8a04" : "#dc2626",
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
                  {isExpanded && (
                    <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td colSpan={6} style={{ padding: "0 8px 12px 36px" }}>
                        <div style={{ backgroundColor: "#f8fafc", borderRadius: 8, padding: "12px 16px", fontSize: 12 }}>
                          {/* Authors */}
                          {p.authors && p.authors.length > 0 && (
                            <div style={{ marginBottom: 6, color: "#475569" }}>
                              <strong>Authors:</strong> {p.authors.join(", ")}
                            </div>
                          )}
                          {/* Journal */}
                          {p.journal && (
                            <div style={{ marginBottom: 6, color: "#475569" }}>
                              <strong>Journal:</strong> <em>{p.journal}</em>
                            </div>
                          )}
                          {/* Abstract */}
                          {p.abstract ? (
                            <div style={{ marginBottom: 8, color: "#374151", lineHeight: 1.6, maxHeight: 150, overflowY: "auto" }}>
                              <strong>Abstract:</strong> {p.abstract}
                            </div>
                          ) : (
                            <div style={{ marginBottom: 8, color: "#cbd5e1", fontStyle: "italic" }}>No abstract available</div>
                          )}
                          {/* AI Reason */}
                          {aiReason && (
                            <div style={{ marginBottom: 6, padding: "6px 10px", borderRadius: 6, backgroundColor: "#f5f3ff", border: "1px solid #ede9fe", color: "#6d28d9", fontSize: 11 }}>
                              🤖 AI: {aiReason}
                            </div>
                          )}
                          {/* Links */}
                          <div style={{ display: "flex", gap: 12, fontSize: 11, color: "#94a3b8" }}>
                            {p.doi && (
                              <a href={`https://doi.org/${p.doi}`} target="_blank" rel="noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                style={{ color: "#2563eb", textDecoration: "none" }}>
                                DOI: {p.doi}
                              </a>
                            )}
                            {p.url && !p.doi && (
                              <a href={p.url} target="_blank" rel="noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                style={{ color: "#2563eb", textDecoration: "none" }}>
                                Link
                              </a>
                            )}
                            {p.citations_count != null && p.citations_count > 0 && (
                              <span>Cited: {p.citations_count}</span>
                            )}
                            <span>ID: {p.id}</span>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
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
            {t("prisma.panel.pageInfo", { page, totalPages, total })}
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
              {t("common.previousPage")}
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
              {t("common.nextPage")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
