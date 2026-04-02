import React from "react";
import {
  Loader2,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import {
  typeColors,
  formatDuration,
  formatNumber,
  formatTime,
  getDurationColor,
} from "./UsageStatsPanel";

/* ───────── Types ───────── */
export interface UsageLog {
  id: number;
  call_type: string;
  source: string;
  model: string | null;
  endpoint: string | null;
  method: string | null;
  status_code: number | null;
  success: boolean;
  duration_ms: number | null;
  tokens_in: number | null;
  tokens_out: number | null;
  result_count: number | null;
  error: string | null;
  metadata_json: Record<string, unknown> | null;
  caller: string | null;
  created_at: string | null;
}

export interface PageResponse {
  items: UsageLog[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

/* ───────── Sub-components ───────── */

function TypeBadge({ type }: { type: string }) {
  const tc = typeColors[type] || {
    bg: "rgba(148,163,184,0.15)",
    text: "#94a3b8",
    icon: null,
  };
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 8px",
        borderRadius: 6,
        fontSize: 11,
        fontWeight: 700,
        backgroundColor: tc.bg,
        color: tc.text,
      }}
    >
      {tc.icon}
      {type.toUpperCase()}
    </span>
  );
}

function StatusBadge({
  success,
  statusCode,
}: {
  success: boolean;
  statusCode: number | null;
}) {
  if (success) {
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          padding: "2px 8px",
          borderRadius: 6,
          fontSize: 11,
          fontWeight: 600,
          backgroundColor: "rgba(22, 163, 106, 0.08)",
          color: "#16a34a",
        }}
      >
        <CheckCircle2 size={12} />
        {statusCode || "OK"}
      </span>
    );
  }
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 8px",
        borderRadius: 6,
        fontSize: 11,
        fontWeight: 600,
        backgroundColor: "rgba(220, 38, 38, 0.08)",
        color: "#dc2626",
      }}
    >
      <XCircle size={12} />
      {statusCode || "ERR"}
    </span>
  );
}

function DetailItem({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div style={{ marginBottom: 4 }}>
      <span style={{ color: "#8E8E93", fontSize: 11 }}>{label}: </span>
      <span
        style={{
          color: "#3C3C43",
          fontSize: 12,
          fontFamily: mono ? "monospace" : "inherit",
          wordBreak: "break-all",
        }}
      >
        {value}
      </span>
    </div>
  );
}

/* ───────── Main Component ───────── */

interface UsageLogTableProps {
  logs: UsageLog[];
  loading: boolean;
  expandedId: number | null;
  setExpandedId: (id: number | null) => void;
  total: number;
  totalPages: number;
  page: number;
  setPage: (fn: (p: number) => number) => void;
}

export default function UsageLogTable({
  logs,
  loading,
  expandedId,
  setExpandedId,
  total,
  totalPages,
  page,
  setPage,
}: UsageLogTableProps) {
  return (
    <>
      {/* Table */}
      <div style={tableStyles.tableWrapper}>
        <table style={tableStyles.table}>
          <thead>
            <tr>
              <th style={tableStyles.th}></th>
              <th style={tableStyles.th}>时间</th>
              <th style={tableStyles.th}>类型</th>
              <th style={tableStyles.th}>来源</th>
              <th style={tableStyles.th}>模型</th>
              <th style={tableStyles.th}>状态</th>
              <th style={tableStyles.th}>延迟</th>
              <th style={tableStyles.th}>Token 入</th>
              <th style={tableStyles.th}>Token 出</th>
              <th style={tableStyles.th}>调用者</th>
            </tr>
          </thead>
          <tbody>
            {loading && logs.length === 0 ? (
              <tr>
                <td
                  colSpan={10}
                  style={{
                    ...tableStyles.td,
                    textAlign: "center",
                    padding: 40,
                    color: "#8E8E93",
                  }}
                >
                  <Loader2
                    size={24}
                    className="animate-spin"
                    style={{ margin: "0 auto 8px" }}
                  />
                  加载中...
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td
                  colSpan={10}
                  style={{
                    ...tableStyles.td,
                    textAlign: "center",
                    padding: 40,
                    color: "#8E8E93",
                  }}
                >
                  暂无日志记录
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <React.Fragment key={log.id}>
                  <tr
                    style={{
                      ...tableStyles.tr,
                      backgroundColor:
                        expandedId === log.id
                          ? "#F5F5F7"
                          : undefined,
                      cursor: "pointer",
                    }}
                    onClick={() =>
                      setExpandedId(expandedId === log.id ? null : log.id)
                    }
                  >
                    <td style={tableStyles.td}>
                      {expandedId === log.id ? (
                        <ChevronDown size={14} color="#8E8E93" />
                      ) : (
                        <ChevronRight size={14} color="#8E8E93" />
                      )}
                    </td>
                    <td
                      style={{
                        ...tableStyles.td,
                        fontFamily: "monospace",
                        fontSize: 12,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {formatTime(log.created_at)}
                    </td>
                    <td style={tableStyles.td}>
                      <TypeBadge type={log.call_type} />
                    </td>
                    <td
                      style={{
                        ...tableStyles.td,
                        color: "#1C1C1E",
                        fontWeight: 500,
                      }}
                    >
                      {log.source}
                    </td>
                    <td
                      style={{
                        ...tableStyles.td,
                        color: "#8E8E93",
                        fontSize: 12,
                        maxWidth: 180,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {log.model || "-"}
                    </td>
                    <td style={tableStyles.td}>
                      <StatusBadge
                        success={log.success}
                        statusCode={log.status_code}
                      />
                    </td>
                    <td
                      style={{
                        ...tableStyles.td,
                        fontFamily: "monospace",
                        fontSize: 12,
                        color: getDurationColor(log.duration_ms),
                      }}
                    >
                      {formatDuration(log.duration_ms)}
                    </td>
                    <td
                      style={{
                        ...tableStyles.td,
                        fontFamily: "monospace",
                        fontSize: 12,
                        color: "#8E8E93",
                      }}
                    >
                      {log.tokens_in != null
                        ? formatNumber(log.tokens_in)
                        : "-"}
                    </td>
                    <td
                      style={{
                        ...tableStyles.td,
                        fontFamily: "monospace",
                        fontSize: 12,
                        color: "#8E8E93",
                      }}
                    >
                      {log.tokens_out != null
                        ? formatNumber(log.tokens_out)
                        : "-"}
                    </td>
                    <td
                      style={{
                        ...tableStyles.td,
                        color: "#8E8E93",
                        fontSize: 11,
                        maxWidth: 200,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {log.caller || "-"}
                    </td>
                  </tr>

                  {/* Expanded detail row */}
                  {expandedId === log.id && (
                    <tr>
                      <td colSpan={10} style={tableStyles.expandedCell}>
                        <div style={tableStyles.detailGrid}>
                          <DetailItem label="ID" value={String(log.id)} />
                          <DetailItem
                            label="Endpoint"
                            value={log.endpoint || "-"}
                            mono
                          />
                          <DetailItem
                            label="Method"
                            value={log.method || "-"}
                          />
                          <DetailItem
                            label="Status Code"
                            value={
                              log.status_code != null
                                ? String(log.status_code)
                                : "-"
                            }
                          />
                          <DetailItem
                            label="Result Count"
                            value={
                              log.result_count != null
                                ? String(log.result_count)
                                : "-"
                            }
                          />
                          <DetailItem
                            label="Duration"
                            value={formatDuration(log.duration_ms)}
                          />
                          {log.error && (
                            <div style={tableStyles.errorBox}>
                              <strong style={{ color: "#dc2626" }}>
                                Error:{" "}
                              </strong>
                              {log.error}
                            </div>
                          )}
                          {log.metadata_json &&
                            Object.keys(log.metadata_json).length > 0 && (
                              <div style={tableStyles.metadataBox}>
                                <strong
                                  style={{
                                    color: "#8E8E93",
                                    marginBottom: 4,
                                    display: "block",
                                  }}
                                >
                                  Metadata:
                                </strong>
                                <pre style={tableStyles.pre}>
                                  {JSON.stringify(log.metadata_json, null, 2)}
                                </pre>
                              </div>
                            )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={tableStyles.pagination}>
          <span style={{ color: "#8E8E93", fontSize: 13 }}>
            共 {total} 条 · 第 {page}/{totalPages} 页
          </span>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              style={tableStyles.pageBtn}
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              ‹ 上一页
            </button>
            <button
              style={tableStyles.pageBtn}
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              下一页 ›
            </button>
          </div>
        </div>
      )}
    </>
  );
}

const tableStyles: Record<string, React.CSSProperties> = {
  tableWrapper: {
    flex: 1,
    overflow: "auto",
    borderRadius: 12,
    border: "1px solid #E5E5EA",
    backgroundColor: "#FFFFFF",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse" as const,
    fontSize: 13,
  },
  th: {
    textAlign: "left" as const,
    padding: "10px 12px",
    color: "#8E8E93",
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase" as const,
    borderBottom: "1px solid #E5E5EA",
    position: "sticky" as const,
    top: 0,
    backgroundColor: "#F5F5F7",
    whiteSpace: "nowrap" as const,
  },
  tr: {
    borderBottom: "1px solid #E5E5EA",
    transition: "background-color 0.15s",
  },
  td: {
    padding: "8px 12px",
    verticalAlign: "middle" as const,
  },
  expandedCell: {
    padding: "0 12px 12px 36px",
    backgroundColor: "#F9FAFB",
  },
  detailGrid: {
    padding: "12px 16px",
    backgroundColor: "#F5F5F7",
    borderRadius: 8,
    border: "1px solid #E5E5EA",
  },
  errorBox: {
    marginTop: 8,
    padding: "8px 12px",
    backgroundColor: "#FEF2F2",
    borderRadius: 6,
    color: "#dc2626",
    fontSize: 12,
    border: "1px solid #FECACA",
    wordBreak: "break-all" as const,
  },
  metadataBox: {
    marginTop: 8,
    padding: "8px 12px",
    backgroundColor: "#F5F5F7",
    borderRadius: 6,
    fontSize: 12,
    border: "1px solid #E5E5EA",
  },
  pre: {
    margin: 0,
    color: "#3C3C43",
    fontSize: 11,
    fontFamily: "monospace",
    whiteSpace: "pre-wrap" as const,
    wordBreak: "break-all" as const,
  },
  pagination: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 16,
  },
  pageBtn: {
    padding: "6px 14px",
    borderRadius: 6,
    border: "1px solid #D1D1D6",
    backgroundColor: "#FFFFFF",
    color: "#3C3C43",
    fontSize: 13,
    cursor: "pointer",
  },
};
