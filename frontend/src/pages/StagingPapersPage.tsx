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

  // Easter egg state
  const [easterEgg, setEasterEgg] = useState<"off" | "entering" | "on" | "exiting">("off");
  const [eggQuoteIdx, setEggQuoteIdx] = useState(0);

  const PHD_QUOTES = [
    "Reviewer 2: \"The contribution is incremental. Reject.\"",
    "导师：「这个方向不行，换一个。」\n你：「这是您上周让我换的方向。」",
    "Major Revision 的意思是：我们不想直接拒你，但你自己放弃吧。",
    "你的 h-index 是 0。你导师的猫的 h-index 也是 0。你们是同行。",
    "Dear Author, we regret to inform you that your manuscript does not meet the scope of this journal.\n第 7 封了。",
    "\"Have you tried reading more papers?\" — 你导师，每次开会",
    "你花了三个月写的 Literature Review，导师看了 30 秒说：「重写。」",
    "Scopus 返回 0 条结果。不是搜索有问题，是你的研究方向没人关心。",
    "你引用了一篇 1997 年的论文。那篇论文的作者已经转行卖保险了。",
    "投稿状态：Under Review (Day 247)。编辑可能忘了你的存在。",
    "你导师说「差不多了」的意思是：还差得多了。",
    "Conference deadline in 3 days. You have an abstract and a prayer.",
    "你以为你在做创新研究，其实 1987 年就有人做过了，而且做得更好。",
    "「这周能交初稿吗？」你导师问道。\n你打开了一个空白 Word 文档。",
    "Your paper has been cited!\n...by yourself, in your next paper.",
    "同门师兄已经发了 3 篇 SCI。你还在纠结 Research Gap 是什么。",
    "LaTeX 编译报错 147 个 warning。但 PDF 能生成。Ship it.",
    "你的 Contribution 写了一整页。Reviewer 画了个问号。",
    "博士第四年，你终于理解了你博一读的那篇论文。",
    "导师发来语音消息：「我觉得你需要更多 data。」\n你已经有 200GB 了。",
    "你在 Google Scholar 搜自己的名字。0 results.\n你导师搜了一下，47,000 results.",
    "你的论文被拒了 5 次。第 6 次终于 accept 了。\n然后你发现那个期刊 IF = 0.3。",
    "你终于约到了导师的时间。导师迟到了 40 分钟。\n看了你的 PPT 说：「下次再说吧。」",
    "室友问你博士读几年。你说：「看情况。」\n情况：第 6 年了。",
    "你写了一个很棒的 Related Work。\n导师说：「这不是 Related Work，这是 Wikipedia。」",
    "你的实验跑了 72 小时。结果出来了。\n跟 baseline 没有显著差异。",
    "你鼓起勇气问导师：「我什么时候能毕业？」\n导师笑了。只是笑了。",
    "你的 GitHub 上有 3 个 star。\n两个是你自己的小号。一个是你妈。",
    "Answer to Reviewer 2: \"We respectfully disagree.\"\n翻译：我想骂人但我不能。",
    "你终于发表了一篇论文！\n然后你发现参考文献列表拼错了三个作者名。",
  ];

  const triggerEasterEgg = () => {
    setEggQuoteIdx(Math.floor(Math.random() * PHD_QUOTES.length));
    setEasterEgg("entering");
    // After black hole animation, show content
    setTimeout(() => setEasterEgg("on"), 1800);
  };

  const dismissEasterEgg = () => {
    setEasterEgg("exiting");
    setTimeout(() => setEasterEgg("off"), 1200);
  };

  const handleSearchClick = () => {
    // Easter egg: type "404" in search
    if (q.trim() === "404") {
      triggerEasterEgg();
      return;
    }
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
            padding: "8px 16px",
            borderRadius: 0,
            backgroundColor: "#FEF2F2",
            color: "#DC2626",
            fontSize: 12,
            borderBottom: "1px solid #FECACA",
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

      {/* Easter Egg: PhD PTSD Universe */}
      {easterEgg !== "off" && (
        <>
          {/* Phase 1: Black hole entrance - page gets sucked in */}
          {easterEgg === "entering" && (
            <div style={{
              position: "fixed", inset: 0, zIndex: 9998,
              display: "flex", alignItems: "center", justifyContent: "center",
              background: "transparent", pointerEvents: "none",
            }}>
              {/* The page sucks into center */}
              <div style={{
                position: "fixed", inset: 0,
                animation: "pageSuckIn 1.5s cubic-bezier(0.55, 0, 1, 0.45) forwards",
                transformOrigin: "center center",
                background: "var(--bg-primary, #F5F5F5)",
                zIndex: 9998,
              }} />
              {/* Black hole grows from center */}
              <div style={{
                width: 0, height: 0, borderRadius: "50%",
                background: "radial-gradient(circle, #1a1a2e 0%, #000 70%)",
                boxShadow: "0 0 80px 40px rgba(99,102,241,0.3), 0 0 160px 80px rgba(0,0,0,0.8)",
                animation: "blackHoleGrow 1.8s cubic-bezier(0.25, 0, 0.2, 1) forwards",
                zIndex: 9999,
              }} />
            </div>
          )}

          {/* Phase 2: Main universe scene */}
          {easterEgg === "on" && (
            <div style={{
              position: "fixed", inset: 0, zIndex: 9999,
              background: "radial-gradient(ellipse at 30% 20%, #0f172a 0%, #020617 50%, #000 100%)",
              display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center",
              animation: "universeAppear 0.8s ease-out",
              overflow: "hidden",
            }}>
              {/* Nebula glow */}
              <div style={{
                position: "absolute", width: "60vw", height: "60vw",
                borderRadius: "50%", top: "10%", left: "-10%",
                background: "radial-gradient(circle, rgba(99,102,241,0.08) 0%, transparent 70%)",
                filter: "blur(60px)",
              }} />
              <div style={{
                position: "absolute", width: "40vw", height: "40vw",
                borderRadius: "50%", bottom: "5%", right: "-5%",
                background: "radial-gradient(circle, rgba(244,114,182,0.06) 0%, transparent 70%)",
                filter: "blur(40px)",
              }} />

              {/* Stars - static twinkling */}
              {Array.from({ length: 80 }).map((_, i) => (
                <div key={`star-${i}`} style={{
                  position: "absolute",
                  left: `${Math.random() * 100}%`,
                  top: `${Math.random() * 100}%`,
                  width: Math.random() * 2.5 + 0.5,
                  height: Math.random() * 2.5 + 0.5,
                  borderRadius: "50%",
                  background: "#fff",
                  opacity: Math.random() * 0.7 + 0.3,
                  animation: `twinkle ${Math.random() * 3 + 2}s ease-in-out ${Math.random() * 2}s infinite alternate`,
                }} />
              ))}

              {/* Falling paper titles as shooting stars */}
              {items.slice(0, 12).map((paper, i) => (
                <div key={`paper-${paper.id}`} style={{
                  position: "absolute",
                  left: `${5 + Math.random() * 90}%`,
                  top: `-5%`,
                  color: ["#fbbf24", "#60a5fa", "#a78bfa", "#f472b6", "#34d399", "#fb923c"][i % 6],
                  fontSize: 10,
                  fontWeight: 500,
                  opacity: 0,
                  whiteSpace: "nowrap",
                  animation: `shootingStar ${Math.random() * 5 + 6}s linear ${Math.random() * 4}s infinite`,
                  textShadow: "0 0 6px currentColor",
                }}>
                  {paper.title.length > 35 ? paper.title.slice(0, 35) + "..." : paper.title}
                </div>
              ))}

              {/* Central content */}
              <div style={{
                position: "relative", zIndex: 1,
                textAlign: "center", padding: "0 40px",
                animation: "quoteFloat 6s ease-in-out infinite",
                maxWidth: 580,
              }}>
                {/* Glowing icon */}
                <div style={{
                  fontSize: 56, marginBottom: 28,
                  filter: "drop-shadow(0 0 20px rgba(99,102,241,0.5))",
                  animation: "iconPulse 3s ease-in-out infinite",
                }}>
                  {["🔭", "🌌", "📡", "🛸", "🪐", "💀", "🕳️", "📜"][eggQuoteIdx % 8]}
                </div>

                {/* Quote */}
                <div style={{
                  background: "rgba(15,23,42,0.6)",
                  backdropFilter: "blur(12px)",
                  borderRadius: 16,
                  border: "1px solid rgba(148,163,184,0.1)",
                  padding: "28px 32px",
                  boxShadow: "0 0 40px rgba(99,102,241,0.08)",
                }}>
                  <p style={{
                    color: "#e2e8f0", fontSize: 19, fontWeight: 600,
                    lineHeight: 1.8, margin: "0 0 16px",
                    fontStyle: "italic", whiteSpace: "pre-line",
                  }}>
                    &ldquo;{PHD_QUOTES[eggQuoteIdx]}&rdquo;
                  </p>
                  <p style={{ color: "#475569", fontSize: 12, margin: 0 }}>
                    &mdash; The PhD Experience, {new Date().getFullYear()}
                  </p>
                </div>

                {/* Counter */}
                <p style={{
                  color: "#334155", fontSize: 11, marginTop: 20,
                  letterSpacing: "0.1em", textTransform: "uppercase",
                }}>
                  Papers in the void: {total} &nbsp;|&nbsp; Days since last acceptance: &infin;
                </p>

                {/* Exit button */}
                <button
                  onClick={dismissEasterEgg}
                  style={{
                    marginTop: 28, padding: "10px 28px",
                    borderRadius: 999, border: "1px solid rgba(148,163,184,0.2)",
                    background: "rgba(255,255,255,0.05)",
                    color: "#94a3b8", fontSize: 13, fontWeight: 500,
                    cursor: "pointer", transition: "all 0.3s",
                    backdropFilter: "blur(8px)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "rgba(255,255,255,0.12)";
                    e.currentTarget.style.color = "#e2e8f0";
                    e.currentTarget.style.borderColor = "rgba(148,163,184,0.4)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "rgba(255,255,255,0.05)";
                    e.currentTarget.style.color = "#94a3b8";
                    e.currentTarget.style.borderColor = "rgba(148,163,184,0.2)";
                  }}
                >
                  Return to reality
                </button>
              </div>
            </div>
          )}

          {/* Phase 3: Exit - screen shatters back to reality */}
          {easterEgg === "exiting" && (
            <div style={{
              position: "fixed", inset: 0, zIndex: 9999,
              background: "radial-gradient(ellipse at center, #0f172a 0%, #000 100%)",
              animation: "realityReturn 1.2s cubic-bezier(0.25, 0, 0.2, 1) forwards",
              overflow: "hidden",
            }}>
              {/* Shatter fragments */}
              {Array.from({ length: 16 }).map((_, i) => {
                const row = Math.floor(i / 4);
                const col = i % 4;
                const dx = (col - 1.5) * (Math.random() * 400 + 200);
                const dy = (row - 1.5) * (Math.random() * 400 + 200);
                const rot = (Math.random() - 0.5) * 90;
                return (
                  <div key={`frag-${i}`} style={{
                    position: "absolute",
                    left: `${col * 25}%`, top: `${row * 25}%`,
                    width: "25%", height: "25%",
                    background: `radial-gradient(circle at ${50 + (Math.random()-0.5)*30}% ${50 + (Math.random()-0.5)*30}%, #0f172a, #020617)`,
                    animation: `shatter 1s cubic-bezier(0.55, 0, 1, 0.45) forwards`,
                    animationDelay: `${i * 0.03}s`,
                    // Use CSS custom properties for the shatter target
                    ["--dx" as string]: `${dx}px`,
                    ["--dy" as string]: `${dy}px`,
                    ["--rot" as string]: `${rot}deg`,
                  }} />
                );
              })}
              {/* White flash */}
              <div style={{
                position: "absolute", inset: 0,
                background: "#fff",
                animation: "flashIn 1.2s cubic-bezier(0.25, 0, 0.2, 1) forwards",
              }} />
            </div>
          )}

          <style>{`
            @keyframes pageSuckIn {
              0% { transform: scale(1) rotate(0deg); opacity: 1; border-radius: 0; }
              60% { transform: scale(0.3) rotate(8deg); opacity: 0.6; border-radius: 50%; }
              100% { transform: scale(0) rotate(15deg); opacity: 0; border-radius: 50%; }
            }
            @keyframes blackHoleGrow {
              0% { width: 0; height: 0; opacity: 0; }
              30% { opacity: 1; }
              100% { width: 200vw; height: 200vw; opacity: 1; }
            }
            @keyframes universeAppear {
              0% { opacity: 0; }
              100% { opacity: 1; }
            }
            @keyframes twinkle {
              0% { opacity: 0.2; transform: scale(1); }
              100% { opacity: 1; transform: scale(1.3); }
            }
            @keyframes shootingStar {
              0% { transform: translateY(0) translateX(0); opacity: 0; }
              5% { opacity: 0.7; }
              95% { opacity: 0.4; }
              100% { transform: translateY(115vh) translateX(-50px); opacity: 0; }
            }
            @keyframes quoteFloat {
              0%, 100% { transform: translateY(0); }
              50% { transform: translateY(-8px); }
            }
            @keyframes iconPulse {
              0%, 100% { transform: scale(1); }
              50% { transform: scale(1.1); }
            }
            @keyframes shatter {
              0% { transform: translate(0, 0) rotate(0deg); opacity: 1; }
              100% { transform: translate(var(--dx), var(--dy)) rotate(var(--rot)); opacity: 0; }
            }
            @keyframes flashIn {
              0% { opacity: 0; }
              40% { opacity: 0; }
              70% { opacity: 1; }
              100% { opacity: 1; }
            }
          `}</style>
        </>
      )}
    </div>
  );
}
