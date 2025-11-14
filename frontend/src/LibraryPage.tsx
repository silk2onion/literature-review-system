import { useEffect, useMemo, useState } from "react";

type PaperResponse = {
  id: number;
  title: string;
  authors?: string[];
  abstract?: string;
  publication_date?: string;
  year?: number;
  journal?: string | null;
  venue?: string | null;
  doi?: string | null;
  arxiv_id?: string | null;
  pmid?: string | null;
  url?: string | null;
  pdf_url?: string | null;
  source?: string | null;
  categories?: string[] | null;
  keywords?: string[] | null;
  citations_count?: number | null;
  pdf_path?: string | null;
  created_at: string;
  updated_at: string;
};

type SearchLocalRequest = {
  q?: string | null;
  year_from?: number | null;
  year_to?: number | null;
  page: number;
  page_size: number;
};

type SearchLocalResponse = {
  success: boolean;
  total: number;
  items: PaperResponse[];
  message?: string | null;
};

type TaskStatus = "idle" | "running" | "done" | "error";

type SortField = "year" | "title" | "firstAuthor" | "source" | "createdAt";
type SortOrder = "asc" | "desc";
type SourceFilter = "all" | "arxiv" | "crossref";

const API_BASE_URL = "http://localhost:5444";

export default function LibraryPage() {
  const [query, setQuery] = useState<string>("urban design");
  const [yearFrom, setYearFrom] = useState<string>("2015");
  const [yearTo, setYearTo] = useState<string>("2025");
  const [page, setPage] = useState<number>(1);
  const [pageSize] = useState<number>(20);

  const [total, setTotal] = useState<number>(0);
  const [items, setItems] = useState<PaperResponse[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [taskStatus, setTaskStatus] = useState<TaskStatus>("idle");
  const [taskMessage, setTaskMessage] = useState<string>("");

  // 排序 & 筛选状态
  const [sortField, setSortField] = useState<SortField>("year");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [filterSource, setFilterSource] = useState<SourceFilter>("all");
  const [filterYearFromInput, setFilterYearFromInput] = useState<string>("");
  const [filterYearToInput, setFilterYearToInput] = useState<string>("");
  const [filterTitleInitial, setFilterTitleInitial] = useState<string>("");
  const [filterAuthorInitial, setFilterAuthorInitial] = useState<string>("");

  const totalPages = total > 0 ? Math.ceil(total / pageSize) : 1;

  // 本地排序 + 筛选后的结果
  const filteredAndSortedItems = useMemo(() => {
    let result = [...items];

    // 来源筛选
    if (filterSource !== "all") {
      result = result.filter((p) => p.source === filterSource);
    }

    // 年份筛选（独立于上面的后端 year_from/year_to，再做细化）
    const yf =
      filterYearFromInput.trim() === ""
        ? undefined
        : Number(filterYearFromInput.trim());
    const yt =
      filterYearToInput.trim() === ""
        ? undefined
        : Number(filterYearToInput.trim());

    if (Number.isFinite(yf)) {
      result = result.filter((p) => (p.year ?? 0) >= (yf as number));
    }
    if (Number.isFinite(yt)) {
      result = result.filter((p) => (p.year ?? 9999) <= (yt as number));
    }

    // 标题首字母筛选
    if (filterTitleInitial.trim()) {
      const ch = filterTitleInitial.trim().toLowerCase();
      result = result.filter((p) =>
        (p.title || "").trim().toLowerCase().startsWith(ch),
      );
    }

    // 第一作者首字母筛选
    if (filterAuthorInitial.trim()) {
      const ch = filterAuthorInitial.trim().toLowerCase();
      result = result.filter((p) => {
        const firstAuthor =
          p.authors && p.authors.length > 0 ? p.authors[0] : "";
        return firstAuthor.trim().toLowerCase().startsWith(ch);
      });
    }

    // 排序
    const getKey = (p: PaperResponse): string | number => {
      switch (sortField) {
        case "year":
          return p.year ?? 0;
        case "title":
          return (p.title || "").toLowerCase();
        case "firstAuthor": {
          const firstAuthor =
            p.authors && p.authors.length > 0 ? p.authors[0] : "";
          return firstAuthor.toLowerCase();
        }
        case "source":
          return (p.source || "").toLowerCase();
        case "createdAt":
          return p.created_at || "";
        default:
          return 0;
      }
    };

    result.sort((a, b) => {
      const dir = sortOrder === "asc" ? 1 : -1;
      const ka = getKey(a);
      const kb = getKey(b);

      if (ka < kb) return -1 * dir;
      if (ka > kb) return 1 * dir;
      return 0;
    });

    return result;
  }, [
    items,
    sortField,
    sortOrder,
    filterSource,
    filterYearFromInput,
    filterYearToInput,
    filterTitleInitial,
    filterAuthorInitial,
  ]);

  const fetchData = async (opts?: { resetPage?: boolean }) => {
    try {
      setLoading(true);
      setTaskStatus("running");
      setTaskMessage("正在从本地文献库检索...");

      const effectivePage = opts?.resetPage ? 1 : page;

      const payload: SearchLocalRequest = {
        q: query.trim() || undefined,
        year_from: yearFrom ? Number(yearFrom) : undefined,
        year_to: yearTo ? Number(yearTo) : undefined,
        page: effectivePage,
        page_size: pageSize,
      };

      const resp = await fetch(`${API_BASE_URL}/api/papers/search-local`, {
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

      const data: SearchLocalResponse = await resp.json();
      setItems(data.items || []);
      setTotal(data.total ?? 0);
      setPage(effectivePage);
      setTaskStatus("done");
      setTaskMessage(
        `检索完成：共 ${data.total} 篇，当前第 ${effectivePage} / ${Math.max(
          Math.ceil((data.total || 0) / pageSize),
          1,
        )} 页`,
      );
    } catch (err: any) {
      console.error("search-local error", err);
      setTaskStatus("error");
      setTaskMessage(`检索失败：${err?.message || "未知错误"}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData({ resetPage: true }).catch((e) =>
      console.error("initial load error", e),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearchClick = () => {
    fetchData({ resetPage: true }).catch((e) =>
      console.error("search click error", e),
    );
  };

  const handlePrevPage = () => {
    if (page <= 1 || loading) return;
    const nextPage = page - 1;
    setPage(nextPage);
    fetchData().catch((e) => console.error("prev page error", e));
  };

  const handleNextPage = () => {
    if (page >= totalPages || loading) return;
    const nextPage = page + 1;
    setPage(nextPage);
    fetchData().catch((e) => console.error("next page error", e));
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
            本地文献库
          </h1>
          <p style={{ fontSize: 13, color: "#9ca3af" }}>
            基于 SQLite 中已有的 Paper 记录进行检索和浏览
          </p>
        </div>
        {renderTaskBadge()}
      </header>

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
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="例如：urban design, generative, complexity..."
            style={{
              minWidth: 260,
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
          {loading ? "检索中..." : "检索"}
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
          <span>共 {total} 篇文献</span>
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
                    width: 160,
                  }}
                >
                  作者
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
                    width: 120,
                  }}
                >
                  链接
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredAndSortedItems.length === 0 && !loading && (
                <tr>
                  <td
                    colSpan={5}
                    style={{
                      padding: "16px 12px",
                      textAlign: "center",
                      color: "#6b7280",
                    }}
                  >
                    当前条件下没有检索到文献，可以尝试放宽关键词或年份范围。
                  </td>
                </tr>
              )}
              {filteredAndSortedItems.map((p) => (
                <tr
                  key={p.id}
                  style={{
                    borderBottom: "1px solid #0f172a",
                  }}
                >
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
                          cursor: p.pdf_url || p.url ? "pointer" : "default",
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
                    {p.authors && p.authors.length > 0
                      ? p.authors.slice(0, 3).join(", ") +
                        (p.authors.length > 3 ? " ..." : "")
                      : "-"}
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
                      color: "#9ca3af",
                    }}
                  >
                    {p.source || "-"}
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
                </tr>
              ))}
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
          <span style={{ color: "#9ca3af" }}>
            显示第 {(page - 1) * pageSize + 1} -{" "}
            {Math.min(page * pageSize, total)} 条
          </span>
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
                cursor:
                  loading || page <= 1 ? "default" : "pointer",
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