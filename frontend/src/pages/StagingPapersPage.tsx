import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { API_BASE_URL } from "../api/config";
import { useAbortableFetch } from "../hooks/useAbortableFetch";
import {
  StagingFilters,
  StagingTable,
  StagingBatchActions,
  ConfirmModal,
} from "../components/staging";
import type {
  StagingPaper,
  StagingSearchRequest,
  StagingSearchResponse,
} from "../components/staging";

export default function StagingPapersPage() {
  const [q, setQ] = useState<string>("");
  const [status, setStatus] = useState<string>("pending");
  const [source, setSource] = useState<string>("all");
  const [screeningStage, setScreeningStage] = useState<string>("all");
  const [crawlJobId, setCrawlJobId] = useState<string>("");
  const [yearFrom, setYearFrom] = useState<string>("");
  const [yearTo, setYearTo] = useState<string>("");

  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(20);

  const [total, setTotal] = useState<number>(0);
  const [items, setItems] = useState<StagingPaper[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [taskStatus, setTaskStatus] = useState<
    "idle" | "running" | "done" | "error"
  >("idle");
  const [taskMessage, setTaskMessage] = useState("");
  const [showConfirmModal, setShowConfirmModal] = useState<{
    show: boolean;
    type: "delete" | "reject" | null;
    count: number;
  }>({ show: false, type: null, count: 0 });
  const [exclusionReasonInput, setExclusionReasonInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [promoting, setPromoting] = useState<boolean>(false);

  const { getSignal } = useAbortableFetch();

  const totalPages = total > 0 ? Math.ceil(total / pageSize) : 1;

  const currentPageSelectedCount = useMemo(
    () => items.filter((p) => selectedIds.includes(p.id)).length,
    [items, selectedIds],
  );

  const allCurrentSelected =
    items.length > 0 && currentPageSelectedCount === items.length;

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
  const effectiveScreeningStageValue =
    screeningStage === "all" ? undefined : screeningStage;

  const fetchData = useCallback(async (opts?: {
    resetPage?: boolean;
    page?: number;
    pageSize?: number;
  }) => {
    try {
      setLoading(true);
      setError(null);
      if (taskStatus !== "done" || taskMessage.includes("加载中")) {
        setTaskStatus("running");
        setTaskMessage("正在加载暂存文献...");
      }

      const signal = getSignal();

      const effectivePage =
        typeof opts?.page === "number" ? opts.page : opts?.resetPage ? 1 : page;

      const effectivePageSize = opts?.pageSize ?? pageSize;
      const payload: StagingSearchRequest = {
        q: q.trim() || undefined,
        status: effectiveStatusValue,
        source: effectiveSourceValue,
        screening_stage: effectiveScreeningStageValue,
        crawl_job_id: crawlJobId ? Number(crawlJobId) : undefined,
        year_from: yearFrom ? Number(yearFrom) : undefined,
        year_to: yearTo ? Number(yearTo) : undefined,
        page: effectivePage,
        page_size: effectivePageSize,
      };

      const resp = await fetch(`${API_BASE_URL}/api/staging-papers/search`, {
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

      const data: StagingSearchResponse = await resp.json();
      setItems(data.items || []);
      setTotal(data.total ?? 0);
      setPage(effectivePage);
      if (
        !taskMessage.includes("已永久删除") &&
        !taskMessage.includes("已标记拒绝")
      ) {
        setTaskStatus("done");
        setTaskMessage(
          `加载完成：共 ${data.total} 条暂存记录，当前第 ${effectivePage} / ${Math.max(
            Math.ceil((data.total || 0) / pageSize),
            1,
          )} 页`,
        );
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      console.error("staging search error", err);
      setTaskStatus("error");
      setTaskMessage(
        `加载失败：${(err as { message?: string })?.message || "未知错误"}`,
      );
      setError(
        (err as { message?: string })?.message || "加载暂存文献时出现错误",
      );
    } finally {
      setLoading(false);
    }
  }, [q, status, source, screeningStage, crawlJobId, yearFrom, yearTo, page, pageSize, taskStatus, taskMessage, getSignal]);

  const fetchDataRef = useRef(fetchData);
  fetchDataRef.current = fetchData;

  useEffect(() => {
    fetchDataRef.current({ resetPage: true }).catch((e) =>
      console.error("initial staging load error", e),
    );
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

    try {
      setPromoting(true);
      setTaskStatus("running");
      setTaskMessage(`正在提升 ${selectedIds.length} 条暂存文献为正式文献...`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);

      const resp = await fetch(`${API_BASE_URL}/api/staging-papers/promote`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ ids: selectedIds }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

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
        `提升失败：${(err as { message?: string })?.message || "未知错误"}`,
      );
      setError(
        (err as { message?: string })?.message || "提升暂存文献时出现错误",
      );
    } finally {
      setPromoting(false);
    }
  };

  const handleRejectSelected = async () => {
    const rejectCount = selectedIds.length;
    if (rejectCount === 0) return;

    try {
      setTaskStatus("running");
      setTaskMessage(`正在将选中的 ${rejectCount} 条暂存文献标记为已拒绝...`);

      const resp = await fetch(`${API_BASE_URL}/api/staging-papers/reject`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          ids: selectedIds,
          exclusion_reason: exclusionReasonInput.trim() || undefined,
        }),
      });

      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(
          `拒绝失败: ${resp.status} ${resp.statusText} - ${text}`,
        );
      }

      const result = await resp.json();
      console.log("Reject result:", result);
      setTaskStatus("done");
      setTaskMessage(`已标记拒绝 ${result.rejected_count} 条暂存文献`);
      setSelectedIds([]);
      setTimeout(() => setTaskMessage(""), 3000);
      await fetchData({ page });
    } catch (err) {
      console.error("reject staging error", err);
      setTaskStatus("error");
      setTaskMessage(
        `拒绝失败：${(err as { message?: string })?.message || "未知错误"}`,
      );
    }
  };

  const handleDeleteSelected = async () => {
    const deleteCount = selectedIds.length;
    if (deleteCount === 0) return;

    try {
      setTaskStatus("running");
      setTaskMessage(`正在永久删除选中的 ${deleteCount} 条暂存文献...`);

      const resp = await fetch(`${API_BASE_URL}/api/staging-papers/delete`, {
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
          `删除失败: ${resp.status} ${resp.statusText} - ${text}`,
        );
      }

      const result = await resp.json();
      console.log("Delete result:", result);
      setTaskStatus("done");
      setTaskMessage(`已永久删除 ${result.deleted_count} 条暂存文献`);
      setSelectedIds([]);
      setTimeout(() => setTaskMessage(""), 3000);
      await fetchData({ page });
    } catch (err) {
      console.error("delete staging error", err);
      setTaskStatus("error");
      setTaskMessage(
        `删除失败：${(err as { message?: string })?.message || "未知错误"}`,
      );
    }
  };

  const handlePageSizeChange = (newSize: number) => {
    setPage(1);
    setPageSize(newSize);
    fetchData({ resetPage: true, pageSize: newSize }).catch((err) =>
      console.error("change staging page size error", err),
    );
  };

  const handleConfirmAction = () => {
    if (showConfirmModal.type === "delete") handleDeleteSelected();
    else if (showConfirmModal.type === "reject") handleRejectSelected();
    setShowConfirmModal({ show: false, type: null, count: 0 });
    setExclusionReasonInput("");
  };

  return (
    <div className="page-container">
      <header className="page-header">
        <div className="page-title">
          <h1>暂存文献库</h1>
          <p>
            审核和筛选由爬虫抓取的原始文献元数据，将合适的记录提升为正式文献
          </p>
        </div>
        <StagingBatchActions
          selectedCount={selectedIds.length}
          promoting={promoting}
          taskStatus={taskStatus}
          taskMessage={taskMessage}
          onRefresh={() => fetchData({ page })}
          onDeleteClick={() =>
            setShowConfirmModal({
              show: true,
              type: "delete",
              count: selectedIds.length,
            })
          }
          onRejectClick={() =>
            setShowConfirmModal({
              show: true,
              type: "reject",
              count: selectedIds.length,
            })
          }
          onPromote={handlePromoteSelected}
        />
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

      <StagingFilters
        q={q}
        setQ={setQ}
        status={status}
        setStatus={setStatus}
        source={source}
        setSource={setSource}
        screeningStage={screeningStage}
        setScreeningStage={setScreeningStage}
        yearFrom={yearFrom}
        setYearFrom={setYearFrom}
        yearTo={yearTo}
        setYearTo={setYearTo}
        crawlJobId={crawlJobId}
        setCrawlJobId={setCrawlJobId}
        loading={loading}
        onSearch={handleSearchClick}
      />

      <StagingTable
        items={items}
        loading={loading}
        total={total}
        page={page}
        pageSize={pageSize}
        totalPages={totalPages}
        selectedIds={selectedIds}
        allCurrentSelected={allCurrentSelected}
        onToggleSelectAll={toggleSelectAllCurrent}
        onToggleSelectOne={toggleSelectOne}
        onPrevPage={handlePrevPage}
        onNextPage={handleNextPage}
        onPageSizeChange={handlePageSizeChange}
      />

      <ConfirmModal
        show={showConfirmModal.show}
        type={showConfirmModal.type}
        count={showConfirmModal.count}
        exclusionReasonInput={exclusionReasonInput}
        setExclusionReasonInput={setExclusionReasonInput}
        onCancel={() => {
          setShowConfirmModal({ show: false, type: null, count: 0 });
          setExclusionReasonInput("");
        }}
        onConfirm={handleConfirmAction}
      />
    </div>
  );
}
