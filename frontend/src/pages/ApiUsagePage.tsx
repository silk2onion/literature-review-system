import React, { useEffect, useState, useCallback } from "react";
import { BarChart3, RefreshCw, Loader2 } from "lucide-react";
import { API_BASE_URL } from "../api/config";
import {
  UsageStatsPanel,
  UsageLogTable,
  UsageCleanup,
} from "../components/usage";
import type { UsageStats, UsageLog, PageResponse } from "../components/usage";

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
            border: "1px solid #FECACA",
            background: "#FEF2F2",
            color: "#DC2626",
            fontSize: 13,
          }}
        >
          {errorMsg}
        </div>
      )}

      {/* Stats Cards */}
      {stats && <UsageStatsPanel stats={stats} />}

      {/* Filters & Cleanup Controls */}
      <UsageCleanup
        filterType={filterType}
        setFilterType={setFilterType}
        filterSource={filterSource}
        setFilterSource={setFilterSource}
        filterSuccess={filterSuccess}
        setFilterSuccess={setFilterSuccess}
        cleanupDays={cleanupDays}
        setCleanupDays={setCleanupDays}
        cleaning={cleaning}
        onCleanup={handleCleanup}
      />

      {/* Log Table + Pagination */}
      <UsageLogTable
        logs={logs}
        loading={loading}
        expandedId={expandedId}
        setExpandedId={setExpandedId}
        total={total}
        totalPages={totalPages}
        page={page}
        setPage={setPage}
      />
    </div>
  );
}

/* ───────── Page-level Styles ───────── */
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
    backgroundColor: "rgba(99, 102, 241, 0.08)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 20,
    fontWeight: 700,
    color: "#1C1C1E",
    margin: 0,
  },
  subtitle: {
    fontSize: 13,
    color: "#8E8E93",
    margin: "2px 0 0 0",
  },
  refreshBtn: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "8px 16px",
    borderRadius: 8,
    border: "1px solid #D1D1D6",
    backgroundColor: "#FFFFFF",
    color: "#3C3C43",
    fontSize: 13,
    cursor: "pointer",
  },
};
