import { useEffect, useMemo, useState } from "react";
import CitationGraphPanel from "./CitationGraphPanel";
import GroupManager from "./GroupManager";
import SemanticSearchDebugPanel from "./SemanticSearchDebugPanel";
import { groupsApi } from "./api/groups";
import type { LiteratureGroup } from "./types";

type PaperResponse = {
  id: number;
  title: string;
  authors?: string[];
  abstract?: string;
  publication_date?: string;
  year?: number;
  journal?: string | null;
  journal_issn?: string | null;
  venue?: string | null;
  journal_impact_factor?: number | null;
  journal_quartile?: string | null;
  indexing?: string[] | null;
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
  group_id?: number;
  include_archived?: boolean;
};

type SearchLocalResponse = {
  success: boolean;
  total: number;
  items: PaperResponse[];
  message?: string | null;
  search_context?: {
    query_keywords: string[];
    expanded_keywords: string[];
    group_keys: string[];
  };
};

type TaskStatus = "idle" | "running" | "done" | "error";

type SortField = "year" | "title" | "firstAuthor" | "source" | "createdAt";
type SortOrder = "asc" | "desc";
type SourceFilter = "all" | "arxiv" | "crossref" | "semantic_scholar";

const API_BASE_URL = "http://localhost:5444";

interface LibraryPageProps {
  onGenerateReview?: (groupId: number) => void;
}

export default function LibraryPage({ onGenerateReview }: LibraryPageProps) {
  const [query, setQuery] = useState<string>("");
  const [yearFrom, setYearFrom] = useState<string>("");
  const [yearTo, setYearTo] = useState<string>("");
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(20);

  const [total, setTotal] = useState<number>(0);
  const [items, setItems] = useState<PaperResponse[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [taskStatus, setTaskStatus] = useState<TaskStatus>("idle");
  const [taskMessage, setTaskMessage] = useState<string>("");

  const [selectedPaperId, setSelectedPaperId] = useState<number | null>(null);
  const [selectedPaperTitle, setSelectedPaperTitle] = useState<string>("");
  const [downloadingIds, setDownloadingIds] = useState<Set<number>>(new Set());
  const [enrichingIds, setEnrichingIds] = useState<Set<number>>(new Set());

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [deleting, setDeleting] = useState<boolean>(false);
  const [archiving, setArchiving] = useState<boolean>(false);
  const [restoring, setRestoring] = useState<boolean>(false);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [analyzing, setAnalyzing] = useState<boolean>(false);
  const [removingFromGroup, setRemovingFromGroup] = useState<boolean>(false);
  const [showRagDebug, setShowRagDebug] = useState(false);
  const [showGroupManager, setShowGroupManager] = useState(false);
  const [showAddToGroupModal, setShowAddToGroupModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [groups, setGroups] = useState<LiteratureGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [searchContext, setSearchContext] =
    useState<SearchLocalResponse["search_context"]>(undefined);
  const [message, setMessage] = useState<{
    text: string;
    type: "success" | "error" | "info";
  } | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState<{
    show: boolean;
    count: number;
  }>({
    show: false,
    count: 0,
  });

  const handleUploadPdf = async (file: File) => {
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(`${API_BASE_URL}/api/papers/upload`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Upload failed");
      }

      const result = await response.json();
      alert(
        `上传成功！\n识别 DOI: ${result.doi || "无"}\n标题: ${result.title}`,
      );
      setShowUploadModal(false);
      // 刷新列表
      setPage(1);
      // 触发重新加载 (依赖项变化)
      setTotal((prev) => prev + 1);
      // 注意：这里最好调用 fetchData()，但如果 fetchData 是在 useEffect 中定义的，可能无法直接调用。
      // 我们可以通过修改依赖项来触发。或者假设 fetchData 在外部定义。
      // 既然 grep 找到了 fetchData，我们尝试直接调用它，如果它是在 useEffect 内部定义的，这会报错。
      // 为了安全，我们先假设它是在组件作用域内定义的（通常是这样）。
      // 如果报错，我们再修。
      // 实际上，通常 fetchData 是定义在组件内的。
      // 让我们先不调用 fetchData，而是通过改变一个 dummy state 来触发 useEffect?
      // 或者更直接地，我们查看一下 fetchData 的定义位置。
      // 算了，直接用 window.location.reload() 最稳妥作为 fallback，或者 just alert.
      // 更好的方式是：
      window.location.reload();
    } catch (error: unknown) {
      console.error("Upload error:", error);
      const errorMessage = error instanceof Error ? error.message : "未知错误";
      alert(`上传失败: ${errorMessage}`);
    } finally {
      setUploading(false);
    }
  };

  useEffect(() => {
    groupsApi
      .getGroups()
      .then((data) => setGroups(data.groups))
      .catch(console.error);
  }, [showGroupManager]); // Refresh groups when manager closes/updates

  const logInteraction = async (paperId: number, action: string) => {
    try {
      await fetch(`${API_BASE_URL}/api/recall-logs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_type: "click",
          source: "library_page",
          paper_id: paperId,
          group_keys: searchContext?.group_keys,
          query_keywords: searchContext?.query_keywords,
          extra: {
            action,
            expanded_keywords: searchContext?.expanded_keywords,
          },
        }),
      });
    } catch (e) {
      console.error("Failed to log interaction", e);
    }
  };

  const handleToggleSelect = (id: number) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const handleSelectAll = () => {
    if (selectedIds.size === items.length && items.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items.map((p) => p.id)));
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    setShowConfirmModal({ show: true, count: selectedIds.size });
  };

  const executeDelete = async () => {
    setDeleting(true);
    try {
      const resp = await fetch(`${API_BASE_URL}/api/papers/batch-delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paper_ids: Array.from(selectedIds) }),
      });

      if (!resp.ok) {
        throw new Error("删除失败");
      }

      const data = await resp.json();
      setMessage({
        text: `成功删除 ${data.deleted_count} 篇文献`,
        type: "success",
      });
      setTimeout(() => setMessage(null), 3000);
      setSelectedIds(new Set());
      fetchData({ resetPage: false });
    } catch (err) {
      console.error(err);
      setMessage({ text: "删除出错", type: "error" });
      setTimeout(() => setMessage(null), 3000);
    } finally {
      setDeleting(false);
      setShowConfirmModal({ show: false, count: 0 });
    }
  };

  const handleArchiveSelected = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`确定要归档选中的 ${selectedIds.size} 篇文献吗？`)) {
      return;
    }

    setArchiving(true);
    try {
      const resp = await fetch(`${API_BASE_URL}/api/papers/archive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paper_ids: Array.from(selectedIds) }),
      });

      if (!resp.ok) {
        throw new Error("归档失败");
      }

      const data = await resp.json();
      alert(`成功归档 ${data.count} 篇文献`);
      setSelectedIds(new Set());
      fetchData({ resetPage: false });
    } catch (err) {
      console.error(err);
      alert("归档出错");
    } finally {
      setArchiving(false);
    }
  };

  const handleRestoreSelected = async () => {
    if (selectedIds.size === 0) return;

    setRestoring(true);
    try {
      const resp = await fetch(`${API_BASE_URL}/api/papers/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paper_ids: Array.from(selectedIds) }),
      });

      if (!resp.ok) {
        throw new Error("恢复失败");
      }

      const data = await resp.json();
      alert(`成功恢复 ${data.count} 篇文献`);
      setSelectedIds(new Set());
      fetchData({ resetPage: false });
    } catch (err) {
      console.error(err);
      alert("恢复出错");
    } finally {
      setRestoring(false);
    }
  };

  const handleSyncCitationsSelected = async () => {
    if (selectedIds.size === 0) return;

    setSyncing(true);
    try {
      const resp = await fetch(`${API_BASE_URL}/api/citations/sync-batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paper_ids: Array.from(selectedIds) }),
      });

      if (!resp.ok) {
        throw new Error("同步请求失败");
      }

      const data = await resp.json();
      alert(
        `同步完成\n` +
          `处理文献: ${data.processed_count}\n` +
          `匹配引用: ${data.matched_references}\n` +
          `新增关系: ${data.created_edges}`,
      );
      // Refresh to show updated citation counts if any
      fetchData({ resetPage: false });
    } catch (err) {
      console.error(err);
      alert("同步引用出错");
    } finally {
      setSyncing(false);
    }
  };

  const handleAnalyzeCitations = async () => {
    if (
      !confirm(
        "确定要对全库文献执行引用网络分析吗？这将生成新的标签（世代、影响力、聚类）。",
      )
    ) {
      return;
    }
    setAnalyzing(true);
    try {
      const resp = await fetch(
        `${API_BASE_URL}/api/citations/analysis/analyze`,
        {
          method: "POST",
        },
      );
      if (!resp.ok) throw new Error("Analysis failed");
      const data = await resp.json();
      alert(
        `分析完成\n` +
          `世代标签: ${data.generation_tags}\n` +
          `影响力标签: ${data.impact_tags}\n` +
          `聚类标签: ${data.cluster_tags}`,
      );
      // Refresh to show new tags if we display them
      fetchData({ resetPage: false });
    } catch (err) {
      console.error(err);
      alert("分析失败");
    } finally {
      setAnalyzing(false);
    }
  };

  const handleAddToGroup = async (group: LiteratureGroup) => {
    if (selectedIds.size === 0) return;
    try {
      await groupsApi.addPapersToGroup(group.id, Array.from(selectedIds));
      alert(`已将 ${selectedIds.size} 篇文献加入分组 "${group.name}"`);
      setShowAddToGroupModal(false);
      setSelectedIds(new Set()); // Optional: clear selection after adding
      // If we are currently viewing the target group, refresh to show new papers
      if (selectedGroupId === group.id) {
        fetchData({ resetPage: false });
      }
    } catch (err) {
      console.error(err);
      alert("加入分组失败");
    }
  };

  const handleRemoveFromGroup = async () => {
    if (selectedIds.size === 0 || !selectedGroupId) return;
    if (!confirm(`确定要从当前分组移除选中的 ${selectedIds.size} 篇文献吗？`))
      return;

    setRemovingFromGroup(true);
    try {
      await groupsApi.removePapersFromGroup(
        selectedGroupId,
        Array.from(selectedIds),
      );
      alert(`已从分组移除 ${selectedIds.size} 篇文献`);
      setSelectedIds(new Set());
      fetchData({ resetPage: false });
    } catch (err) {
      console.error(err);
      alert("移除失败");
    } finally {
      setRemovingFromGroup(false);
    }
  };

  const handleDownloadPdf = async (paperId: number) => {
    setDownloadingIds((prev) => new Set(prev).add(paperId));
    try {
      const resp = await fetch(
        `${API_BASE_URL}/api/papers/${paperId}/download-pdf`,
        {
          method: "POST",
        },
      );
      if (!resp.ok) throw new Error("Download failed");

      // Refresh data to update PDF status
      // We don't reset page, just refresh current view
      await fetchData({ resetPage: false });
      alert("PDF 下载任务已启动，请稍后刷新查看");
    } catch (err) {
      console.error(err);
      alert("下载请求失败");
    } finally {
      setDownloadingIds((prev) => {
        const next = new Set(prev);
        next.delete(paperId);
        return next;
      });
    }
  };

  const handleEnrichJournalInfo = async (paper: PaperResponse) => {
    setEnrichingIds((prev) => new Set(prev).add(paper.id));
    try {
      const resp = await fetch(
        `${API_BASE_URL}/api/journal-info/enrich-paper/${paper.id}`,
        {
          method: "POST",
        },
      );

      const data = await resp.json().catch(() => null);

      if (!resp.ok) {
        throw new Error(data?.detail || data?.message || "期刊信息增强失败");
      }

      setMessage({
        text: data?.message || `已处理《${paper.title}》的期刊信息增强请求`,
        type: "success",
      });
      setTimeout(() => setMessage(null), 3000);

      if (data?.updated) {
        await fetchData({ resetPage: false });
      }
    } catch (err) {
      console.error(err);
      setMessage({
        text: `期刊增强失败：${(err as { message?: string })?.message || "未知错误"}`,
        type: "error",
      });
      setTimeout(() => setMessage(null), 3000);
    } finally {
      setEnrichingIds((prev) => {
        const next = new Set(prev);
        next.delete(paper.id);
        return next;
      });
    }
  };

  const canEnrichJournalInfo = (paper: PaperResponse) =>
    Boolean(paper.journal || paper.journal_issn);

  const needsJournalEnrichment = (paper: PaperResponse) =>
    !(
      paper.journal_impact_factor != null &&
      Boolean(paper.journal_quartile) &&
      Boolean(paper.indexing && paper.indexing.length > 0)
    );

  // 排序 & 筛选状态
  const [sortField, setSortField] = useState<SortField>("year");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [filterSource, setFilterSource] = useState<SourceFilter>("all");
  const [filterYearFromInput, setFilterYearFromInput] = useState<string>("");
  const [filterYearToInput, setFilterYearToInput] = useState<string>("");
  const [filterTitleInitial, setFilterTitleInitial] = useState<string>("");
  const [filterAuthorInitial, setFilterAuthorInitial] = useState<string>("");
  const [showArchived, setShowArchived] = useState<boolean>(false);

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
    // showArchived is handled in fetchData payload, not client-side filtering
  ]);

  const fetchData = async (opts?: {
    resetPage?: boolean;
    page?: number;
    pageSize?: number;
  }) => {
    try {
      setLoading(true);
      setTaskStatus("running");
      setTaskMessage("正在从本地文献库检索...");

      // 目标页优先由显式传入的 page 决定，其次是 resetPage，再其次是当前状态中的 page
      const effectivePage =
        typeof opts?.page === "number" ? opts.page : opts?.resetPage ? 1 : page;

      const effectivePageSize = opts?.pageSize ?? pageSize;
      const payload: SearchLocalRequest = {
        q: query.trim() || undefined,
        year_from: yearFrom ? Number(yearFrom) : undefined,
        year_to: yearTo ? Number(yearTo) : undefined,
        page: effectivePage,
        page_size: effectivePageSize,
        group_id: selectedGroupId || undefined,
        include_archived: showArchived,
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
      setSearchContext(data.search_context);
      setPage(effectivePage);
      setTaskStatus("done");
      setTaskMessage(
        `检索完成：共 ${data.total} 篇，当前第 ${effectivePage} / ${Math.max(
          Math.ceil((data.total || 0) / pageSize),
          1,
        )} 页`,
      );
    } catch (err) {
      console.error("search-local error", err);
      setTaskStatus("error");
      setTaskMessage(
        `检索失败：${(err as { message?: string })?.message || "未知错误"}`,
      );
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

  // Re-fetch when group selection or showArchived changes
  useEffect(() => {
    fetchData({ resetPage: true }).catch((e) =>
      console.error("group/archive change load error", e),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGroupId, showArchived]);

  const handleSearchClick = () => {
    fetchData({ resetPage: true }).catch((e) =>
      console.error("search click error", e),
    );
  };

  const handlePrevPage = () => {
    if (page <= 1 || loading) return;
    const targetPage = page - 1;
    // 直接把目标页传给 fetchData，避免依赖异步的 setPage
    fetchData({ page: targetPage }).catch((e) =>
      console.error("prev page error", e),
    );
  };

  const handleNextPage = () => {
    if (page >= totalPages || loading) return;
    const targetPage = page + 1;
    // 同理：显式传入下一页页码
    fetchData({ page: targetPage }).catch((e) =>
      console.error("next page error", e),
    );
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
          <h1>本地文献库</h1>
          <p>基于 SQLite 中已有的 Paper 记录进行检索和浏览</p>
        </div>
        <div className="page-actions">
          <button
            onClick={() => setShowGroupManager(!showGroupManager)}
            className={`action-button ${showGroupManager ? "accent" : ""}`}
          >
            {showGroupManager ? "关闭分组管理" : "分组管理"}
          </button>
          <button
            onClick={() => setShowRagDebug(!showRagDebug)}
            className={`action-button ${showRagDebug ? "accent" : ""}`}
          >
            {showRagDebug ? "关闭 RAG 调试" : "RAG 调试"}
          </button>
          <button
            onClick={handleAnalyzeCitations}
            disabled={analyzing}
            className={`action-button ${analyzing ? "accent" : ""}`}
          >
            {analyzing ? "分析中..." : "引用网络分析"}
          </button>
          <button
            onClick={() => fetchData({ resetPage: false })}
            className="action-button"
            title="刷新当前列表"
          >
            🔄 刷新
          </button>
          <button
            onClick={() => setShowUploadModal(true)}
            className="action-button primary"
          >
            上传 PDF
          </button>
          {selectedIds.size > 0 && (
            <>
              <button
                onClick={() => setShowAddToGroupModal(true)}
                className="action-button"
              >
                加入分组
              </button>
              {selectedGroupId && (
                <button
                  onClick={handleRemoveFromGroup}
                  disabled={removingFromGroup}
                  className="action-button warning"
                >
                  {removingFromGroup ? "移除中..." : "从分组移除"}
                </button>
              )}
              {selectedGroupId && onGenerateReview && (
                <button
                  onClick={() => onGenerateReview(selectedGroupId)}
                  className="action-button accent"
                >
                  ✨ 基于此分组生成综述
                </button>
              )}
              <button
                onClick={handleSyncCitationsSelected}
                disabled={syncing}
                className="action-button"
              >
                {syncing ? "同步中..." : `同步引用 (${selectedIds.size})`}
              </button>
              <button
                onClick={handleDeleteSelected}
                disabled={deleting}
                className="action-button danger"
              >
                {deleting ? "删除中..." : `删除选中 (${selectedIds.size})`}
              </button>

              {!showArchived ? (
                <button
                  onClick={handleArchiveSelected}
                  disabled={archiving}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 6,
                    border: "1px solid #f59e0b",
                    backgroundColor: "rgba(245, 158, 11, 0.1)",
                    color: "#f59e0b",
                    fontSize: 12,
                    cursor: archiving ? "not-allowed" : "pointer",
                  }}
                >
                  {archiving ? "归档中..." : `归档选中 (${selectedIds.size})`}
                </button>
              ) : (
                <button
                  onClick={handleRestoreSelected}
                  disabled={restoring}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 6,
                    border: "1px solid #10b981",
                    backgroundColor: "rgba(16, 185, 129, 0.1)",
                    color: "#10b981",
                    fontSize: 12,
                    cursor: restoring ? "not-allowed" : "pointer",
                  }}
                >
                  {restoring ? "恢复中..." : `恢复选中 (${selectedIds.size})`}
                </button>
              )}
            </>
          )}
          {renderTaskBadge()}
          {message && (
            <div
              className={`status-message ${message.type}`}
              style={{
                marginLeft: 12,
                padding: "6px 12px",
                borderRadius: 6,
                fontSize: 13,
                backgroundColor:
                  message.type === "success" ? "#dcfce7" : "#fee2e2",
                color: message.type === "success" ? "#166534" : "#991b1b",
                border: `1px solid ${message.type === "success" ? "#bbf7d0" : "#fecaca"}`,
                animation: "fadeIn 0.3s ease-in-out",
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  backgroundColor:
                    message.type === "success" ? "#22c55e" : "#ef4444",
                }}
              />
              {message.text}
            </div>
          )}
        </div>
      </header>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 16,
          padding: "16px 0",
          borderBottom: "1px solid #e2e8f0",
          marginBottom: 16,
        }}
      >
        {/* Top Row: Primary Search & Group */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 12, color: "#64748b", fontWeight: 500 }}>
              分组
            </label>
            <select
              value={selectedGroupId || ""}
              onChange={(e) => {
                const val = e.target.value ? Number(e.target.value) : null;
                setSelectedGroupId(val);
              }}
              style={{
                minWidth: 140,
                height: 36,
                padding: "0 12px",
                borderRadius: 6,
                border: "1px solid #cbd5e1",
                backgroundColor: "#ffffff",
                color: "#0f172a",
                fontSize: 13,
                boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
              }}
            >
              <option value="">所有文献</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} ({g.paper_count})
                </option>
              ))}
            </select>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 4,
              flex: 1,
            }}
          >
            <label style={{ fontSize: 12, color: "#64748b", fontWeight: 500 }}>
              关键词
            </label>
            <div
              style={{
                position: "relative",
                display: "flex",
                alignItems: "center",
              }}
            >
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜索标题、摘要、作者..."
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
              {query.trim() !== "" && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
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

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 12, color: "#64748b", fontWeight: 500 }}>
              年份范围
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                value={yearFrom}
                onChange={(e) => setYearFrom(e.target.value)}
                placeholder="2015"
                type="number"
                style={{
                  width: 80,
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
                  width: 80,
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
            }}
          >
            {loading ? "检索中..." : "检索"}
          </button>
        </div>

        {/* Bottom Row: Secondary Filters */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <label style={{ fontSize: 12, color: "#64748b" }}>排序:</label>
            <select
              value={sortField}
              onChange={(e) => setSortField(e.target.value as SortField)}
              style={{
                height: 30,
                padding: "0 8px",
                borderRadius: 6,
                border: "1px solid #e2e8f0",
                backgroundColor: "transparent",
                color: "#475569",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              <option value="year">年份</option>
              <option value="title">标题</option>
              <option value="firstAuthor">第一作者</option>
              <option value="source">来源</option>
              <option value="createdAt">添加时间</option>
            </select>
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as SortOrder)}
              style={{
                height: 30,
                padding: "0 8px",
                borderRadius: 6,
                border: "1px solid #e2e8f0",
                backgroundColor: "transparent",
                color: "#475569",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              <option value="desc">降序</option>
              <option value="asc">升序</option>
            </select>
          </div>

          <div style={{ width: 1, height: 20, backgroundColor: "#e2e8f0" }} />

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <label style={{ fontSize: 12, color: "#64748b" }}>来源:</label>
            <select
              value={filterSource}
              onChange={(e) => setFilterSource(e.target.value as SourceFilter)}
              style={{
                height: 30,
                padding: "0 8px",
                borderRadius: 6,
                border: "1px solid #e2e8f0",
                backgroundColor: "transparent",
                color: "#475569",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              <option value="all">全部</option>
              <option value="arxiv">arXiv</option>
              <option value="crossref">CrossRef</option>
              <option value="semantic_scholar">Semantic Scholar</option>
            </select>
          </div>

          <div style={{ width: 1, height: 20, backgroundColor: "#e2e8f0" }} />

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <label style={{ fontSize: 12, color: "#64748b" }}>本地年份:</label>
            <input
              value={filterYearFromInput}
              onChange={(e) => setFilterYearFromInput(e.target.value)}
              placeholder="2015"
              type="number"
              style={{
                width: 60,
                height: 30,
                padding: "0 8px",
                borderRadius: 6,
                border: "1px solid #e2e8f0",
                backgroundColor: "transparent",
                color: "#475569",
                fontSize: 12,
              }}
            />
            <span style={{ color: "#cbd5e1" }}>-</span>
            <input
              value={filterYearToInput}
              onChange={(e) => setFilterYearToInput(e.target.value)}
              placeholder="2025"
              type="number"
              style={{
                width: 60,
                height: 30,
                padding: "0 8px",
                borderRadius: 6,
                border: "1px solid #e2e8f0",
                backgroundColor: "transparent",
                color: "#475569",
                fontSize: 12,
              }}
            />
          </div>

          <div style={{ width: 1, height: 20, backgroundColor: "#e2e8f0" }} />

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <label style={{ fontSize: 12, color: "#64748b" }}>首字母:</label>
            <input
              value={filterTitleInitial}
              onChange={(e) => setFilterTitleInitial(e.target.value)}
              placeholder="标题..."
              maxLength={1}
              style={{
                width: 60,
                height: 30,
                padding: "0 8px",
                borderRadius: 6,
                border: "1px solid #e2e8f0",
                backgroundColor: "transparent",
                color: "#475569",
                fontSize: 12,
              }}
            />
            <input
              value={filterAuthorInitial}
              onChange={(e) => setFilterAuthorInitial(e.target.value)}
              placeholder="作者..."
              maxLength={1}
              style={{
                width: 60,
                height: 30,
                padding: "0 8px",
                borderRadius: 6,
                border: "1px solid #e2e8f0",
                backgroundColor: "transparent",
                color: "#475569",
                fontSize: 12,
              }}
            />
          </div>

          <div style={{ flex: 1 }} />

          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              cursor: "pointer",
              fontSize: 12,
              color: "#64748b",
            }}
          >
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              style={{ cursor: "pointer" }}
            />
            显示归档
          </label>
        </div>
      </div>
      <section className="data-table-container">
        <div className="table-header-info">
          <span>共 {total} 篇文献</span>
          <span>
            第 {page} / {totalPages} 页
          </span>
        </div>

        <div className="data-table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 40, textAlign: "center" }}>
                  <input
                    type="checkbox"
                    checked={
                      items.length > 0 && selectedIds.size === items.length
                    }
                    onChange={handleSelectAll}
                    style={{ cursor: "pointer" }}
                  />
                </th>
                <th>标题</th>
                <th style={{ width: 160 }}>作者</th>
                <th style={{ width: 80 }}>年份</th>
                <th style={{ width: 120 }}>来源</th>
                <th style={{ width: 100 }}>期刊信息</th>
                <th style={{ width: 120 }}>链接</th>
                <th style={{ width: 100 }}>引用图</th>
              </tr>
            </thead>
            <tbody>
              {filteredAndSortedItems.length === 0 && !loading && (
                <tr>
                  <td
                    colSpan={6}
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
                <tr key={p.id}>
                  <td style={{ textAlign: "center" }}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(p.id)}
                      onChange={() => handleToggleSelect(p.id)}
                      style={{ cursor: "pointer" }}
                    />
                  </td>
                  <td>
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
                        onClick={() => logInteraction(p.id, "click_title")}
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
                          className="paper-abstract"
                          style={{ fontSize: 12 }}
                        >
                          {p.abstract}
                        </span>
                      )}
                    </div>
                  </td>
                  <td>
                    {p.authors && p.authors.length > 0
                      ? p.authors.slice(0, 3).join(", ") +
                        (p.authors.length > 3 ? " ..." : "")
                      : "-"}
                  </td>
                  <td>{p.year ?? "-"}</td>
                  <td>{p.source || "-"}</td>
                  <td>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 2,
                      }}
                    >
                      {p.journal && (
                        <span
                          style={{
                            fontSize: 11,
                            color: "#94a3b8",
                            lineHeight: 1.3,
                          }}
                          title={p.journal}
                        >
                          {p.journal}
                        </span>
                      )}
                      {p.journal_quartile && (
                        <span
                          style={{
                            display: "inline-block",
                            padding: "2px 6px",
                            borderRadius: 4,
                            backgroundColor:
                              p.journal_quartile === "Q1"
                                ? "rgba(34, 197, 94, 0.2)"
                                : p.journal_quartile === "Q2"
                                  ? "rgba(56, 189, 248, 0.2)"
                                  : "rgba(148, 163, 184, 0.2)",
                            color:
                              p.journal_quartile === "Q1"
                                ? "#4ade80"
                                : p.journal_quartile === "Q2"
                                  ? "#38bdf8"
                                  : "#94a3b8",
                            fontSize: 11,
                            fontWeight: 600,
                            width: "fit-content",
                          }}
                        >
                          {p.journal_quartile}
                        </span>
                      )}
                      {p.journal_impact_factor != null && (
                        <span style={{ fontSize: 11, color: "#cbd5e1" }}>
                          IF: {p.journal_impact_factor.toFixed(1)}
                        </span>
                      )}
                      {p.indexing && p.indexing.length > 0 && (
                        <div
                          style={{
                            display: "flex",
                            flexWrap: "wrap",
                            gap: 2,
                            marginTop: 2,
                          }}
                        >
                          {p.indexing.map((idx) => (
                            <span
                              key={idx}
                              style={{
                                fontSize: 10,
                                padding: "1px 4px",
                                borderRadius: 3,
                                backgroundColor: "rgba(139, 92, 246, 0.15)",
                                color: "#a78bfa",
                                border: "1px solid rgba(139, 92, 246, 0.3)",
                              }}
                            >
                              {idx}
                            </span>
                          ))}
                        </div>
                      )}
                      {canEnrichJournalInfo(p) && needsJournalEnrichment(p) && (
                        <button
                          type="button"
                          onClick={() => handleEnrichJournalInfo(p)}
                          disabled={enrichingIds.has(p.id)}
                          style={{
                            marginTop: 4,
                            width: "fit-content",
                            padding: "2px 6px",
                            borderRadius: 4,
                            border: "1px solid #38bdf8",
                            backgroundColor: "rgba(56, 189, 248, 0.1)",
                            color: "#38bdf8",
                            fontSize: 10,
                            cursor: enrichingIds.has(p.id)
                              ? "not-allowed"
                              : "pointer",
                            opacity: enrichingIds.has(p.id) ? 0.7 : 1,
                          }}
                        >
                          {enrichingIds.has(p.id)
                            ? "增强中..."
                            : "补全期刊信息"}
                        </button>
                      )}
                      {!p.journal_quartile &&
                        p.journal_impact_factor == null &&
                        (!p.indexing || p.indexing.length === 0) &&
                        !canEnrichJournalInfo(p) &&
                        "-"}
                    </div>
                  </td>
                  <td
                    style={{
                      padding: "8px 12px",
                      fontSize: 12,
                      color: "#9ca3af",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 4,
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

                      {p.pdf_path ? (
                        <a
                          href={`${API_BASE_URL}/api/papers/${p.id}/pdf`}
                          target="_blank"
                          rel="noreferrer"
                          onClick={() => logInteraction(p.id, "view_local_pdf")}
                          style={{
                            fontSize: 11,
                            color: "#4ade80",
                            display: "flex",
                            alignItems: "center",
                            gap: 2,
                          }}
                        >
                          <span>📄 查看 PDF</span>
                        </a>
                      ) : p.pdf_url ? (
                        <button
                          onClick={() => {
                            handleDownloadPdf(p.id);
                            logInteraction(p.id, "download_pdf");
                          }}
                          disabled={downloadingIds.has(p.id)}
                          style={{
                            background: "transparent",
                            border: "1px solid #334155",
                            borderRadius: 4,
                            color: downloadingIds.has(p.id)
                              ? "#9ca3af"
                              : "#94a3b8",
                            fontSize: 10,
                            padding: "2px 6px",
                            cursor: downloadingIds.has(p.id)
                              ? "not-allowed"
                              : "pointer",
                            width: "fit-content",
                          }}
                        >
                          {downloadingIds.has(p.id)
                            ? "下载中..."
                            : "⬇️ 下载 PDF"}
                        </button>
                      ) : null}
                    </div>
                  </td>
                  <td
                    style={{
                      padding: "8px 12px",
                      fontSize: 12,
                      color: "#9ca3af",
                    }}
                  >
                    <button
                      type="button"
                      className="link-button small"
                      onClick={() => {
                        setSelectedPaperId(p.id);
                        setSelectedPaperTitle(p.title);
                        logInteraction(p.id, "view_citations");
                      }}
                    >
                      查看引用
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div
          className="table-header-info"
          style={{
            borderTop: "1px solid var(--border-color)",
            borderBottom: "none",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ color: "var(--text-secondary)" }}>
              显示第 {(page - 1) * pageSize + 1} -{" "}
              {Math.min(page * pageSize, total)} 条
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ color: "var(--text-tertiary)" }}>每页</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  const newSize = Number(e.target.value) || 20;
                  setPage(1);
                  setPageSize(newSize);
                  fetchData({ resetPage: true, pageSize: newSize }).catch(
                    (err) => console.error("change page size error", err),
                  );
                }}
                className="filter-select"
                style={{ padding: "4px 6px", fontSize: 12 }}
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
              className="pagination-button"
            >
              上一页
            </button>
            <button
              onClick={handleNextPage}
              disabled={loading || page >= totalPages}
              className="pagination-button"
            >
              下一页
            </button>
          </div>
        </div>
        {selectedPaperId !== null && (
          <CitationGraphPanel
            paperId={selectedPaperId}
            title={selectedPaperTitle}
          />
        )}
      </section>

      {/* Group Manager Drawer */}
      {showGroupManager && (
        <div
          className="drawer-overlay"
          onClick={() => setShowGroupManager(false)}
        >
          <div className="drawer-content" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <button
                onClick={() => setShowGroupManager(false)}
                className="close-button"
              >
                ×
              </button>
            </div>
            <GroupManager />
          </div>
        </div>
      )}

      {/* Add to Group Modal */}
      {showAddToGroupModal && (
        <div
          className="modal-overlay"
          onClick={() => setShowAddToGroupModal(false)}
        >
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>选择要加入的分组</h3>
              <button
                onClick={() => setShowAddToGroupModal(false)}
                className="close-button"
              >
                ×
              </button>
            </div>
            <GroupManager onSelectGroup={handleAddToGroup} />
          </div>
        </div>
      )}

      {/* RAG Debug Drawer */}
      {showRagDebug && (
        <div className="drawer-overlay" onClick={() => setShowRagDebug(false)}>
          <div
            className="drawer-content wide"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="drawer-header">
              <button
                onClick={() => setShowRagDebug(false)}
                className="close-button"
              >
                ×
              </button>
            </div>
            <SemanticSearchDebugPanel />
          </div>
        </div>
      )}

      {/* Upload Modal */}
      {showUploadModal && (
        <div
          className="modal-overlay"
          onClick={() => !uploading && setShowUploadModal(false)}
        >
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">上传本地 PDF</h3>
            <p className="modal-description">
              系统将自动解析 PDF 内容、识别 DOI
              并尝试获取元数据。同时会生成全文向量索引以支持 RAG 问答。
            </p>

            <div style={{ marginBottom: 20 }}>
              <input
                type="file"
                accept=".pdf"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleUploadPdf(e.target.files[0]);
                  }
                }}
                disabled={uploading}
                className="file-input"
              />
            </div>

            {uploading && (
              <div className="upload-status">
                正在处理中，请稍候... (解析、OCR、向量化)
              </div>
            )}

            <div className="modal-actions">
              <button
                onClick={() => setShowUploadModal(false)}
                disabled={uploading}
                className="action-button"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {showConfirmModal.show && (
        <div
          className="modal-overlay"
          style={{
            zIndex: 9999,
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            className="modal-content"
            style={{
              maxWidth: 400,
              backgroundColor: "white",
              padding: "24px",
              borderRadius: "12px",
              boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)",
            }}
          >
            <h3 style={{ color: "#ef4444", marginTop: 0 }}>⚠️ 确认永久删除</h3>
            <p
              style={{
                margin: "16px 0",
                color: "#4b5563",
                fontSize: "14px",
                lineHeight: 1.6,
              }}
            >
              确定要删除选中的 <strong>{showConfirmModal.count}</strong>{" "}
              篇文献吗？
              <br />
              <span style={{ fontSize: "0.9em", color: "#ef4444" }}>
                ※ 此操作将从数据库和向量库中永久移除，不可恢复。
              </span>
            </p>
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 12,
                marginTop: 24,
              }}
            >
              <button
                className="action-button"
                onClick={() => setShowConfirmModal({ show: false, count: 0 })}
                disabled={deleting}
                style={{
                  padding: "8px 16px",
                  borderRadius: "6px",
                  border: "1px solid #d1d5db",
                  backgroundColor: "white",
                  cursor: "pointer",
                }}
              >
                取消
              </button>
              <button
                className="action-button danger"
                onClick={executeDelete}
                disabled={deleting}
                style={{
                  padding: "8px 16px",
                  borderRadius: "6px",
                  border: "none",
                  backgroundColor: "#ef4444",
                  color: "white",
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                {deleting ? "正在执行..." : "确认删除"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
