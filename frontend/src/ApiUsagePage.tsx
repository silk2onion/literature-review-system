import React, { useEffect, useState, useCallback } from "react";
import {
  BarChart3,
  RefreshCw,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Zap,
  Database,
  Brain,
  Globe,
  ChevronDown,
  ChevronRight,
  Trash2,
  ArrowUpDown,
} from "lucide-react";

const API_BASE_URL = "http://localhost:5444";

/* ───────── Types ───────── */
interface UsageLog {
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

interface PageResponse {
  items: UsageLog[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

interface UsageStats {
  total_calls: number;
  total_errors: number;
  total_tokens_in: number;
  total_tokens_out: number;
  total_duration_ms: number;
  by_type: Record<string, number>;
  by_source: Record<string, number>;
  by_model: Record<string, number>;
  error_rate: number;
  avg_duration_ms: number;
}

/* ───────── Helpers ───────── */
const typeColors: Record<
  string,
  { bg: string; text: string; icon: React.ReactNode }
> = {
  llm: {
    bg: "rgba(168, 85, 247, 0.15)",
    text: "#c084fc",
    icon: <Brain size={12} />,
  },
  embedding: {
    bg: "rgba(59, 130, 246, 0.15)",
    text: "#60a5fa",
    icon: <Database size={12} />,
  },
  crawler: {
    bg: "rgba(34, 197, 94, 0.15)",
    text: "#4ade80",
    icon: <Globe size={12} />,
  },
};

function formatDuration(ms: number | null): string {
  if (ms == null) return "-";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatTime(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/* ───────── Component ───────── */
export default function ApiUsagePage() {
  // Data
  const [logs, setLogs] = useState<UsageLog[]>([]);
  const [stats, setStats] = useState<UsageStats | null>(null);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  // Filters
  const [filterType, setFilterType] = useState<string>("");
  const [filterSource, setFilterSource] = useState<string>("");
  const [filterSuccess, setFilterSuccess] = useState<string>("");
  const [page, setPage] = useState(1);
  const pageSize = 30;

  // UI
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [cleanupDays, setCleanupDays] = useState(30);
  const [cleaning, setCleaning] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string>("");

  const fetchLogs = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filterType) params.set("call_type", filterType);
      if (filterSource.trim()) params.set("source", filterSource.trim());
      if (filterSuccess === "true") params.set("success", "true");
      if (filterSuccess === "false") params.set("success", "false");
      params.set("page", String(page));
      params.set("page_size", String(pageSize));

      const resp = await fetch(`${API_BASE_URL}/api/usage/logs?${params}`, {
        cache: "no-store",
      });
      if (resp.ok) {
        const data: PageResponse = await resp.json();
        setLogs(data.items);
        setTotal(data.total);
        setTotalPages(data.total_pages);
      } else {
        throw new Error(`日志接口返回 ${resp.status}`);
      }
    } catch (err) {
      console.error("Failed to fetch usage logs:", err);
      setErrorMsg("日志加载失败，请检查后端是否运行并重试刷新。");
    }
  }, [filterType, filterSource, filterSuccess, page]);

  const fetchStats = useCallback(async () => {
    try {
      const resp = await fetch(`${API_BASE_URL}/api/usage/stats`, {
        cache: "no-store",
      });
      if (resp.ok) {
        setStats(await resp.json());
      } else {
        throw new Error(`统计接口返回 ${resp.status}`);
      }
    } catch (err) {
      console.error("Failed to fetch usage stats:", err);
      setErrorMsg("统计加载失败，请检查后端连接。");
    }
  }, []);

  const fetchAll = useCallback(async () => {
    setErrorMsg("");
    setLoading(true);
    await Promise.all([fetchLogs(), fetchStats()]);
    setLoading(false);
  }, [fetchLogs, fetchStats]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Reset page on filter change
  useEffect(() => {
    setPage(1);
  }, [filterType, filterSource, filterSuccess]);

  const handleCleanup = async () => {
    if (!confirm(`确定要删除 ${cleanupDays} 天前的所有日志吗？`)) return;
    setCleaning(true);
    try {
      const resp = await fetch(
        `${API_BASE_URL}/api/usage/logs/cleanup?days=${cleanupDays}`,
        {
          method: "DELETE",
        },
      );
      if (resp.ok) {
        const data = await resp.json();
        alert(`已删除 ${data.deleted} 条旧日志`);
        fetchAll();
      }
    } catch (err) {
      alert(`清理失败: ${err}`);
    } finally {
      setCleaning(false);
    }
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <header style={styles.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={styles.iconCircle}>
            <BarChart3 size={20} color="#6366f1" />
          </div>
          <div>
            <h2 style={styles.title}>API 使用监控</h2>
            <p style={styles.subtitle}>
              追踪 LLM · Embedding · 爬虫 API 调用日志
            </p>
          </div>
        </div>
        <button onClick={fetchAll} style={styles.refreshBtn} disabled={loading}>
          {loading ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <RefreshCw size={14} />
          )}
          刷新
        </button>
      </header>

      {errorMsg && (
        <div
          style={{
            marginBottom: 12,
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid rgba(244,63,94,0.35)",
            background: "rgba(244,63,94,0.1)",
            color: "#fecaca",
            fontSize: 13,
          }}
        >
          {errorMsg}
        </div>
      )}

      {/* Stats Cards */}
      {stats && (
        <div style={styles.statsGrid}>
          <StatCard
            label="总调用"
            value={formatNumber(stats.total_calls)}
            icon={<Zap size={18} color="#6366f1" />}
            color="#6366f1"
          />
          <StatCard
            label="错误率"
            value={`${(stats.error_rate * 100).toFixed(1)}%`}
            icon={
              <XCircle
                size={18}
                color={stats.error_rate > 0.1 ? "#f43f5e" : "#10b981"}
              />
            }
            color={stats.error_rate > 0.1 ? "#f43f5e" : "#10b981"}
          />
          <StatCard
            label="平均延迟"
            value={formatDuration(stats.avg_duration_ms)}
            icon={<Clock size={18} color="#f59e0b" />}
            color="#f59e0b"
          />
          <StatCard
            label="Token 输入"
            value={formatNumber(stats.total_tokens_in)}
            icon={<ArrowUpDown size={18} color="#3b82f6" />}
            color="#3b82f6"
          />
          <StatCard
            label="Token 输出"
            value={formatNumber(stats.total_tokens_out)}
            icon={<ArrowUpDown size={18} color="#8b5cf6" />}
            color="#8b5cf6"
          />

          {/* Type breakdown mini cards */}
          {Object.entries(stats.by_type).map(([type, count]) => {
            const tc = typeColors[type] || {
              bg: "rgba(148,163,184,0.15)",
              text: "#94a3b8",
              icon: null,
            };
            return (
              <StatCard
                key={type}
                label={type.toUpperCase()}
                value={formatNumber(count)}
                icon={tc.icon || <Database size={18} />}
                color={tc.text}
              />
            );
          })}
        </div>
      )}

      {/* Filters & Controls */}
      <div style={styles.filterBar}>
        <div style={styles.filterGroup}>
          <select
            style={styles.select}
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
          >
            <option value="">全部类型</option>
            <option value="llm">LLM</option>
            <option value="embedding">Embedding</option>
            <option value="crawler">Crawler</option>
          </select>

          <input
            style={styles.input}
            type="text"
            placeholder="来源 (如 openai, scopus...)"
            value={filterSource}
            onChange={(e) => setFilterSource(e.target.value)}
          />

          <select
            style={styles.select}
            value={filterSuccess}
            onChange={(e) => setFilterSuccess(e.target.value)}
          >
            <option value="">全部状态</option>
            <option value="true">✓ 成功</option>
            <option value="false">✗ 失败</option>
          </select>
        </div>

        <div style={styles.filterGroup}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input
              type="number"
              min={1}
              max={365}
              value={cleanupDays}
              onChange={(e) => setCleanupDays(Number(e.target.value))}
              style={{ ...styles.input, width: 60, textAlign: "center" }}
            />
            <span
              style={{ color: "#64748b", fontSize: 12, whiteSpace: "nowrap" }}
            >
              天前
            </span>
            <button
              onClick={handleCleanup}
              style={styles.cleanupBtn}
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

      {/* Table */}
      <div style={styles.tableWrapper}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}></th>
              <th style={styles.th}>时间</th>
              <th style={styles.th}>类型</th>
              <th style={styles.th}>来源</th>
              <th style={styles.th}>模型</th>
              <th style={styles.th}>状态</th>
              <th style={styles.th}>延迟</th>
              <th style={styles.th}>Token 入</th>
              <th style={styles.th}>Token 出</th>
              <th style={styles.th}>调用者</th>
            </tr>
          </thead>
          <tbody>
            {loading && logs.length === 0 ? (
              <tr>
                <td
                  colSpan={10}
                  style={{
                    ...styles.td,
                    textAlign: "center",
                    padding: 40,
                    color: "#64748b",
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
                    ...styles.td,
                    textAlign: "center",
                    padding: 40,
                    color: "#64748b",
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
                      ...styles.tr,
                      backgroundColor:
                        expandedId === log.id
                          ? "rgba(99, 102, 241, 0.06)"
                          : undefined,
                      cursor: "pointer",
                    }}
                    onClick={() =>
                      setExpandedId(expandedId === log.id ? null : log.id)
                    }
                  >
                    <td style={styles.td}>
                      {expandedId === log.id ? (
                        <ChevronDown size={14} color="#64748b" />
                      ) : (
                        <ChevronRight size={14} color="#64748b" />
                      )}
                    </td>
                    <td
                      style={{
                        ...styles.td,
                        fontFamily: "monospace",
                        fontSize: 12,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {formatTime(log.created_at)}
                    </td>
                    <td style={styles.td}>
                      <TypeBadge type={log.call_type} />
                    </td>
                    <td
                      style={{
                        ...styles.td,
                        color: "#cbd5e1",
                        fontWeight: 500,
                      }}
                    >
                      {log.source}
                    </td>
                    <td
                      style={{
                        ...styles.td,
                        color: "#94a3b8",
                        fontSize: 12,
                        maxWidth: 180,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {log.model || "-"}
                    </td>
                    <td style={styles.td}>
                      <StatusBadge
                        success={log.success}
                        statusCode={log.status_code}
                      />
                    </td>
                    <td
                      style={{
                        ...styles.td,
                        fontFamily: "monospace",
                        fontSize: 12,
                        color: getDurationColor(log.duration_ms),
                      }}
                    >
                      {formatDuration(log.duration_ms)}
                    </td>
                    <td
                      style={{
                        ...styles.td,
                        fontFamily: "monospace",
                        fontSize: 12,
                        color: "#94a3b8",
                      }}
                    >
                      {log.tokens_in != null
                        ? formatNumber(log.tokens_in)
                        : "-"}
                    </td>
                    <td
                      style={{
                        ...styles.td,
                        fontFamily: "monospace",
                        fontSize: 12,
                        color: "#94a3b8",
                      }}
                    >
                      {log.tokens_out != null
                        ? formatNumber(log.tokens_out)
                        : "-"}
                    </td>
                    <td
                      style={{
                        ...styles.td,
                        color: "#64748b",
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
                      <td colSpan={10} style={styles.expandedCell}>
                        <div style={styles.detailGrid}>
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
                            <div style={styles.errorBox}>
                              <strong style={{ color: "#fca5a5" }}>
                                Error:{" "}
                              </strong>
                              {log.error}
                            </div>
                          )}
                          {log.metadata_json &&
                            Object.keys(log.metadata_json).length > 0 && (
                              <div style={styles.metadataBox}>
                                <strong
                                  style={{
                                    color: "#94a3b8",
                                    marginBottom: 4,
                                    display: "block",
                                  }}
                                >
                                  Metadata:
                                </strong>
                                <pre style={styles.pre}>
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
        <div style={styles.pagination}>
          <span style={{ color: "#64748b", fontSize: 13 }}>
            共 {total} 条 · 第 {page}/{totalPages} 页
          </span>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              style={styles.pageBtn}
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              ‹ 上一页
            </button>
            <button
              style={styles.pageBtn}
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              下一页 ›
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ───────── Sub-components ───────── */

function StatCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <div style={styles.statCard}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            backgroundColor: `${color}18`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {icon}
        </div>
        <div>
          <div style={{ fontSize: 11, color: "#64748b", marginBottom: 2 }}>
            {label}
          </div>
          <div
            style={{
              fontSize: 18,
              fontWeight: 700,
              color: "#e2e8f0",
              fontFamily: "monospace",
            }}
          >
            {value}
          </div>
        </div>
      </div>
    </div>
  );
}

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
          backgroundColor: "rgba(16, 185, 129, 0.15)",
          color: "#10b981",
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
        backgroundColor: "rgba(244, 63, 94, 0.15)",
        color: "#f43f5e",
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
      <span style={{ color: "#64748b", fontSize: 11 }}>{label}: </span>
      <span
        style={{
          color: "#cbd5e1",
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

function getDurationColor(ms: number | null): string {
  if (ms == null) return "#64748b";
  if (ms < 1000) return "#10b981";
  if (ms < 5000) return "#f59e0b";
  return "#f43f5e";
}

/* ───────── Styles ───────── */
const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: "24px 32px",
    maxWidth: 1200,
    margin: "0 auto",
    height: "100%",
    display: "flex",
    flexDirection: "column",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(99, 102, 241, 0.1)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 20,
    fontWeight: 700,
    color: "#e2e8f0",
    margin: 0,
  },
  subtitle: {
    fontSize: 13,
    color: "#94a3b8",
    margin: "2px 0 0 0",
  },
  refreshBtn: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "8px 16px",
    borderRadius: 8,
    border: "1px solid rgba(148, 163, 184, 0.2)",
    backgroundColor: "transparent",
    color: "#94a3b8",
    fontSize: 13,
    cursor: "pointer",
  },

  /* Stats */
  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
    gap: 12,
    marginBottom: 20,
  },
  statCard: {
    backgroundColor: "rgba(30, 41, 59, 0.6)",
    borderRadius: 10,
    padding: "14px 16px",
    border: "1px solid rgba(148, 163, 184, 0.08)",
  },

  /* Filters */
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
    border: "1px solid rgba(148, 163, 184, 0.2)",
    backgroundColor: "rgba(30, 41, 59, 0.8)",
    color: "#cbd5e1",
    fontSize: 13,
    outline: "none",
    cursor: "pointer",
  },
  input: {
    padding: "7px 12px",
    borderRadius: 8,
    border: "1px solid rgba(148, 163, 184, 0.2)",
    backgroundColor: "rgba(30, 41, 59, 0.8)",
    color: "#cbd5e1",
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
    border: "1px solid rgba(244, 63, 94, 0.3)",
    backgroundColor: "rgba(244, 63, 94, 0.08)",
    color: "#f43f5e",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    whiteSpace: "nowrap" as const,
  },

  /* Table */
  tableWrapper: {
    flex: 1,
    overflow: "auto",
    borderRadius: 12,
    border: "1px solid rgba(148, 163, 184, 0.1)",
    backgroundColor: "rgba(15, 23, 42, 0.5)",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse" as const,
    fontSize: 13,
  },
  th: {
    textAlign: "left" as const,
    padding: "10px 12px",
    color: "#64748b",
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase" as const,
    borderBottom: "1px solid rgba(148, 163, 184, 0.1)",
    position: "sticky" as const,
    top: 0,
    backgroundColor: "rgba(15, 23, 42, 0.95)",
    whiteSpace: "nowrap" as const,
  },
  tr: {
    borderBottom: "1px solid rgba(148, 163, 184, 0.05)",
    transition: "background-color 0.15s",
  },
  td: {
    padding: "8px 12px",
    verticalAlign: "middle" as const,
  },
  expandedCell: {
    padding: "0 12px 12px 36px",
    backgroundColor: "rgba(99, 102, 241, 0.03)",
  },
  detailGrid: {
    padding: "12px 16px",
    backgroundColor: "rgba(30, 41, 59, 0.5)",
    borderRadius: 8,
    border: "1px solid rgba(148, 163, 184, 0.08)",
  },
  errorBox: {
    marginTop: 8,
    padding: "8px 12px",
    backgroundColor: "rgba(244, 63, 94, 0.1)",
    borderRadius: 6,
    color: "#fca5a5",
    fontSize: 12,
    border: "1px solid rgba(244, 63, 94, 0.2)",
    wordBreak: "break-all" as const,
  },
  metadataBox: {
    marginTop: 8,
    padding: "8px 12px",
    backgroundColor: "rgba(30, 41, 59, 0.8)",
    borderRadius: 6,
    fontSize: 12,
    border: "1px solid rgba(148, 163, 184, 0.08)",
  },
  pre: {
    margin: 0,
    color: "#94a3b8",
    fontSize: 11,
    fontFamily: "monospace",
    whiteSpace: "pre-wrap" as const,
    wordBreak: "break-all" as const,
  },

  /* Pagination */
  pagination: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 16,
  },
  pageBtn: {
    padding: "6px 14px",
    borderRadius: 6,
    border: "1px solid rgba(148, 163, 184, 0.2)",
    backgroundColor: "transparent",
    color: "#94a3b8",
    fontSize: 13,
    cursor: "pointer",
  },
};
