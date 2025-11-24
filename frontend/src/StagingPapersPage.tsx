import { useEffect, useMemo, useState } from "react";

const API_BASE_URL = "http://localhost:5444";

type StagingPaper = {
  id: number;
  title: string;
  authors?: string[] | null;
  abstract?: string | null;
  year?: number | null;
  source?: string | null;
  status?: string | null;
  crawl_job_id?: number | null;
  doi?: string | null;
  arxiv_id?: string | null;
  url?: string | null;
  pdf_url?: string | null;
  created_at: string;
};

type StagingSearchRequest = {
  q?: string | null;
  status?: string | null;
  source?: string | null;
  crawl_job_id?: number | null;
  year_from?: number | null;
  year_to?: number | null;
  page: number;
  page_size: number;
};

type StagingSearchResponse = {
  success: boolean;
  total: number;
  items: StagingPaper[];
  message?: string | null;
};

type TaskStatus = "idle" | "running" | "done" | "error";

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "pending", label: "待审核" },
  { value: "accepted", label: "已提升" },
  { value: "rejected", label: "已拒绝" },
];

const SOURCE_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "arxiv", label: "arXiv" },
  { value: "crossref", label: "CrossRef" },
  { value: "scholar_serpapi", label: "Google Scholar" },
  { value: "scopus", label: "Scopus" },
];

export default function StagingPapersPage() {
  const [q, setQ] = useState<string>("");
  const [status, setStatus] = useState<string>("pending");
  const [source, setSource] = useState<string>("all");
  const [crawlJobId, setCrawlJobId] = useState<string>("");
  const [yearFrom, setYearFrom] = useState<string>("");
  const [yearTo, setYearTo] = useState<string>("");

  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(20);

  const [total, setTotal] = useState<number>(0);
  const [items, setItems] = useState<StagingPaper[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [taskStatus, setTaskStatus] = useState<TaskStatus>("idle");
  const [taskMessage, setTaskMessage] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [promoting, setPromoting] = useState<boolean>(false);
  // const [deleting, setDeleting] = useState<boolean>(false);

  const totalPages = total > 0 ? Math.ceil(total / pageSize) : 1;

  const currentPageSelectedCount = useMemo(
    () => items.filter((p) => selectedIds.includes(p.id)).length,
    [items, selectedIds],
  );

  const allCurrentSelected = items.length > 0 && currentPageSelectedCount === items.length;

  const toggleSelectAllCurrent = () => {
    if (allCurrentSelected) {
      const currentIds = items.map((p) => p.id);
      setSelectedIds((prev) => prev.filter((id) => !currentIds.includes(id)));
    } else {
      const currentIds = items.map((p) => p.id);
      setSelectedIds((prev) => Array.from(new Set([...prev, ...currentIds])));
    }
  };

  const toggleSelectOne = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const effectiveStatusValue = status === "all" ? undefined : status;
  const effectiveSourceValue = source === "all" ? undefined : source;

  const fetchData = async (opts?: { resetPage?: boolean; page?: number }) => {
    try {
      setLoading(true);
      setError(null);
      setTaskStatus("running");
      setTaskMessage("正在加载暂存文献...");

      const effectivePage =
        typeof opts?.page === "number"
          ? opts.page
          : opts?.resetPage
            ? 1
            : page;

      const payload: StagingSearchRequest = {
        q: q.trim() || undefined,
        status: effectiveStatusValue,
        source: effectiveSourceValue,
        crawl_job_id: crawlJobId ? Number(crawlJobId) : undefined,
        year_from: yearFrom ? Number(yearFrom) : undefined,
        year_to: yearTo ? Number(yearTo) : undefined,
        page: effectivePage,
        page_size: pageSize,
      };

      const resp = await fetch(`${API_BASE_URL}/api/staging-papers/search`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(
          `请求失败: ${resp.status} ${resp.statusText} - ${text}`,
        );
      }

      const data: StagingSearchResponse = await resp.json();
      setItems(data.items || []);
      setTotal(data.total ?? 0);
      setPage(effectivePage);
      setTaskStatus("done");
      setTaskMessage(
        `加载完成：共 ${data.total} 条暂存记录，当前第 ${effectivePage} / ${Math.max(
          Math.ceil((data.total || 0) / pageSize),
          1,
        )} 页`,
      );
    } catch (err) {
      console.error("staging search error", err);
      setTaskStatus("error");
      setTaskMessage(
        `加载失败：${(err as { message?: string })?.message || "未知错误"
        }`,
      );
      setError(
        (err as { message?: string })?.message ||
        "加载暂存文献时出现错误",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData({ resetPage: true }).catch((e) =>
      console.error("initial staging load error", e),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearchClick = () => {
    fetchData({ resetPage: true }).catch((e) =>
      console.error("staging search click error", e),
    );
  };

  const handlePrevPage = () => {
    if (page <= 1 || loading) return;
    const targetPage = page - 1;
    fetchData({ page: targetPage }).catch((e) =>
      console.error("staging prev page error", e),
    );
  };

  const handleNextPage = () => {
    if (page >= totalPages || loading) return;
    const targetPage = page + 1;
    fetchData({ page: targetPage }).catch((e) =>
      console.error("staging next page error", e),
    );
  };

  const handlePromoteSelected = async () => {
    if (selectedIds.length === 0) return;
    if (
      !window.confirm(
        `确定要将当前选中的 ${selectedIds.length} 条暂存文献提升为正式文献吗？`,
      )
    ) {
      return;
    }

    try {
      setPromoting(true);
      setTaskStatus("running");
      setTaskMessage("正在提升选中的暂存文献为正式文献...");

      const resp = await fetch(`${API_BASE_URL}/api/staging-papers/promote`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ ids: selectedIds }),
      });

      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(
          `提升失败: ${resp.status} ${resp.statusText} - ${text}`,
        );
      }

      const promoted = await resp.json();
      const count = Array.isArray(promoted) ? promoted.length : 0;
      setTaskStatus("done");
      setTaskMessage(`已成功提升 ${count} 条暂存文献为正式文献`);
      setSelectedIds([]);
      await fetchData({ page });
    } catch (err) {
      console.error("promote staging error", err);
      setTaskStatus("error");
      setTaskMessage(
        `提升失败：${(err as { message?: string })?.message || "未知错误"
        }`,
      );
      setError(
        (err as { message?: string })?.message ||
        "提升暂存文献时出现错误",
      );
    } finally {
      setPromoting(false);
    }
  };

  const renderTaskBadge = () => {
    if (taskStatus === "idle") return null;
    let color = "#64748b";
    if (taskStatus === "running") color = "#0ea5e9";
    if (taskStatus === "done") color = "#22c55e";
    if (taskStatus === "error") color = "#ef4444";

    return (
      <div
        style={{
          padding: "6px 10px",
          borderRadius: 6,
          backgroundColor: "#ffffff",
          border: `1px solid ${color}`,
          color: "#0f172a",
          fontSize: 12,
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <span
          style={{
            display: "inline-block",
            width: 8,
            height: 8,
            borderRadius: "999px",
            backgroundColor: color,
          }}
        />
        <span>{taskMessage}</span>
      </div>
    );
  };

  return (
    <div className="page-container">
      <header className="page-header">
        <div className="page-title">
          <h1>暂存文献库</h1>
          <p>审核和筛选由爬虫抓取的原始文献元数据，将合适的记录提升为正式文献</p>
        </div>
        <div className="page-actions">
          {renderTaskBadge()}
          <button
            type="button"
            onClick={handlePromoteSelected}
            disabled={selectedIds.length === 0 || promoting}
            className={`action-button ${selectedIds.length > 0 && !promoting ? "primary" : ""}`}
          >
            {promoting
              ? "正在提升..."
              : selectedIds.length === 0
                ? "选择后可提升为正式文献"
                : `提升选中 ${selectedIds.length} 条为正式文献`}
          </button>
        </div>
      </header>

      {error && (
        <div
          style={{
            padding: "8px 12px",
            borderRadius: 6,
            backgroundColor: "#451a1a",
            color: "#fecaca",
            fontSize: 12,
          }}
        >
          {error}
        </div>
      )}

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
        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 240 }}>
          <label style={{ fontSize: 12, color: "#64748b", fontWeight: 500, whiteSpace: "nowrap" }}>关键词:</label>
          <div style={{ position: "relative", display: "flex", alignItems: "center", width: "100%" }}>
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
          <label style={{ fontSize: 12, color: "#64748b", fontWeight: 500 }}>状态:</label>
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
          <label style={{ fontSize: 12, color: "#64748b", fontWeight: 500 }}>数据源:</label>
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
          <label style={{ fontSize: 12, color: "#64748b", fontWeight: 500 }}>年份:</label>
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
          <label style={{ fontSize: 12, color: "#64748b", fontWeight: 500 }}>Job ID:</label>
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
          onClick={handleSearchClick}
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

      <section className="data-table-container">
        <div className="table-header-info">
          <span>共 {total} 条暂存文献</span>
          <span>
            第 {page} / {totalPages} 页
          </span>
        </div>

        <div className="data-table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 40, textAlign: "left" }}>
                  <input
                    type="checkbox"
                    checked={allCurrentSelected}
                    onChange={toggleSelectAllCurrent}
                  />
                </th>
                <th>标题</th>
                <th style={{ width: 120 }}>来源</th>
                <th style={{ width: 80 }}>年份</th>
                <th style={{ width: 100 }}>状态</th>
                <th style={{ width: 140 }}>链接</th>
                <th style={{ width: 100 }}>抓取任务</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && !loading && (
                <tr>
                  <td
                    colSpan={7}
                    style={{
                      padding: "16px 12px",
                      textAlign: "center",
                      color: "#6b7280",
                    }}
                  >
                    当前条件下没有暂存文献，可以在抓取任务完成后再来查看，或放宽过滤条件。
                  </td>
                </tr>
              )}
              {items.map((p) => {
                const checked = selectedIds.includes(p.id);
                return (
                  <tr
                    key={p.id}
                    style={{
                      borderBottom: "1px solid #e2e8f0",
                      backgroundColor: checked ? "#eff6ff" : "transparent",
                    }}
                  >
                    <td
                      style={{
                        padding: "8px 12px",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleSelectOne(p.id)}
                      />
                    </td>
                    <td
                      style={{
                        padding: "8px 12px",
                        maxWidth: 520,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 4,
                        }}
                      >
                        <a
                          href={p.pdf_url || p.url || "#"}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            color: p.pdf_url || p.url ? "#0284c7" : "#94a3b8",
                            textDecoration:
                              p.pdf_url || p.url ? "underline" : "none",
                            cursor:
                              p.pdf_url || p.url ? "pointer" : "default",
                          }}
                        >
                          {p.title}
                        </a>
                        {p.abstract && (
                          <span
                            style={{
                              fontSize: 11,
                              color: "#9ca3af",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              display: "-webkit-box",
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: "vertical",
                            }}
                          >
                            {p.abstract}
                          </span>
                        )}
                      </div>
                    </td>
                    <td
                      style={{
                        padding: "8px 12px",
                        fontSize: 12,
                        color: "#4b5563",
                      }}
                    >
                      {p.source || "-"}
                    </td>
                    <td
                      style={{
                        padding: "8px 12px",
                        fontSize: 12,
                        color: "#1f2937",
                      }}
                    >
                      {p.year ?? "-"}
                    </td>
                    <td
                      style={{
                        padding: "8px 12px",
                        fontSize: 12,
                        color:
                          p.status === "accepted"
                            ? "#4ade80"
                            : p.status === "rejected"
                              ? "#f97316"
                              : "#64748b",
                      }}
                    >
                      {p.status || "-"}
                    </td>
                    <td
                      style={{
                        padding: "8px 12px",
                        fontSize: 12,
                        color: "#9ca3af",
                      }}
                    >
                      {p.doi ? (
                        <a
                          href={`https://doi.org/${p.doi}`}
                          target="_blank"
                          rel="noreferrer"
                          style={{ color: "#0284c7" }}
                        >
                          DOI
                        </a>
                      ) : p.source === "arxiv" && p.arxiv_id ? (
                        <a
                          href={`https://arxiv.org/abs/${p.arxiv_id}`}
                          target="_blank"
                          rel="noreferrer"
                          style={{ color: "#0284c7" }}
                        >
                          arXiv
                        </a>
                      ) : p.url ? (
                        <a
                          href={p.url}
                          target="_blank"
                          rel="noreferrer"
                          style={{ color: "#0284c7" }}
                        >
                          链接
                        </a>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td
                      style={{
                        padding: "8px 12px",
                        fontSize: 12,
                        color: "#9ca3af",
                      }}
                    >
                      {p.crawl_job_id ?? "-"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div
          style={{
            padding: "8px 12px",
            borderTop: "1px solid #e2e8f0",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ color: "#9ca3af" }}>
              显示第 {(page - 1) * pageSize + 1} -{" "}
              {Math.min(page * pageSize, total)} 条
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ color: "#6b7280" }}>每页</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  const newSize = Number(e.target.value) || 20;
                  setPage(1);
                  setPageSize(newSize);
                  fetchData({ resetPage: true }).catch((err) =>
                    console.error("change staging page size error", err),
                  );
                }}
                style={{
                  padding: "4px 6px",
                  borderRadius: 6,
                  border: "1px solid #cbd5e1",
                  backgroundColor: "#ffffff",
                  color: "#0f172a",
                  fontSize: 12,
                }}
              >
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={200}>200</option>
              </select>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={handlePrevPage}
              disabled={loading || page <= 1}
              style={{
                padding: "4px 10px",
                borderRadius: 999,
                border: "1px solid #cbd5e1",
                backgroundColor: "#ffffff",
                color: "#0f172a",
                fontSize: 12,
                cursor: loading || page <= 1 ? "default" : "pointer",
                opacity: loading || page <= 1 ? 0.5 : 1,
              }}
            >
              上一页
            </button>
            <button
              onClick={handleNextPage}
              disabled={loading || page >= totalPages}
              style={{
                padding: "4px 10px",
                borderRadius: 999,
                border: "1px solid #cbd5e1",
                backgroundColor: "#ffffff",
                color: "#0f172a",
                fontSize: 12,
                cursor:
                  loading || page >= totalPages ? "default" : "pointer",
                opacity: loading || page >= totalPages ? 0.5 : 1,
              }}
            >
              下一页
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}