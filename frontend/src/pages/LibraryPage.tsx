import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import CitationGraphPanel from "../components/CitationGraphPanel";
import GroupManager from "../components/GroupManager";
import SemanticSearchDebugPanel from "../components/SemanticSearchDebugPanel";
import { groupsApi } from "../api/groups";
import { useAbortableFetch } from "../hooks/useAbortableFetch";
import type { LiteratureGroup } from "../types";

import {
  SearchFilters,
  SecondaryFilters,
  PapersTable,
  BatchActionBar,
  PdfUploadModal,
  AddToGroupModal,
  ConfirmDeleteModal,
} from "../components/library";
import type { PaperResponse, JournalInfoLookup } from "../components/library";
import { API_BASE_URL } from "../api/config";

/* ── Journal Info cache (module-level, persists across re-renders) ── */
const journalInfoCache = new Map<
  string,
  JournalInfoLookup | "loading" | "error"
>();

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

interface LibraryPageProps {
  onGenerateReview?: (groupId: number) => void;
  initialGroupId?: number;
  onNavigateToLibraryWithGroup?: (groupId: number) => void;
}

export default function LibraryPage({
  onGenerateReview,
  initialGroupId,
  onNavigateToLibraryWithGroup,
}: LibraryPageProps) {
  /* ── Primary search state ── */
  const [query, setQuery] = useState<string>("");
  const [yearFrom, setYearFrom] = useState<string>("");
  const [yearTo, setYearTo] = useState<string>("");
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(20);

  /* ── Data state ── */
  const [total, setTotal] = useState<number>(0);
  const [items, setItems] = useState<PaperResponse[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [taskStatus, setTaskStatus] = useState<TaskStatus>("idle");
  const [taskMessage, setTaskMessage] = useState<string>("");

  /* ── Selection & per-item action state ── */
  const [selectedPaperId, setSelectedPaperId] = useState<number | null>(null);
  const [selectedPaperTitle, setSelectedPaperTitle] = useState<string>("");
  const [downloadingIds, setDownloadingIds] = useState<Set<number>>(new Set());
  const [enrichingIds, setEnrichingIds] = useState<Set<number>>(new Set());

  /* ── Batch action state ── */
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [deleting, setDeleting] = useState<boolean>(false);
  const [archiving, setArchiving] = useState<boolean>(false);
  const [restoring, setRestoring] = useState<boolean>(false);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [analyzing, setAnalyzing] = useState<boolean>(false);
  const [removingFromGroup, setRemovingFromGroup] = useState<boolean>(false);

  /* ── UI toggle state ── */
  const [showRagDebug, setShowRagDebug] = useState(false);
  const [showGroupManager, setShowGroupManager] = useState(false);
  const [showAddToGroupModal, setShowAddToGroupModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);

  /* ── Groups & context ── */
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
  }>({ show: false, count: 0 });

  /* ── Journal Info Hover Tooltip state ── */
  const [hoveredJournal, setHoveredJournal] = useState<string | null>(null);
  const [journalTooltipData, setJournalTooltipData] =
    useState<JournalInfoLookup | null>(null);
  const [journalTooltipLoading, setJournalTooltipLoading] = useState(false);
  const journalHoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  /* ── Secondary filter state ── */
  const [sortField, setSortField] = useState<SortField>("year");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [filterSource, setFilterSource] = useState<SourceFilter>("all");
  const [filterYearFromInput, setFilterYearFromInput] = useState<string>("");
  const [filterYearToInput, setFilterYearToInput] = useState<string>("");
  const [filterTitleInitial, setFilterTitleInitial] = useState<string>("");
  const [filterAuthorInitial, setFilterAuthorInitial] = useState<string>("");
  const [showArchived, setShowArchived] = useState<boolean>(false);

  const { getSignal } = useAbortableFetch();

  const totalPages = total > 0 ? Math.ceil(total / pageSize) : 1;

  /* ── Local sort & filter ── */
  const filteredAndSortedItems = useMemo(() => {
    let result = [...items];

    if (filterSource !== "all") {
      result = result.filter((p) => p.source === filterSource);
    }

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

    if (filterTitleInitial.trim()) {
      const ch = filterTitleInitial.trim().toLowerCase();
      result = result.filter((p) =>
        (p.title || "").trim().toLowerCase().startsWith(ch),
      );
    }

    if (filterAuthorInitial.trim()) {
      const ch = filterAuthorInitial.trim().toLowerCase();
      result = result.filter((p) => {
        const firstAuthor =
          p.authors && p.authors.length > 0 ? p.authors[0] : "";
        return firstAuthor.trim().toLowerCase().startsWith(ch);
      });
    }

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

  /* ── Data fetching ── */
  const fetchData = useCallback(async (opts?: {
    resetPage?: boolean;
    page?: number;
    pageSize?: number;
  }) => {
    try {
      setLoading(true);
      setTaskStatus("running");
      setTaskMessage("正在从本地文献库检索...");

      const signal = getSignal();

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
        signal,
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
      if (err instanceof Error && err.name === 'AbortError') return;
      console.error("search-local error", err);
      setTaskStatus("error");
      setTaskMessage(
        `检索失败：${(err as { message?: string })?.message || "未知错误"}`,
      );
    } finally {
      setLoading(false);
    }
  }, [query, yearFrom, yearTo, page, pageSize, selectedGroupId, showArchived, getSignal]);

  const fetchDataRef = useRef(fetchData);
  fetchDataRef.current = fetchData;

  /* ── Journal hover handlers ── */
  const handleJournalMouseEnter = useCallback((journalName: string) => {
    if (journalHoverTimerRef.current) {
      clearTimeout(journalHoverTimerRef.current);
      journalHoverTimerRef.current = null;
    }
    journalHoverTimerRef.current = setTimeout(async () => {
      setHoveredJournal(journalName);

      const cached = journalInfoCache.get(journalName);
      if (cached && cached !== "loading" && cached !== "error") {
        setJournalTooltipData(cached);
        setJournalTooltipLoading(false);
        return;
      }
      if (cached === "loading") {
        setJournalTooltipLoading(true);
        return;
      }

      journalInfoCache.set(journalName, "loading");
      setJournalTooltipLoading(true);
      setJournalTooltipData(null);
      try {
        const resp = await fetch(
          `${API_BASE_URL}/api/journal-info/lookup?name=${encodeURIComponent(journalName)}`,
        );
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data: JournalInfoLookup = await resp.json();
        journalInfoCache.set(journalName, data);
        setHoveredJournal((curr) => {
          if (curr === journalName) {
            setJournalTooltipData(data);
            setJournalTooltipLoading(false);
          }
          return curr;
        });
      } catch (err) {
        console.error("Journal info lookup failed:", err);
        journalInfoCache.set(journalName, "error");
        setJournalTooltipLoading(false);
      }
    }, 400);
  }, []);

  const handleJournalMouseLeave = useCallback(() => {
    if (journalHoverTimerRef.current) {
      clearTimeout(journalHoverTimerRef.current);
      journalHoverTimerRef.current = null;
    }
    setHoveredJournal(null);
    setJournalTooltipData(null);
    setJournalTooltipLoading(false);
  }, []);

  /* ── Recall log ── */
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

  /* ── Selection handlers ── */
  const handleToggleSelect = (id: number) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  const handleSelectAll = () => {
    if (selectedIds.size === items.length && items.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items.map((p) => p.id)));
    }
  };

  /* ── Batch action handlers ── */
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
      if (!resp.ok) throw new Error("删除失败");
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
    if (!confirm(`确定要归档选中的 ${selectedIds.size} 篇文献吗？`)) return;
    setArchiving(true);
    try {
      const resp = await fetch(`${API_BASE_URL}/api/papers/archive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paper_ids: Array.from(selectedIds) }),
      });
      if (!resp.ok) throw new Error("归档失败");
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
      if (!resp.ok) throw new Error("恢复失败");
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
      if (!resp.ok) throw new Error("同步请求失败");
      const data = await resp.json();
      alert(
        `同步完成\n处理文献: ${data.processed_count}\n匹配引用: ${data.matched_references}\n新增关系: ${data.created_edges}`,
      );
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
    )
      return;
    setAnalyzing(true);
    try {
      const resp = await fetch(
        `${API_BASE_URL}/api/citations/analysis/analyze`,
        { method: "POST" },
      );
      if (!resp.ok) throw new Error("Analysis failed");
      const data = await resp.json();
      alert(
        `分析完成\n世代标签: ${data.generation_tags}\n影响力标签: ${data.impact_tags}\n聚类标签: ${data.cluster_tags}`,
      );
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
      setSelectedIds(new Set());
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

  /* ── Per-item action handlers ── */
  const handleDownloadPdf = async (paperId: number) => {
    setDownloadingIds((prev) => new Set(prev).add(paperId));
    try {
      const resp = await fetch(
        `${API_BASE_URL}/api/papers/${paperId}/download-pdf`,
        { method: "POST" },
      );
      if (!resp.ok) throw new Error("Download failed");
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
        { method: "POST" },
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

  /* ── Effects ── */
  useEffect(() => {
    groupsApi
      .getGroups()
      .then((data) => setGroups(data.groups))
      .catch(console.error);
  }, [showGroupManager]);

  useEffect(() => {
    if (initialGroupId !== undefined) {
      setSelectedGroupId(initialGroupId);
    }
  }, [initialGroupId]);

  useEffect(() => {
    fetchDataRef.current({ resetPage: true }).catch((e) =>
      console.error("initial load error", e),
    );
  }, []);

  useEffect(() => {
    fetchDataRef.current({ resetPage: true }).catch((e) =>
      console.error("group/archive change load error", e),
    );
  }, [selectedGroupId, showArchived]);

  /* ── Page navigation ── */
  const handleSearchClick = () => {
    fetchData({ resetPage: true }).catch((e) =>
      console.error("search click error", e),
    );
  };

  const handlePrevPage = () => {
    if (page <= 1 || loading) return;
    fetchData({ page: page - 1 }).catch((e) =>
      console.error("prev page error", e),
    );
  };

  const handleNextPage = () => {
    if (page >= totalPages || loading) return;
    fetchData({ page: page + 1 }).catch((e) =>
      console.error("next page error", e),
    );
  };

  /* ── Task status badge ── */
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

  /* ── Render ── */
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

          <BatchActionBar
            selectedCount={selectedIds.size}
            deleting={deleting}
            archiving={archiving}
            restoring={restoring}
            syncing={syncing}
            removingFromGroup={removingFromGroup}
            selectedGroupId={selectedGroupId}
            showArchived={showArchived}
            onDelete={handleDeleteSelected}
            onArchive={handleArchiveSelected}
            onRestore={handleRestoreSelected}
            onAddToGroup={() => setShowAddToGroupModal(true)}
            onRemoveFromGroup={handleRemoveFromGroup}
            onSyncCitations={handleSyncCitationsSelected}
            onGenerateReview={
              selectedGroupId && onGenerateReview
                ? () => onGenerateReview(selectedGroupId)
                : undefined
            }
          />

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

      {/* Search & filter area */}
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
        <SearchFilters
          query={query}
          setQuery={setQuery}
          yearFrom={yearFrom}
          setYearFrom={setYearFrom}
          yearTo={yearTo}
          setYearTo={setYearTo}
          groups={groups}
          selectedGroupId={selectedGroupId}
          onGroupChange={setSelectedGroupId}
          onSearch={handleSearchClick}
          loading={loading}
          searchContext={searchContext}
        />
        <SecondaryFilters
          sortField={sortField}
          sortOrder={sortOrder}
          filterSource={filterSource}
          filterYearFromInput={filterYearFromInput}
          filterYearToInput={filterYearToInput}
          filterTitleInitial={filterTitleInitial}
          filterAuthorInitial={filterAuthorInitial}
          showArchived={showArchived}
          onSortFieldChange={setSortField}
          onSortOrderChange={setSortOrder}
          onFilterSourceChange={setFilterSource}
          onFilterYearFromInputChange={setFilterYearFromInput}
          onFilterYearToInputChange={setFilterYearToInput}
          onFilterTitleInitialChange={setFilterTitleInitial}
          onFilterAuthorInitialChange={setFilterAuthorInitial}
          onShowArchivedChange={setShowArchived}
        />
      </div>

      {/* Data table section */}
      <section className="data-table-container">
        <div className="table-header-info">
          <span>共 {total} 篇文献</span>
          <span>
            第 {page} / {totalPages} 页
          </span>
        </div>

        <PapersTable
          items={filteredAndSortedItems}
          selectedIds={selectedIds}
          onToggleSelect={handleToggleSelect}
          onSelectAll={handleSelectAll}
          selectedPaperId={selectedPaperId}
          onSelectPaper={(id, title) => {
            setSelectedPaperId(id);
            setSelectedPaperTitle(title);
          }}
          downloadingIds={downloadingIds}
          enrichingIds={enrichingIds}
          onDownloadPdf={handleDownloadPdf}
          onEnrichJournal={handleEnrichJournalInfo}
          hoveredJournal={hoveredJournal}
          journalTooltipData={journalTooltipData}
          journalTooltipLoading={journalTooltipLoading}
          onJournalMouseEnter={handleJournalMouseEnter}
          onJournalMouseLeave={handleJournalMouseLeave}
          onLogInteraction={logInteraction}
          loading={loading}
        />

        {/* Pagination footer */}
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
            <GroupManager onNavigateToLibrary={onNavigateToLibraryWithGroup} />
          </div>
        </div>
      )}

      {/* Add to Group Modal */}
      <AddToGroupModal
        open={showAddToGroupModal}
        onClose={() => setShowAddToGroupModal(false)}
        onConfirm={handleAddToGroup}
      />

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
      <PdfUploadModal
        open={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        onUploaded={() => fetchData({ resetPage: true })}
      />

      {/* Confirmation Modal */}
      <ConfirmDeleteModal
        open={showConfirmModal.show}
        count={showConfirmModal.count}
        deleting={deleting}
        onClose={() => setShowConfirmModal({ show: false, count: 0 })}
        onConfirm={executeDelete}
      />
    </div>
  );
}
