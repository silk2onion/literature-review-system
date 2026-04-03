import { useEffect, useState } from "react";
import { API_BASE_URL } from "../api/config";
import { PrismaStagePanel, ConfirmModal } from "../components/staging";
import type { StagingPaper } from "../components/staging";

type PrismaStageCount = {
  stage: string;
  count: number;
  excluded_count: number;
};

type PrismaStats = {
  success: boolean;
  crawl_job_id?: number | null;
  total: number;
  stages: PrismaStageCount[];
  exclusion_reasons: Record<string, number>;
  search_strategy?: Record<string, unknown> | null;
};

type CrawlJobOption = {
  id: number;
  query: string;
  created_at: string;
};

const STAGE_META: Record<
  string,
  { label: string; icon: string; color: string; bgColor: string }
> = {
  identification: {
    label: "识别 Identification",
    icon: "🔍",
    color: "#6366f1",
    bgColor: "#eef2ff",
  },
  screening: {
    label: "筛选 Screening",
    icon: "📋",
    color: "#0ea5e9",
    bgColor: "#f0f9ff",
  },
  eligibility: {
    label: "资格 Eligibility",
    icon: "✅",
    color: "#f59e0b",
    bgColor: "#fffbeb",
  },
  included: {
    label: "纳入 Included",
    icon: "📎",
    color: "#22c55e",
    bgColor: "#f0fdf4",
  },
};

const NEXT_STAGE_LABEL: Record<string, string> = {
  identification: "📋 筛选",
  screening: "✅ 资格",
  eligibility: "📎 纳入",
};

export default function PrismaFlowPage() {
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
            query: (j.query as string) || "未知查询",
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
      if (!resp.ok) throw new Error(`请求失败: ${resp.status}`);
      const data: PrismaStats = await resp.json();
      setStats(data);
    } catch (err) {
      setError((err as { message?: string })?.message || "加载失败");
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
      setActionMsg("正在推进...");
      const resp = await fetch(`${API_BASE_URL}/api/staging-papers/batch-screening`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedIds, screening_stage: nextStage }),
      });
      const result = await resp.json();
      setActionMsg(
        `已推进 ${result.updated_count} 篇` +
        (result.skipped_count > 0 ? `，跳过 ${result.skipped_count} 篇（阶段不匹配）` : ""),
      );
      setSelectedIds([]);
      await refreshAll();
      setTimeout(() => setActionMsg(""), 3000);
    } catch (err) {
      setActionMsg(`推进失败: ${(err as { message?: string })?.message || "未知错误"}`);
    }
  };

  // 排除（拒绝）
  const handleExclude = async () => {
    if (selectedIds.length === 0) return;
    try {
      setShowExcludeModal(false);
      setActionMsg("正在排除...");
      await fetch(`${API_BASE_URL}/api/staging-papers/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: selectedIds,
          exclusion_reason: exclusionReasonInput.trim() || undefined,
        }),
      });
      setActionMsg(`已排除 ${selectedIds.length} 篇`);
      setSelectedIds([]);
      setExclusionReasonInput("");
      await refreshAll();
      setTimeout(() => setActionMsg(""), 3000);
    } catch (err) {
      setActionMsg(`排除失败: ${(err as { message?: string })?.message || "未知错误"}`);
    }
  };

  // AI 筛选
  const handleAIScreen = async () => {
    if (!aiScreenTopic.trim()) return;
    try {
      setShowAIScreenModal(false);
      setAiScreening(true);
      setActionMsg("AI 正在筛选...");
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
        `AI 筛选完成：推荐 ${result.promoted}，待复核 ${result.pending_review}，拒绝 ${result.rejected}` +
          (result.pre_filtered ? `，预过滤 ${result.pre_filtered}` : ""),
      );
      setSelectedIds([]);
      await refreshAll();
      setTimeout(() => setActionMsg(""), 5000);
    } catch (err) {
      setActionMsg(`AI 筛选失败: ${(err as { message?: string })?.message || "未知错误"}`);
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
          <h1>PRISMA-ScR 筛选流程</h1>
          <p>
            点击阶段卡片展开论文列表，可推进阶段、排除文献或触发 AI 筛选
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
          抓取任务过滤:
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
          <option value="">全部任务（汇总）</option>
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
          {loading ? "加载中..." : "查询"}
        </button>
        <button
          onClick={() => fetchStats()}
          style={{
            height: 36, padding: "0 14px", borderRadius: 6,
            border: "1px solid #cbd5e1", backgroundColor: "#ffffff",
            color: "#374151", fontSize: 13, cursor: "pointer",
          }}
        >
          🔄 刷新
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
              暂存文献总量:{" "}
              <strong style={{ color: "#0f172a", fontSize: 18 }}>{stats.total}</strong> 篇
            </span>
            {stats.crawl_job_id && (
              <span style={{ fontSize: 12, color: "#94a3b8" }}>
                过滤: 抓取任务 #{stats.crawl_job_id}
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
              const meta = STAGE_META[stage.stage];
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
                            {meta.label}
                          </div>
                          <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                            {stage.stage === "identification" && "数据库检索返回的全部记录"}
                            {stage.stage === "screening" && "标题/摘要初筛后保留的记录"}
                            {stage.stage === "eligibility" && "全文审查后符合资格的记录"}
                            {stage.stage === "included" && "最终纳入综述分析的记录"}
                          </div>
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 16, textAlign: "center" }}>
                        <div>
                          <div style={{ fontSize: 28, fontWeight: 700, color: meta.color }}>
                            {stage.count}
                          </div>
                          <div style={{ fontSize: 11, color: "#94a3b8" }}>篇</div>
                        </div>
                        {stage.excluded_count > 0 && (
                          <div style={{ borderLeft: "1px solid #e2e8f0", paddingLeft: 16 }}>
                            <div style={{ fontSize: 16, fontWeight: 600, color: "#ef4444" }}>
                              -{stage.excluded_count}
                            </div>
                            <div style={{ fontSize: 11, color: "#ef4444" }}>排除</div>
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
                        stageLabel={meta.label}
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
                        nextStageLabel={NEXT_STAGE_LABEL[stage.stage]}
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
                        ← 排除 {stage.excluded_count} 篇
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
                display: "grid",
                gridTemplateColumns: hasReasons && hasStrategy ? "1fr 1fr" : "1fr",
                gap: 20, marginBottom: 24,
              }}>
                {/* Exclusion Reasons */}
                {hasReasons && (
                  <div style={{
                    borderRadius: 12, border: "1px solid #e2e8f0",
                    backgroundColor: "#fff", overflow: "hidden",
                    display: "flex", flexDirection: "column",
                  }}>
                    <div style={{
                      padding: "14px 20px", backgroundColor: "#fef2f2",
                      borderBottom: "1px solid #fecaca",
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                    }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: "#991b1b" }}>
                        📊 排除原因分布
                      </span>
                      <span style={{
                        fontSize: 12, color: "#dc2626", fontWeight: 500,
                        padding: "2px 10px", backgroundColor: "#fee2e2", borderRadius: 10,
                      }}>
                        共 {totalExcluded} 篇排除
                      </span>
                    </div>
                    <div style={{ padding: "8px 20px 16px", overflowY: "auto", maxHeight: 480, flex: 1 }}>
                      {sortedReasons.map(([reason, count], i) => {
                        const pct = totalExcluded > 0 ? ((count / totalExcluded) * 100) : 0;
                        const barWidth = maxCount > 0 ? ((count / maxCount) * 100) : 0;
                        return (
                          <div key={reason} style={{
                            padding: "10px 0",
                            borderBottom: i < sortedReasons.length - 1 ? "1px solid #f8fafc" : "none",
                          }}>
                            <div style={{
                              display: "flex", justifyContent: "space-between",
                              alignItems: "baseline", marginBottom: 6,
                            }}>
                              <span style={{ fontSize: 13, color: "#1e293b", flex: 1, lineHeight: 1.4 }}>
                                {reason}
                              </span>
                              <span style={{
                                fontSize: 13, fontWeight: 700, color: "#dc2626",
                                marginLeft: 12, whiteSpace: "nowrap",
                              }}>
                                {count} 篇
                                <span style={{ fontWeight: 400, color: "#9ca3af", fontSize: 11, marginLeft: 4 }}>
                                  ({pct.toFixed(1)}%)
                                </span>
                              </span>
                            </div>
                            <div style={{
                              width: "100%", height: 6,
                              backgroundColor: "#fee2e2", borderRadius: 3,
                              overflow: "hidden",
                            }}>
                              <div style={{
                                width: `${barWidth}%`, height: "100%",
                                backgroundColor: "#ef4444", borderRadius: 3,
                                transition: "width 0.3s ease",
                              }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
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
                      🔬 搜索策略与筛选摘要
                    </div>
                    <div style={{ padding: "16px 20px", flex: 1 }}>
                      {/* Strategy details */}
                      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
                        {!!stats.search_strategy!.query_keywords && (
                          <div>
                            <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
                              检索关键词
                            </div>
                            <div style={{ fontSize: 13, color: "#0f172a", lineHeight: 1.5 }}>
                              {String(stats.search_strategy!.query_keywords)}
                            </div>
                          </div>
                        )}
                        {!!stats.search_strategy!.sources && (
                          <div>
                            <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
                              数据源
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
                              年份范围
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
                          筛选漏斗
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          {stats.stages.map((stage, idx) => {
                            const meta = STAGE_META[stage.stage];
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
                            通过率:{" "}
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
                    尚无排除原因记录。点击上方阶段卡片展开论文列表，可排除文献并填写原因。
                  </div>
                )}
              </div>
            );
          })()}
        </>
      )}

      {!stats && !loading && !error && (
        <div style={{ padding: "48px 24px", textAlign: "center", color: "#94a3b8", fontSize: 14 }}>
          点击"查询"按钮加载 PRISMA 筛选统计数据
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
            <h3 style={{ marginTop: 0, color: "#7c3aed" }}>🤖 AI 相关度筛选</h3>
            <p style={{ color: "#4b5563", fontSize: 14 }}>
              {selectedIds.length > 0
                ? `将对选中的 ${selectedIds.length} 篇 identification 阶段文献进行 AI 评分。`
                : "将对 identification 阶段的所有 pending 文献进行 AI 评分。"}
            </p>
            <p style={{ color: "#6b7280", fontSize: 12 }}>
              7-10 分推荐入库 / 4-6 分待人工复核 / 0-3 分自动拒绝
            </p>
            <div style={{ marginTop: 12 }}>
              <label style={{ fontSize: 13, color: "#374151", fontWeight: 500 }}>研究主题 (必填):</label>
              <textarea
                value={aiScreenTopic}
                onChange={(e) => setAiScreenTopic(e.target.value)}
                placeholder="例如: Transit-Oriented Development and pedestrian safety"
                style={{ width: "100%", marginTop: 6, padding: "8px 10px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 13, minHeight: 60, resize: "vertical", fontFamily: "inherit" }}
              />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 24 }}>
              <button onClick={() => setShowAIScreenModal(false)} style={{ padding: "8px 16px", borderRadius: 6, border: "1px solid #d1d5db", backgroundColor: "white", cursor: "pointer" }}>
                取消
              </button>
              <button
                onClick={handleAIScreen}
                disabled={!aiScreenTopic.trim() || aiScreening}
                style={{ padding: "8px 16px", borderRadius: 6, border: "none", backgroundColor: aiScreenTopic.trim() && !aiScreening ? "#7c3aed" : "#d1d5db", color: "white", fontWeight: 500, cursor: aiScreenTopic.trim() && !aiScreening ? "pointer" : "default" }}
              >
                {aiScreening ? "筛选中..." : "开始筛选"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
