import { useEffect, useState } from "react";
import { API_BASE_URL } from "../api/config";
import { PrismaStagePanel, ConfirmModal } from "../components/staging";
import type { StagingPaper } from "../components/staging";
import { useLocale } from "../hooks/useLocale";

type PrismaStageCount = {
  stage: string;
  count: number;
  excluded_count: number;
};

type ExcludedPaper = {
  id: number;
  title: string;
  score: number | null;
  reason_short: string;
};

type PrismaStats = {
  success: boolean;
  crawl_job_id?: number | null;
  total: number;
  stages: PrismaStageCount[];
  exclusion_reasons: Record<string, number>;
  excluded_papers?: ExcludedPaper[];
  search_strategy?: Record<string, unknown> | null;
};

type CrawlJobOption = {
  id: number;
  query: string;
  created_at: string;
};

const STAGE_STYLE: Record<
  string,
  { labelKey: string; icon: string; color: string; bgColor: string }
> = {
  identification: {
    labelKey: "prisma.stage.identification",
    icon: "🔍",
    color: "#6366f1",
    bgColor: "#eef2ff",
  },
  screening: {
    labelKey: "prisma.stage.screening",
    icon: "📋",
    color: "#0ea5e9",
    bgColor: "#f0f9ff",
  },
  eligibility: {
    labelKey: "prisma.stage.eligibility",
    icon: "✅",
    color: "#f59e0b",
    bgColor: "#fffbeb",
  },
  included: {
    labelKey: "prisma.stage.included",
    icon: "📎",
    color: "#22c55e",
    bgColor: "#f0fdf4",
  },
};

const NEXT_STAGE_LABEL_KEY: Record<string, string> = {
  identification: "prisma.nextStage.screening",
  screening: "prisma.nextStage.eligibility",
  eligibility: "prisma.nextStage.included",
};

export default function PrismaFlowPage() {
  const { t } = useLocale();
  const [stats, setStats] = useState<PrismaStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [crawlJobId, setCrawlJobId] = useState<string>("");
  const [crawlJobs, setCrawlJobs] = useState<CrawlJobOption[]>([]);

  // 展开的阶段面板
  const [expandedStage, setExpandedStage] = useState<string | null>(null);
  const [stagePapers, setStagePapers] = useState<StagingPaper[]>([]);
  const [stagePapersLoading, setStagePapersLoading] = useState(false);
  const [stagePapersTotal, setStagePapersTotal] = useState(0);
  const [stagePage, setStagePage] = useState(1);
  const stagePageSize = 10;
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  // 排除 modal
  const [showExcludeModal, setShowExcludeModal] = useState(false);
  const [exclusionReasonInput, setExclusionReasonInput] = useState("");
  const [exclusionTemplates, setExclusionTemplates] = useState<string[]>([]);

  // AI 筛选 modal
  const [showAIScreenModal, setShowAIScreenModal] = useState(false);
  const [aiScreenTopic, setAiScreenTopic] = useState("");
  const [aiScreening, setAiScreening] = useState(false);

  // 操作状态提示
  const [actionMsg, setActionMsg] = useState("");

  // Fetch crawl jobs + exclusion templates on mount
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/crawl/jobs?limit=50`)
      .then((r) => r.json())
      .then((data) => {
        const jobs = (data.jobs || data || []).map(
          (j: Record<string, unknown>) => ({
            id: j.id as number,
            query: (j.query as string) || t("prisma.unknownQuery"),
            created_at: (j.created_at as string) || "",
          }),
        );
        setCrawlJobs(jobs);
      })
      .catch(() => {});

    fetch(`${API_BASE_URL}/api/staging-papers/exclusion-templates`)
      .then((r) => r.json())
      .then((d) => { if (d.templates) setExclusionTemplates(d.templates); })
      .catch(() => {});
  }, []);

  const fetchStats = async () => {
    try {
      setLoading(true);
      setError(null);
      const url = crawlJobId
        ? `${API_BASE_URL}/api/staging-papers/prisma-stats?crawl_job_id=${crawlJobId}`
        : `${API_BASE_URL}/api/staging-papers/prisma-stats`;
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(t("prisma.requestFailed", { status: String(resp.status) }));
      const data: PrismaStats = await resp.json();
      setStats(data);
    } catch (err) {
      setError((err as { message?: string })?.message || t("prisma.loadFailed"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchStagePapers = async (stage: string, page: number) => {
    setStagePapersLoading(true);
    try {
      const payload: Record<string, unknown> = {
        screening_stage: stage,
        status: "pending",
        page,
        page_size: stagePageSize,
      };
      if (crawlJobId) payload.crawl_job_id = Number(crawlJobId);
      const resp = await fetch(`${API_BASE_URL}/api/staging-papers/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await resp.json();
      setStagePapers(data.items || []);
      setStagePapersTotal(data.total || 0);
    } catch {
      setStagePapers([]);
      setStagePapersTotal(0);
    } finally {
      setStagePapersLoading(false);
    }
  };

  const handleStageClick = (stage: string) => {
    if (expandedStage === stage) {
      setExpandedStage(null);
      setSelectedIds([]);
      return;
    }
    setExpandedStage(stage);
    setSelectedIds([]);
    setStagePage(1);
    fetchStagePapers(stage, 1);
  };

  const refreshAll = async () => {
    await fetchStats();
    if (expandedStage) await fetchStagePapers(expandedStage, stagePage);
  };

  // 推进到下一阶段
  const handleAdvance = async () => {
    if (selectedIds.length === 0 || !expandedStage) return;
    const nextStage = ({ identification: "screening", screening: "eligibility", eligibility: "included" } as Record<string, string>)[expandedStage];
    if (!nextStage) return;

    try {
      setActionMsg(t("prisma.advancing"));
      const resp = await fetch(`${API_BASE_URL}/api/staging-papers/batch-screening`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedIds, screening_stage: nextStage }),
      });
      const result = await resp.json();
      setActionMsg(
        t("prisma.advanced", { count: result.updated_count }) +
        (result.skipped_count > 0 ? t("prisma.advancedSkipped", { count: result.skipped_count }) : ""),
      );
      setSelectedIds([]);
      await refreshAll();
      setTimeout(() => setActionMsg(""), 3000);
    } catch (err) {
      setActionMsg(t("prisma.advanceFailed", { error: (err as { message?: string })?.message || t("prisma.unknownError") }));
    }
  };

  // 排除（拒绝）
  const handleExclude = async () => {
    if (selectedIds.length === 0) return;
    try {
      setShowExcludeModal(false);
      setActionMsg(t("prisma.excluding"));
      await fetch(`${API_BASE_URL}/api/staging-papers/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: selectedIds,
          exclusion_reason: exclusionReasonInput.trim() || undefined,
        }),
      });
      setActionMsg(t("prisma.excludedDone", { count: selectedIds.length }));
      setSelectedIds([]);
      setExclusionReasonInput("");
      await refreshAll();
      setTimeout(() => setActionMsg(""), 3000);
    } catch (err) {
      setActionMsg(t("prisma.excludeFailed", { error: (err as { message?: string })?.message || t("prisma.unknownError") }));
    }
  };

  // AI 筛选
  const handleAIScreen = async () => {
    if (!aiScreenTopic.trim()) return;
    try {
      setShowAIScreenModal(false);
      setAiScreening(true);
      setActionMsg(t("prisma.aiScreeningMsg"));
      const payload: Record<string, unknown> = { topic: aiScreenTopic.trim() };
      if (selectedIds.length > 0) {
        payload.ids = selectedIds;
      } else if (crawlJobId) {
        payload.crawl_job_ids = [Number(crawlJobId)];
      }
      const resp = await fetch(`${API_BASE_URL}/api/staging-papers/ai-screen`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await resp.json();
      setActionMsg(
        t("prisma.aiScreenComplete", { promoted: result.promoted, pending_review: result.pending_review, rejected: result.rejected }) +
          (result.pre_filtered ? t("prisma.aiScreenPreFiltered", { count: result.pre_filtered }) : ""),
      );
      setSelectedIds([]);
      await refreshAll();
      setTimeout(() => setActionMsg(""), 5000);
    } catch (err) {
      setActionMsg(t("prisma.aiScreenFailed", { error: (err as { message?: string })?.message || t("prisma.unknownError") }));
    } finally {
      setAiScreening(false);
    }
  };

  const toggleSelectOne = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const toggleSelectAll = () => {
    const pageIds = stagePapers.map((p) => p.id);
    const allSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.includes(id));
    if (allSelected) {
      setSelectedIds((prev) => prev.filter((id) => !pageIds.includes(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...pageIds])));
    }
  };

  const allCurrentSelected =
    stagePapers.length > 0 && stagePapers.every((p) => selectedIds.includes(p.id));

  const stageTotalPages = Math.max(1, Math.ceil(stagePapersTotal / stagePageSize));

  return (
    <div className="page-container">
      <header className="page-header">
        <div className="page-title">
          <h1>{t("prisma.pageTitle")}</h1>
          <p>
            {t("prisma.pageSubtitle")}
          </p>
        </div>
      </header>

      {/* Filter Bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "16px 0",
          borderBottom: "1px solid #e2e8f0",
          marginBottom: 24,
          flexWrap: "wrap",
        }}
      >
        <label style={{ fontSize: 13, color: "#64748b", fontWeight: 500 }}>
          {t("prisma.filterLabel")}
        </label>
        <select
          value={crawlJobId}
          onChange={(e) => setCrawlJobId(e.target.value)}
          style={{
            height: 36, padding: "0 8px", borderRadius: 6,
            border: "1px solid #cbd5e1", backgroundColor: "#ffffff",
            color: "#0f172a", fontSize: 13, minWidth: 280, cursor: "pointer",
          }}
        >
          <option value="">{t("prisma.allJobs")}</option>
          {crawlJobs.map((job) => (
            <option key={job.id} value={job.id}>
              #{job.id} — {job.query} ({job.created_at?.slice(0, 10) || "?"})
            </option>
          ))}
        </select>
        <button
          onClick={() => fetchStats()}
          disabled={loading}
          style={{
            height: 36, padding: "0 20px", borderRadius: 6, border: "none",
            background: "linear-gradient(180deg, #3b82f6 0%, #2563eb 100%)",
            color: "#ffffff", fontSize: 13, fontWeight: 500,
            cursor: loading ? "default" : "pointer", opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? t("common.loading") : t("prisma.query")}
        </button>
        <button
          onClick={() => fetchStats()}
          style={{
            height: 36, padding: "0 14px", borderRadius: 6,
            border: "1px solid #cbd5e1", backgroundColor: "#ffffff",
            color: "#374151", fontSize: 13, cursor: "pointer",
          }}
        >
          🔄 {t("prisma.refresh")}
        </button>
        {actionMsg && (
          <span style={{ fontSize: 12, color: "#6366f1", fontWeight: 500 }}>
            {actionMsg}
          </span>
        )}
      </div>

      {error && (
        <div
          style={{
            padding: "10px 14px", borderRadius: 6,
            backgroundColor: "#fef2f2", border: "1px solid #fecaca",
            color: "#dc2626", fontSize: 13, marginBottom: 16,
          }}
        >
          {error}
        </div>
      )}

      {stats && (
        <>
          {/* Total Count Banner */}
          <div
            style={{
              padding: "12px 20px", borderRadius: 8,
              backgroundColor: "#f8fafc", border: "1px solid #e2e8f0",
              marginBottom: 24, display: "flex", alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span style={{ fontSize: 14, color: "#475569" }}>
              {t("prisma.stagingTotal")}{" "}
              <strong style={{ color: "#0f172a", fontSize: 18 }}>{stats.total}</strong> {t("prisma.papers")}
            </span>
            {stats.crawl_job_id && (
              <span style={{ fontSize: 12, color: "#94a3b8" }}>
                {t("prisma.filterJob", { id: String(stats.crawl_job_id) })}
              </span>
            )}
          </div>

          {/* PRISMA Flow Diagram */}
          <div
            style={{
              display: "flex", flexDirection: "column", gap: 0,
              alignItems: "center", marginBottom: 32,
            }}
          >
            {stats.stages.map((stage, idx) => {
              const meta = STAGE_STYLE[stage.stage];
              if (!meta) return null;
              const isExpanded = expandedStage === stage.stage;
              return (
                <div
                  key={stage.stage}
                  style={{
                    display: "flex", flexDirection: "column",
                    alignItems: "center", width: "100%",
                  }}
                >
                  {/* Arrow */}
                  {idx > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", margin: "4px 0" }}>
                      <div style={{ width: 2, height: 20, backgroundColor: "#cbd5e1" }} />
                      <div style={{ width: 0, height: 0, borderLeft: "6px solid transparent", borderRight: "6px solid transparent", borderTop: "8px solid #cbd5e1" }} />
                    </div>
                  )}

                  {/* Stage Box - now clickable */}
                  <div
                    onClick={() => handleStageClick(stage.stage)}
                    style={{
                      display: "flex", alignItems: "stretch", width: "100%",
                      maxWidth: 700, borderRadius: 10,
                      border: `2px solid ${isExpanded ? meta.color : meta.color + "40"}`,
                      backgroundColor: meta.bgColor, overflow: "hidden",
                      cursor: "pointer", transition: "border-color 0.2s",
                    }}
                  >
                    <div style={{ width: 6, backgroundColor: meta.color, flexShrink: 0 }} />
                    <div style={{ flex: 1, padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <span style={{ fontSize: 24 }}>{meta.icon}</span>
                        <div>
                          <div style={{ fontSize: 15, fontWeight: 600, color: "#0f172a" }}>
                            {t(meta.labelKey as any)}
                          </div>
                          <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                            {stage.stage === "identification" && t("prisma.stage.identificationDesc")}
                            {stage.stage === "screening" && t("prisma.stage.screeningDesc")}
                            {stage.stage === "eligibility" && t("prisma.stage.eligibilityDesc")}
                            {stage.stage === "included" && t("prisma.stage.includedDesc")}
                          </div>
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 16, textAlign: "center" }}>
                        <div>
                          <div style={{ fontSize: 28, fontWeight: 700, color: meta.color }}>
                            {stage.count}
                          </div>
                          <div style={{ fontSize: 11, color: "#94a3b8" }}>{t("prisma.papers")}</div>
                        </div>
                        {stage.excluded_count > 0 && (
                          <div style={{ borderLeft: "1px solid #e2e8f0", paddingLeft: 16 }}>
                            <div style={{ fontSize: 16, fontWeight: 600, color: "#ef4444" }}>
                              -{stage.excluded_count}
                            </div>
                            <div style={{ fontSize: 11, color: "#ef4444" }}>{t("prisma.excluded")}</div>
                          </div>
                        )}
                        <span style={{ fontSize: 16, color: "#94a3b8", marginLeft: 8 }}>
                          {isExpanded ? "▲" : "▼"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Expanded Panel */}
                  {isExpanded && (
                    <div style={{ width: "100%", maxWidth: 700 }}>
                      <PrismaStagePanel
                        stage={stage.stage}
                        stageLabel={meta ? t(meta.labelKey as any) : stage.stage}
                        stageColor={meta.color}
                        papers={stagePapers}
                        loading={stagePapersLoading}
                        total={stagePapersTotal}
                        page={stagePage}
                        pageSize={stagePageSize}
                        totalPages={stageTotalPages}
                        selectedIds={selectedIds}
                        onToggleSelect={toggleSelectOne}
                        onToggleSelectAll={toggleSelectAll}
                        allSelected={allCurrentSelected}
                        onAdvance={handleAdvance}
                        onExclude={() => setShowExcludeModal(true)}
                        onClose={() => { setExpandedStage(null); setSelectedIds([]); }}
                        onPageChange={(p) => { setStagePage(p); fetchStagePapers(stage.stage, p); }}
                        nextStageLabel={NEXT_STAGE_LABEL_KEY[stage.stage] ? t(NEXT_STAGE_LABEL_KEY[stage.stage] as any) : undefined}
                        canAdvance={stage.stage !== "included"}
                        canRunAI={stage.stage === "identification"}
                        onRunAI={() => setShowAIScreenModal(true)}
                      />
                    </div>
                  )}

                  {/* Exclusion side note */}
                  {stage.excluded_count > 0 && !isExpanded && (
                    <div style={{ display: "flex", width: "100%", maxWidth: 700, justifyContent: "flex-end", marginTop: -8, paddingRight: 20 }}>
                      <div style={{ padding: "4px 10px", borderRadius: 6, backgroundColor: "#fef2f2", border: "1px solid #fecaca", fontSize: 11, color: "#dc2626" }}>
                        ← {t("prisma.excludedCount", { count: stage.excluded_count })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Bottom info panels — side by side */}
          {(() => {
            const hasReasons = Object.keys(stats.exclusion_reasons).length > 0;
            const hasStrategy = !!stats.search_strategy;
            const totalExcluded = hasReasons
              ? Object.values(stats.exclusion_reasons).reduce((s, v) => s + v, 0)
              : 0;
            const sortedReasons = hasReasons
              ? Object.entries(stats.exclusion_reasons).sort(([, a], [, b]) => b - a)
              : [];
            const maxCount = sortedReasons.length > 0 ? sortedReasons[0][1] : 1;

            return (
              <div style={{
                display: "flex", flexDirection: "column",
                gap: 20, marginBottom: 24,
              }}>
                {/* Exclusion Reasons — 评分分档汇总 + 论文列表 */}
                {hasReasons && (
                  <div style={{
                    borderRadius: 12, border: "1px solid #e2e8f0",
                    backgroundColor: "#fff", overflow: "hidden",
                  }}>
                    <div style={{
                      padding: "14px 20px", backgroundColor: "#fef2f2",
                      borderBottom: "1px solid #fecaca",
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                    }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: "#991b1b" }}>
                        📊 {t("prisma.exclusionDetails")}
                      </span>
                      <span style={{
                        fontSize: 12, color: "#dc2626", fontWeight: 500,
                        padding: "2px 10px", backgroundColor: "#fee2e2", borderRadius: 10,
                      }}>
                        {t("prisma.totalExcluded", { count: totalExcluded })}
                      </span>
                    </div>

                    {/* 评分分档汇总条 */}
                    <div style={{ padding: "12px 20px", borderBottom: "1px solid #f1f5f9", display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {sortedReasons.map(([label, count]) => {
                        const pct = totalExcluded > 0 ? ((count / totalExcluded) * 100).toFixed(0) : "0";
                        return (
                          <span key={label} style={{
                            padding: "4px 12px", borderRadius: 16, fontSize: 12, fontWeight: 500,
                            backgroundColor: "#fee2e2", color: "#991b1b", border: "1px solid #fecaca",
                          }}>
                            {label}: {t("prisma.reasonCount", { count, pct })}
                          </span>
                        );
                      })}
                    </div>

                    {/* 被排除论文 — 气泡卡片列表 */}
                    {(stats.excluded_papers ?? []).length > 0 && (
                      <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
                        {(stats.excluded_papers ?? []).map((p) => (
                          <div key={p.id} style={{
                            display: "flex", alignItems: "flex-start", gap: 10,
                            padding: "10px 14px", borderRadius: 10,
                            backgroundColor: "#fefefe", border: "1px solid #f1f5f9",
                            transition: "background 0.15s",
                          }}>
                            {/* 评分徽章 */}
                            <span style={{
                              flexShrink: 0, padding: "3px 8px", borderRadius: 8,
                              fontSize: 11, fontWeight: 700, minWidth: 36, textAlign: "center",
                              backgroundColor: p.score !== null && p.score <= 1 ? "#fee2e2"
                                : p.score !== null && p.score <= 3 ? "#fff7ed" : "#fefce8",
                              color: p.score !== null && p.score <= 1 ? "#dc2626"
                                : p.score !== null && p.score <= 3 ? "#ea580c" : "#ca8a04",
                            }}>
                              {p.score !== null ? `${p.score}/10` : "—"}
                            </span>
                            {/* 论文信息 */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, color: "#1e293b", lineHeight: 1.4, fontWeight: 500 }}>
                                {p.title}
                              </div>
                              <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 3, lineHeight: 1.3 }}>
                                <span style={{ color: "#cbd5e1" }}>#{p.id}</span>
                                {p.reason_short && (
                                  <> · {p.reason_short}</>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Search Strategy + Summary */}
                {hasStrategy && (
                  <div style={{
                    borderRadius: 12, border: "1px solid #e2e8f0",
                    backgroundColor: "#fff", overflow: "hidden",
                    display: "flex", flexDirection: "column",
                  }}>
                    <div style={{
                      padding: "14px 20px", backgroundColor: "#f0f9ff",
                      borderBottom: "1px solid #bae6fd",
                      fontSize: 14, fontWeight: 600, color: "#0c4a6e",
                    }}>
                      🔬 {t("prisma.searchStrategy")}
                    </div>
                    <div style={{ padding: "16px 20px", flex: 1 }}>
                      {/* Strategy details */}
                      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
                        {!!stats.search_strategy!.query_keywords && (
                          <div>
                            <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
                              {t("prisma.queryKeywords")}
                            </div>
                            <div style={{ fontSize: 13, color: "#0f172a", lineHeight: 1.5 }}>
                              {String(stats.search_strategy!.query_keywords)}
                            </div>
                          </div>
                        )}
                        {!!stats.search_strategy!.sources && (
                          <div>
                            <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
                              {t("prisma.dataSourcesLabel")}
                            </div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                              {(Array.isArray(stats.search_strategy!.sources)
                                ? (stats.search_strategy!.sources as string[])
                                : [String(stats.search_strategy!.sources)]
                              ).map((s) => (
                                <span key={s} style={{
                                  padding: "2px 10px", borderRadius: 10, fontSize: 12,
                                  backgroundColor: "#f0f9ff", color: "#0369a1",
                                  border: "1px solid #bae6fd",
                                }}>
                                  {s}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        {!!stats.search_strategy!.year_range && (
                          <div>
                            <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
                              {t("prisma.yearRangeLabel")}
                            </div>
                            <div style={{ fontSize: 13, color: "#0f172a" }}>
                              {String(stats.search_strategy!.year_range)}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Funnel summary */}
                      <div style={{
                        padding: "14px 16px", backgroundColor: "#f8fafc",
                        borderRadius: 8, border: "1px solid #e2e8f0",
                      }}>
                        <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>
                          {t("prisma.screeningFunnel")}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          {stats.stages.map((stage, idx) => {
                            const meta = STAGE_STYLE[stage.stage];
                            if (!meta) return null;
                            return (
                              <span key={stage.stage} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                {idx > 0 && <span style={{ color: "#cbd5e1", fontSize: 14 }}>→</span>}
                                <span style={{
                                  padding: "3px 10px", borderRadius: 6, fontSize: 12, fontWeight: 600,
                                  backgroundColor: meta.bgColor, color: meta.color,
                                  border: `1px solid ${meta.color}30`,
                                }}>
                                  {meta.icon} {stage.count}
                                </span>
                              </span>
                            );
                          })}
                        </div>
                        {totalExcluded > 0 && (
                          <div style={{ marginTop: 10, fontSize: 12, color: "#64748b" }}>
                            {t("prisma.passRate")}{" "}
                            <strong style={{ color: "#22c55e" }}>
                              {stats.stages.length > 0 && stats.stages[0].count > 0
                                ? ((stats.stages[stats.stages.length - 1].count / stats.stages[0].count) * 100).toFixed(1)
                                : "0"}%
                            </strong>
                            {" "}({stats.stages[stats.stages.length - 1]?.count || 0} / {stats.stages[0]?.count || 0})
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* No reasons yet */}
                {!hasReasons && !hasStrategy && stats.total > 0 && (
                  <div style={{ padding: 24, textAlign: "center", color: "#94a3b8", fontSize: 13, borderRadius: 10, border: "1px dashed #e2e8f0" }}>
                    {t("prisma.noExclusionYet")}
                  </div>
                )}
              </div>
            );
          })()}
        </>
      )}

      {!stats && !loading && !error && (
        <div style={{ padding: "48px 24px", textAlign: "center", color: "#94a3b8", fontSize: 14 }}>
          {t("prisma.clickToLoad")}
        </div>
      )}

      {/* Exclude Modal */}
      <ConfirmModal
        show={showExcludeModal}
        type="reject"
        count={selectedIds.length}
        exclusionReasonInput={exclusionReasonInput}
        setExclusionReasonInput={setExclusionReasonInput}
        onCancel={() => { setShowExcludeModal(false); setExclusionReasonInput(""); }}
        onConfirm={handleExclude}
        exclusionTemplates={exclusionTemplates}
      />

      {/* AI Screen Modal */}
      {showAIScreenModal && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }}>
          <div style={{ backgroundColor: "white", padding: 24, borderRadius: 12, maxWidth: 480, width: "90%", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)" }}>
            <h3 style={{ marginTop: 0, color: "#7c3aed" }}>{t("prisma.aiScreenTitle")}</h3>
            <p style={{ color: "#4b5563", fontSize: 14 }}>
              {selectedIds.length > 0
                ? t("prisma.aiScreenSelected", { count: selectedIds.length })
                : t("prisma.aiScreenAll")}
            </p>
            <p style={{ color: "#6b7280", fontSize: 12 }}>
              {t("prisma.aiScreenCriteria")}
            </p>
            <div style={{ marginTop: 12 }}>
              <label style={{ fontSize: 13, color: "#374151", fontWeight: 500 }}>{t("prisma.aiScreenTopicLabel")}</label>
              <textarea
                value={aiScreenTopic}
                onChange={(e) => setAiScreenTopic(e.target.value)}
                placeholder={t("prisma.aiScreenPlaceholder")}
                style={{ width: "100%", marginTop: 6, padding: "8px 10px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 13, minHeight: 60, resize: "vertical", fontFamily: "inherit" }}
              />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 24 }}>
              <button onClick={() => setShowAIScreenModal(false)} style={{ padding: "8px 16px", borderRadius: 6, border: "1px solid #d1d5db", backgroundColor: "white", cursor: "pointer" }}>
                {t("common.cancel")}
              </button>
              <button
                onClick={handleAIScreen}
                disabled={!aiScreenTopic.trim() || aiScreening}
                style={{ padding: "8px 16px", borderRadius: 6, border: "none", backgroundColor: aiScreenTopic.trim() && !aiScreening ? "#7c3aed" : "#d1d5db", color: "white", fontWeight: 500, cursor: aiScreenTopic.trim() && !aiScreening ? "pointer" : "default" }}
              >
                {aiScreening ? t("prisma.aiScreeningBtn") : t("prisma.aiScreenStart")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
