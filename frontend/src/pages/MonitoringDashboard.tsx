import React, { useEffect, useState } from "react";
import {
  Activity,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  Loader2,
  Database,
  FileText,
} from "lucide-react";
import { API_BASE_URL } from "../api/config";
import { useLocale } from "../hooks/useLocale";

interface PipelineTask {
  task_id: string;
  status: "pending" | "running" | "done" | "failed";
  topic: string;
  created_at: string;
  finished_at: string | null;
  error: string | null;
  review_id: number | null;
  total_cited_papers: number;
  steps: any[];
}

interface CrawlerJob {
  id: number;
  keywords: string[];
  status: "pending" | "running" | "completed" | "failed" | "paused";
  fetched_count: number;
  max_results: number;
  created_at: string;
}

const STATUS_CONFIG: Record<string, { color: string; bg: string; border: string }> = {
  done:      { color: "#16a34a", bg: "#f0fdf4", border: "#bbf7d0" },
  completed: { color: "#16a34a", bg: "#f0fdf4", border: "#bbf7d0" },
  running:   { color: "#ca8a04", bg: "#fefce8", border: "#fde68a" },
  failed:    { color: "#dc2626", bg: "#fef2f2", border: "#fecaca" },
  cancelled: { color: "#ea580c", bg: "#fff7ed", border: "#fed7aa" },
  pending:   { color: "#64748b", bg: "#f8fafc", border: "#e2e8f0" },
  paused:    { color: "#7c3aed", bg: "#f5f3ff", border: "#ddd6fe" },
};

function getStatusStyle(status: string) {
  return STATUS_CONFIG[status] || STATUS_CONFIG.pending;
}

export default function MonitoringDashboard() {
  const { t } = useLocale();
  const [pipelineTasks, setPipelineTasks] = useState<PipelineTask[]>([]);
  const [crawlerJobs, setCrawlerJobs] = useState<CrawlerJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"phd" | "crawler">("phd");
  const [resumingTaskId, setResumingTaskId] = useState<string | null>(null);
  const [rerollingTaskId, setRerollingTaskId] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      const [phdResp, crawlResp] = await Promise.all([
        fetch(`${API_BASE_URL}/api/reviews/phd/tasks`),
        fetch(`${API_BASE_URL}/api/crawl/jobs?limit=50`),
      ]);
      if (phdResp.ok) {
        const data = await phdResp.json();
        const sorted = (data.tasks || []).sort(
          (a: any, b: any) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        );
        setPipelineTasks(sorted);
      }
      if (crawlResp.ok) {
        const data = await crawlResp.json();
        setCrawlerJobs(data.items || []);
      }
    } catch (err) {
      console.error("Failed to fetch monitoring data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "done": case "completed":
        return <CheckCircle2 size={14} />;
      case "failed":
        return <XCircle size={14} />;
      case "running":
        return <Loader2 size={14} className="animate-spin" />;
      default:
        return <Clock size={14} />;
    }
  };

  return (
    <div className="page-container" style={{ padding: 20 }}>
      {/* Header */}
      <header className="page-header" style={{ marginBottom: 20 }}>
        <div className="page-title" style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            backgroundColor: "#eff6ff", display: "flex",
            alignItems: "center", justifyContent: "center",
          }}>
            <Activity size={20} color="#3b82f6" />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#0f172a" }}>
              {t("monitoring.title")}
            </h1>
            <p style={{ margin: "2px 0 0", fontSize: 13, color: "#64748b" }}>
              {t("monitoring.subtitle")}
            </p>
          </div>
        </div>
        <button
          onClick={fetchData}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "8px 16px", borderRadius: 8,
            border: "1px solid #cbd5e1", backgroundColor: "#ffffff",
            color: "#374151", fontSize: 13, cursor: "pointer",
          }}
        >
          <RefreshCw size={14} />
          {t("monitoring.refresh")}
        </button>
      </header>

      {/* Tabs */}
      <div style={{
        display: "flex", gap: 0, marginBottom: 24,
        padding: "0 50px",
      }}>
        {([
          { key: "phd" as const, icon: <FileText size={15} />, label: t("monitoring.phdPipeline"), count: pipelineTasks.filter((t) => t.status === "running").length },
          { key: "crawler" as const, icon: <Database size={15} />, label: t("monitoring.crawlerJobs"), count: crawlerJobs.filter((t) => t.status === "running").length },
        ]).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "12px 20px", background: "transparent", border: "none",
              borderBottom: activeTab === tab.key ? "2px solid #3b82f6" : "2px solid transparent",
              color: activeTab === tab.key ? "#2563eb" : "#64748b",
              fontSize: 14, fontWeight: 600, cursor: "pointer",
            }}
          >
            {tab.icon}
            {tab.label}
            {tab.count > 0 && (
              <span style={{
                padding: "1px 7px", borderRadius: 999,
                backgroundColor: "#3b82f6", color: "#fff",
                fontSize: 10, fontWeight: 700,
              }}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: "auto" }}>
        {loading && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: 60, color: "#94a3b8", gap: 16 }}>
            <Loader2 size={32} className="animate-spin" color="#3b82f6" />
            <p>{t("monitoring.loadingStatus")}</p>
          </div>
        )}

        {/* PhD Pipeline */}
        {!loading && activeTab === "phd" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "0 50px" }}>
            {pipelineTasks.length === 0 ? (
              <div style={{
                padding: 40, textAlign: "center", color: "#94a3b8",
                borderRadius: 10, border: "1px dashed #e2e8f0",
              }}>
                {t("monitoring.noPhdTasks")}
              </div>
            ) : (
              pipelineTasks.map((task) => {
                const s = getStatusStyle(task.status);
                return (
                  <div
                    key={task.task_id}
                    style={{
                      borderRadius: 10, padding: "16px 20px",
                      backgroundColor: s.bg,
                      border: `1px solid ${s.border}`,
                    }}
                  >
                    {/* Header row */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                          <span style={{
                            display: "inline-flex", alignItems: "center", gap: 5,
                            padding: "3px 10px", borderRadius: 6,
                            backgroundColor: "#ffffff", color: s.color,
                            fontSize: 11, fontWeight: 700,
                            border: `1px solid ${s.border}`,
                          }}>
                            {getStatusIcon(task.status)}
                            {task.status.toUpperCase()}
                          </span>
                          <span style={{ fontSize: 12, color: "#94a3b8" }}>
                            {new Date(task.created_at).toLocaleString()}
                          </span>
                        </div>
                        <h4 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "#0f172a", lineHeight: 1.4 }}>
                          {task.topic}
                        </h4>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 16 }}>
                        <div style={{ fontSize: 11, color: "#94a3b8", fontFamily: "monospace" }}>
                          ID: {task.task_id.slice(0, 8)}
                        </div>
                        {task.review_id && (
                          <div style={{ fontSize: 12, color: "#2563eb", fontWeight: 600, marginTop: 2 }}>
                            Review #{task.review_id}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Step pills with re-roll */}
                    {task.steps && task.steps.length > 0 && (() => {
                      const taskBusy = rerollingTaskId === task.task_id || task.status === "running";
                      return (
                      <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
                        {task.steps.map((step: any, idx: number) => {
                          const dotColor =
                            step.status === "done" ? "#16a34a" :
                            step.status === "running" ? "#ca8a04" :
                            step.status === "failed" ? "#dc2626" : "#e2e8f0";
                          const canReroll = (step.status === "done" || step.status === "failed") && !taskBusy;
                          return (
                            <div
                              key={idx}
                              title={`${step.label}${step.message ? ` — ${step.message}` : ""}${canReroll ? "\n点击重跑此步骤" : ""}`}
                              onClick={canReroll ? async () => {
                                setRerollingTaskId(task.task_id);
                                try {
                                  const res = await fetch(
                                    `${API_BASE_URL}/api/reviews/phd/task/${task.task_id}/reroll/${step.step}`,
                                    { method: "POST" },
                                  );
                                  if (!res.ok) {
                                    const errText = await res.text();
                                    alert(`Re-roll 失败: ${errText}`);
                                  }
                                  await fetchData();
                                } catch (e) {
                                  alert(`Re-roll 请求失败: ${e}`);
                                } finally {
                                  setRerollingTaskId(null);
                                }
                              } : undefined}
                              style={{
                                display: "inline-flex", alignItems: "center", gap: 4,
                                padding: "2px 8px", borderRadius: 12,
                                backgroundColor: step.status === "pending" ? "#f8fafc" : `${dotColor}15`,
                                border: `1px solid ${step.status === "pending" ? "#cbd5e1" : dotColor}`,
                                color: step.status === "pending" ? "#94a3b8" : dotColor,
                                fontSize: 11, fontWeight: 600,
                                cursor: canReroll ? "pointer" : "default",
                                opacity: taskBusy && step.status !== "running" ? 0.5 : 1,
                                pointerEvents: taskBusy ? "none" : "auto",
                                transition: "all 0.15s ease",
                              }}
                            >
                              <span style={{
                                width: 7, height: 7, borderRadius: "50%",
                                backgroundColor: dotColor,
                                flexShrink: 0,
                              }} />
                              {step.label}
                              {canReroll && (
                                <RefreshCw size={10} style={{ marginLeft: 2, opacity: 0.7 }} />
                              )}
                            </div>
                          );
                        })}
                      </div>
                      );
                    })()}

                    {/* Current running step */}
                    {task.status === "running" && (
                      <div style={{ fontSize: 12 }}>
                        <span style={{ color: "#64748b" }}>{t("monitoring.currentStep")}: </span>
                        <span style={{ color: "#ca8a04", fontWeight: 600 }}>
                          {task.steps.find((s: any) => s.status === "running" || s.status === "retrying")?.label || t("monitoring.inProgress")}
                        </span>
                      </div>
                    )}

                    {/* Error */}
                    {task.error && (
                      <div style={{
                        marginTop: 10, padding: "8px 12px", borderRadius: 6,
                        backgroundColor: "#fef2f2", border: "1px solid #fecaca",
                        color: "#dc2626", fontSize: 12,
                      }}>
                        {task.error}
                      </div>
                    )}

                    {/* Resume button */}
                    {task.status === "failed" && (
                      <div style={{ marginTop: 12 }}>
                        <button
                          disabled={resumingTaskId === task.task_id}
                          onClick={async () => {
                            try {
                              setResumingTaskId(task.task_id);
                              const res = await fetch(
                                `${API_BASE_URL}/api/reviews/phd/task/${task.task_id}/resume`,
                                { method: "POST" },
                              );
                              if (!res.ok) {
                                const errText = await res.text();
                                alert(`${t("monitoring.resumeFailed")}: ${errText}`);
                                setResumingTaskId(null);
                                return;
                              }
                              await fetchData();
                            } catch (e) {
                              alert(`${t("monitoring.resumeRequestFailed")}: ${e}`);
                            } finally {
                              setResumingTaskId(null);
                            }
                          }}
                          style={{
                            padding: "6px 14px", borderRadius: 6, border: "none",
                            background: resumingTaskId === task.task_id
                              ? "#94a3b8"
                              : "linear-gradient(180deg, #22c55e 0%, #16a34a 100%)",
                            color: "#fff", fontWeight: 600,
                            cursor: resumingTaskId === task.task_id ? "not-allowed" : "pointer",
                            fontSize: 12, display: "inline-flex", alignItems: "center", gap: 6,
                          }}
                        >
                          {resumingTaskId === task.task_id
                            ? <><Loader2 size={12} className="animate-spin" /> {t("monitoring.resuming")}</>
                            : <>{t("monitoring.resumeFromCheckpoint")}</>}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Crawler Jobs */}
        {!loading && activeTab === "crawler" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "0 50px" }}>
            {crawlerJobs.length === 0 ? (
              <div style={{
                padding: 40, textAlign: "center", color: "#94a3b8",
                borderRadius: 10, border: "1px dashed #e2e8f0",
              }}>
                {t("monitoring.noCrawlerJobs")}
              </div>
            ) : (
              crawlerJobs.map((job) => {
                const s = getStatusStyle(job.status);
                const pct = Math.min(100, (job.fetched_count / Math.max(job.max_results, 1)) * 100);
                return (
                  <div
                    key={job.id}
                    style={{
                      borderRadius: 10, padding: "16px 20px",
                      backgroundColor: s.bg,
                      border: `1px solid ${s.border}`,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                          <span style={{
                            display: "inline-flex", alignItems: "center", gap: 5,
                            padding: "3px 10px", borderRadius: 6,
                            backgroundColor: "#ffffff", color: s.color,
                            fontSize: 11, fontWeight: 700,
                            border: `1px solid ${s.border}`,
                          }}>
                            {getStatusIcon(job.status)}
                            {job.status.toUpperCase()}
                          </span>
                          <span style={{ fontSize: 12, color: "#94a3b8" }}>
                            {new Date(job.created_at).toLocaleString()}
                          </span>
                        </div>
                        <h4 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "#0f172a" }}>
                          {job.keywords.join(", ")}
                        </h4>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 16 }}>
                        <div style={{ fontSize: 11, color: "#94a3b8", fontFamily: "monospace" }}>
                          JOB #{job.id}
                        </div>
                        <div style={{ fontSize: 13, color: "#0f172a", fontWeight: 600, marginTop: 2 }}>
                          {job.fetched_count} / {job.max_results} {t("monitoring.papers")}
                        </div>
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div style={{
                      height: 6, backgroundColor: "#f1f5f9",
                      borderRadius: 3, overflow: "hidden",
                    }}>
                      <div style={{
                        height: "100%", borderRadius: 3,
                        transition: "width 0.5s ease",
                        width: `${pct}%`,
                        backgroundColor: job.status === "completed" ? "#16a34a" : "#3b82f6",
                      }} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}
