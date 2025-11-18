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
  const [deleting, setDeleting] = useState<boolean>(false);

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
        `加载失败：${
          (err as { message?: string })?.message || "未知错误"
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
        `提升失败：${
          (err as { message?: string })?.message || "未知错误"
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
          backgroundColor: "#020617",
          border: `1px solid ${color}`,
          color: "#e2e8f0",
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
    <div
      style={{
        padding: "16px 24px",
        display: "flex",
        flexDirection: "column",
        gap: 16,
        height: "100vh",
        boxSizing: "border-box",
        backgroundColor: "#020617",
        color: "#e5e7eb",
      }}
    >
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
        }}
      >
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>
            暂存文献库
          </h1>
          <p style={{ fontSize: 13, color: "#9ca3af" }}>
            审核和筛选由爬虫抓取的原始文献元数据，将合适的记录提升为正式文献
          </p>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: 8,
          }}
        >
          {renderTaskBadge()}
          <button
            type="button"
            onClick={handlePromoteSelected}
            disabled={selectedIds.length === 0 || promoting}
            style={{
              padding: "8px 16px",
              borderRadius: 999,
              border: "none",
              background:
                selectedIds.length === 0 || promoting
                  ? "#1f2937"
                  : "linear-gradient(135deg, rgba(52,211,153,0.9), rgba(16,185,129,0.9))",
              color: "#0b1120",
              fontSize: 13,
              fontWeight: 600,
              cursor:
                selectedIds.length === 0 || promoting ? "default" : "pointer",
              opacity: selectedIds.length === 0 || promoting ? 0.6 : 1,
            }}
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

      <section
        style={{
          padding: 12,
          borderRadius: 8,
          backgroundColor: "#020617",
          border: "1px solid #1f2937",
          display: "flex",
          alignItems: "flex-end",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 12, color: "#9ca3af" }}>关键词</label>
          <div style={{ position: "relative", display: "inline-block" }}>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="模糊匹配标题和摘要，例如 urban design"
              style={{
                minWidth: 260,
                padding: "6px 24px 6px 8px",
                borderRadius: 6,
                border: "1px solid #334155",
                backgroundColor: "#020617",
                color: "#e5e7eb",
                fontSize: 13,
              }}
            />
            {q.trim() !== "" && (
              <button
                type="button"
                onClick={() => setQ("")}
                style={{
                  position: "absolute",
                  right: 6,
                  top: "50%",
                  transform: "translateY(-50%)",
                  border: "none",
                  background: "transparent",
                  color: "#9ca3af",
                  cursor: "pointer",
                  fontSize: 14,
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            )}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 12, color: "#9ca3af" }}>状态</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            style={{
              width: 120,
              padding: "6px 8px",
              borderRadius: 6,
              border: "1px solid #334155",
              backgroundColor: "#020617",
              color: "#e5e7eb",
              fontSize: 13,
            }}
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 12, color: "#9ca3af" }}>数据源</label>
          <select
            value={source}
            onChange={(e) => setSource(e.target.value)}
            style={{
              width: 140,
              padding: "6px 8px",
              borderRadius: 6,
              border: "1px solid #334155",
              backgroundColor: "#020617",
              color: "#e5e7eb",
              fontSize: 13,
            }}
          >
            {SOURCE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 12, color: "#9ca3af" }}>起始年份</label>
          <input
            value={yearFrom}
            onChange={(e) => setYearFrom(e.target.value)}
            placeholder="2015"
            type="number"
            style={{
              width: 90,
              padding: "6px 8px",
              borderRadius: 6,
              border: "1px solid #334155",
              backgroundColor: "#020617",
              color: "#e5e7eb",
              fontSize: 13,
            }}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 12, color: "#9ca3af" }}>结束年份</label>
          <input
            value={yearTo}
            onChange={(e) => setYearTo(e.target.value)}
            placeholder="2025"
            type="number"
            style={{
              width: 90,
              padding: "6px 8px",
              borderRadius: 6,
              border: "1px solid #334155",
              backgroundColor: "#020617",
              color: "#e5e7eb",
              fontSize: 13,
            }}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 12, color: "#9ca3af" }}>抓取任务 ID</label>
          <input
            value={crawlJobId}
            onChange={(e) => setCrawlJobId(e.target.value)}
            placeholder="可选，例如 1"
            type="number"
            style={{
              width: 100,
              padding: "6px 8px",
              borderRadius: 6,
              border: "1px solid #334155",
              backgroundColor: "#020617",
              color: "#e5e7eb",
              fontSize: 13,
            }}
          />
        </div>

        <button
          onClick={handleSearchClick}
          disabled={loading}
          style={{
            padding: "8px 16px",
            borderRadius: 999,
            border: "none",
            background:
              "linear-gradient(135deg, rgba(56,189,248,0.9), rgba(59,130,246,0.9))",
            color: "#0b1120",
            fontSize: 13,
            fontWeight: 600,
            cursor: loading ? "default" : "pointer",
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? "检索中..." : "检索暂存文献"}
        </button>
      </section>

      <section
        style={{
          flex: 1,
          minHeight: 0,
          borderRadius: 8,
          border: "1px solid #1f2937",
          backgroundColor: "#020617",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            padding: "8px 12px",
            borderBottom: "1px solid #1f2937",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 12,
            color: "#9ca3af",
          }}
        >
          <span>共 {total} 条暂存文献</span>
          <span>
            第 {page} / {totalPages} 页
          </span>
        </div>

        <div
          style={{
            flex: 1,
            overflow: "auto",
          }}
        >
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 13,
            }}
          >
            <thead>
              <tr
                style={{
                  backgroundColor: "#020617",
                  position: "sticky",
                  top: 0,
                  zIndex: 1,
                }}
              >
                <th
                  style={{
                    textAlign: "left",
                    padding: "8px 12px",
                    borderBottom: "1px solid #1f2937",
                    fontWeight: 500,
                    color: "#9ca3af",
                    width: 40,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={allCurrentSelected}
                    onChange={toggleSelectAllCurrent}
                  />
                </th>
                <th
                  style={{
                    textAlign: "left",
                    padding: "8px 12px",
                    borderBottom: "1px solid #1f2937",
                    fontWeight: 500,
                    color: "#9ca3af",
                  }}
                >
                  标题
                </th>
                <th
                  style={{
                    textAlign: "left",
                    padding: "8px 12px",
                    borderBottom: "1px solid #1f2937",
                    fontWeight: 500,
                    color: "#9ca3af",
                    width: 120,
                  }}
                >
                  来源
                </th>
                <th
                  style={{
                    textAlign: "left",
                    padding: "8px 12px",
                    borderBottom: "1px solid #1f2937",
                    fontWeight: 500,
                    color: "#9ca3af",
                    width: 80,
                  }}
                >
                  年份
                </th>
                <th
                  style={{
                    textAlign: "left",
                    padding: "8px 12px",
                    borderBottom: "1px solid #1f2937",
                    fontWeight: 500,
                    color: "#9ca3af",
                    width: 100,
                  }}
                >
                  状态
                </th>
                <th
                  style={{
                    textAlign: "left",
                    padding: "8px 12px",
                    borderBottom: "1px solid #1f2937",
                    fontWeight: 500,
                    color: "#9ca3af",
                    width: 140,
                  }}
                >
                  链接
                </th>
                <th
                  style={{
                    textAlign: "left",
                    padding: "8px 12px",
                    borderBottom: "1px solid #1f2937",
                    fontWeight: 500,
                    color: "#9ca3af",
                    width: 100,
                  }}
                >
                  抓取任务
                </th>
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
                      borderBottom: "1px solid #0f172a",
                      backgroundColor: checked ? "#0b1120" : "transparent",
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
                            color: p.pdf_url || p.url ? "#38bdf8" : "#e5e7eb",
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
                        color: "#d1d5db",
                      }}
                    >
                      {p.source || "-"}
                    </td>
                    <td
                      style={{
                        padding: "8px 12px",
                        fontSize: 12,
                        color: "#e5e7eb",
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
                            : "#e5e7eb",
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
                          style={{ color: "#38bdf8" }}
                        >
                          DOI
                        </a>
                      ) : p.source === "arxiv" && p.arxiv_id ? (
                        <a
                          href={`https://arxiv.org/abs/${p.arxiv_id}`}
                          target="_blank"
                          rel="noreferrer"
                          style={{ color: "#38bdf8" }}
                        >
                          arXiv
                        </a>
                      ) : p.url ? (
                        <a
                          href={p.url}
                          target="_blank"
                          rel="noreferrer"
                          style={{ color: "#38bdf8" }}
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
            borderTop: "1px solid #1f2937",
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
                  border: "1px solid #334155",
                  backgroundColor: "#020617",
                  color: "#e5e7eb",
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
                border: "1px solid #334155",
                backgroundColor: "#020617",
                color: "#e5e7eb",
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
                border: "1px solid #334155",
                backgroundColor: "#020617",
                color: "#e5e7eb",
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