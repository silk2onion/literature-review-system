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

const API_BASE_URL = "http://localhost:5444";

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

export default function MonitoringDashboard() {
  const [pipelineTasks, setPipelineTasks] = useState<PipelineTask[]>([]);
  const [crawlerJobs, setCrawlerJobs] = useState<CrawlerJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"phd" | "crawler">("phd");
  const [resumingTaskId, setResumingTaskId] = useState<string | null>(null);

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
      case "done":
      case "completed":
        return <CheckCircle2 size={16} className="text-emerald-500" />;
      case "failed":
        return <XCircle size={16} className="text-rose-500" />;
      case "running":
        return <Loader2 size={16} className="text-amber-500 animate-spin" />;
      default:
        return <Clock size={16} className="text-slate-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "done":
      case "completed":
        return "rgba(16, 185, 129, 0.15)";
      case "failed":
        return "rgba(244, 63, 94, 0.15)";
      case "running":
        return "rgba(245, 158, 11, 0.15)";
      default:
        return "rgba(148, 163, 184, 0.15)";
    }
  };

  const getStatusTextColor = (status: string) => {
    switch (status) {
      case "done":
      case "completed":
        return "#10b981";
      case "failed":
        return "#f43f5e";
      case "running":
        return "#f59e0b";
      default:
        return "#94a3b8";
    }
  };

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={styles.iconCircle}>
            <Activity size={20} color="#6366f1" />
          </div>
          <div>
            <h2 style={styles.title}>任务监控中心</h2>
            <p style={styles.subtitle}>实时跟踪文献生成与数据爬取进度</p>
          </div>
        </div>
        <button onClick={fetchData} style={styles.refreshBtn}>
          <RefreshCw size={14} />
          刷新
        </button>
      </header>

      <div style={styles.tabContainer}>
        <button
          style={{
            ...styles.tab,
            ...(activeTab === "phd" ? styles.activeTab : {}),
          }}
          onClick={() => setActiveTab("phd")}
        >
          <FileText size={16} />
          PhD 生成管线
          {pipelineTasks.filter((t) => t.status === "running").length > 0 && (
            <span style={styles.badge}>
              {pipelineTasks.filter((t) => t.status === "running").length}
            </span>
          )}
        </button>
        <button
          style={{
            ...styles.tab,
            ...(activeTab === "crawler" ? styles.activeTab : {}),
          }}
          onClick={() => setActiveTab("crawler")}
        >
          <Database size={16} />
          数据爬取任务
          {crawlerJobs.filter((t) => t.status === "running").length > 0 && (
            <span style={styles.badge}>
              {crawlerJobs.filter((t) => t.status === "running").length}
            </span>
          )}
        </button>
      </div>

      <div style={styles.content}>
        {loading && (
          <div style={styles.loadingState}>
            <Loader2 size={32} className="animate-spin" color="#6366f1" />
            <p>正在获取最新状态...</p>
          </div>
        )}

        {!loading && activeTab === "phd" && (
          <div style={styles.taskList}>
            {pipelineTasks.length === 0 ? (
              <div style={styles.emptyState}>暂无文献生成任务</div>
            ) : (
              pipelineTasks.map((task) => (
                <div key={task.task_id} style={styles.taskCard}>
                  <div style={styles.cardHeader}>
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          marginBottom: 4,
                        }}
                      >
                        <span
                          style={{
                            ...styles.statusTag,
                            backgroundColor: getStatusColor(task.status),
                            color: getStatusTextColor(task.status),
                          }}
                        >
                          {getStatusIcon(task.status)}
                          {task.status.toUpperCase()}
                        </span>
                        <span style={styles.timestamp}>
                          {new Date(task.created_at).toLocaleString()}
                        </span>
                      </div>
                      <h4 style={styles.taskTopic}>{task.topic}</h4>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={styles.taskId}>ID: {task.task_id}</div>
                      {task.review_id && (
                        <div style={styles.reviewLink}>
                          Review #{task.review_id}
                        </div>
                      )}
                    </div>
                  </div>

                  <div style={styles.stepProgress}>
                    {task.steps.map((step, idx) => (
                      <div
                        key={idx}
                        style={{
                          ...styles.stepDot,
                          backgroundColor:
                            step.status === "done"
                              ? "#10b981"
                              : step.status === "running"
                                ? "#f59e0b"
                                : step.status === "failed"
                                  ? "#f43f5e"
                                  : "#1e293b",
                        }}
                        title={step.label}
                      />
                    ))}
                  </div>

                  {task.status === "running" && (
                    <div style={styles.currentStep}>
                      <span style={{ color: "#94a3b8" }}>当前步骤: </span>
                      <span style={{ color: "#f59e0b" }}>
                        {task.steps.find(
                          (s) =>
                            s.status === "running" || s.status === "retrying",
                        )?.label || "进行中..."}
                        {task.steps.find((s) => s.status === "retrying") &&
                          " (重试中)"}
                      </span>
                    </div>
                  )}

                  {task.error && (
                    <div style={styles.errorBox}>{task.error}</div>
                  )}

                  {task.status === "failed" && (
                    <div
                      style={{ marginTop: "12px", display: "flex", gap: "8px" }}
                    >
                      <button
                        disabled={resumingTaskId === task.task_id}
                        onClick={async () => {
                          try {
                            setResumingTaskId(task.task_id);
                            const res = await fetch(
                              `${API_BASE_URL}/api/reviews/phd/task/${task.task_id}/resume`,
                              {
                                method: "POST",
                              },
                            );
                            if (!res.ok) {
                              const errText = await res.text();
                              alert(`恢复失败: ${errText}`);
                              setResumingTaskId(null);
                              return;
                            }
                            // Refresh data immediately
                            await fetchData();
                          } catch (e) {
                            alert(`恢复请求失败: ${e}`);
                          } finally {
                            setResumingTaskId(null);
                          }
                        }}
                        style={{
                          padding: "6px 14px",
                          borderRadius: "6px",
                          border: "none",
                          background:
                            resumingTaskId === task.task_id
                              ? "#94a3b8"
                              : "linear-gradient(135deg, #10b981, #059669)",
                          color: "#fff",
                          fontWeight: 600,
                          cursor:
                            resumingTaskId === task.task_id
                              ? "not-allowed"
                              : "pointer",
                          fontSize: "12px",
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                        }}
                      >
                        {resumingTaskId === task.task_id ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          "▶️"
                        )}
                        {resumingTaskId === task.task_id
                          ? "正在恢复..."
                          : "断点续跑"}
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {!loading && activeTab === "crawler" && (
          <div style={styles.taskList}>
            {crawlerJobs.length === 0 ? (
              <div style={styles.emptyState}>暂无爬虫任务</div>
            ) : (
              crawlerJobs.map((job) => (
                <div key={job.id} style={styles.taskCard}>
                  <div style={styles.cardHeader}>
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          marginBottom: 4,
                        }}
                      >
                        <span
                          style={{
                            ...styles.statusTag,
                            backgroundColor: getStatusColor(job.status),
                            color: getStatusTextColor(job.status),
                          }}
                        >
                          {getStatusIcon(job.status)}
                          {job.status.toUpperCase()}
                        </span>
                        <span style={styles.timestamp}>
                          {new Date(job.created_at).toLocaleString()}
                        </span>
                      </div>
                      <h4 style={styles.taskTopic}>
                        {job.keywords.join(", ")}
                      </h4>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={styles.taskId}>JOB #{job.id}</div>
                      <div style={styles.progressText}>
                        {job.fetched_count} / {job.max_results} 篇
                      </div>
                    </div>
                  </div>

                  <div style={styles.progressBarBg}>
                    <div
                      style={{
                        ...styles.progressBarFill,
                        width: `${Math.min(100, (job.fetched_count / job.max_results) * 100)}%`,
                        backgroundColor:
                          job.status === "completed" ? "#10b981" : "#6366f1",
                      }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: "24px 32px",
    maxWidth: 1000,
    margin: "0 auto",
    height: "100%",
    display: "flex",
    flexDirection: "column",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: "12px",
    backgroundColor: "rgba(99, 102, 241, 0.1)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 20,
    fontWeight: 700,
    color: "#e2e8f0",
    margin: 0,
  },
  subtitle: {
    fontSize: 13,
    color: "#94a3b8",
    margin: "2px 0 0 0",
  },
  refreshBtn: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "8px 16px",
    borderRadius: 8,
    border: "1px solid rgba(148, 163, 184, 0.2)",
    backgroundColor: "transparent",
    color: "#94a3b8",
    fontSize: 13,
    cursor: "pointer",
    transition: "all 0.2s",
  },
  tabContainer: {
    display: "flex",
    gap: 12,
    marginBottom: 24,
    borderBottom: "1px solid rgba(148, 163, 184, 0.1)",
    paddingBottom: 1,
  },
  tab: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "12px 20px",
    background: "transparent",
    border: "none",
    borderBottom: "2px solid transparent",
    color: "#94a3b8",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    position: "relative",
  },
  activeTab: {
    color: "#6366f1",
    borderBottomColor: "#6366f1",
  },
  badge: {
    marginLeft: 6,
    padding: "2px 6px",
    borderRadius: 10,
    backgroundColor: "#6366f1",
    color: "white",
    fontSize: 10,
  },
  content: {
    flex: 1,
    overflow: "auto",
  },
  loadingState: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: 60,
    color: "#94a3b8",
    gap: 16,
  },
  emptyState: {
    padding: 40,
    textAlign: "center",
    color: "#64748b",
    backgroundColor: "rgba(30, 41, 59, 0.3)",
    borderRadius: 12,
    border: "1px dashed rgba(148, 163, 184, 0.1)",
  },
  taskList: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  taskCard: {
    backgroundColor: "rgba(30, 41, 59, 0.6)",
    borderRadius: 12,
    padding: "16px 20px",
    border: "1px solid rgba(148, 163, 184, 0.1)",
    transition: "transform 0.2s, border-color 0.2s",
  },
  cardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  statusTag: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "2px 8px",
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 700,
  },
  timestamp: {
    fontSize: 12,
    color: "#64748b",
  },
  taskTopic: {
    margin: 0,
    fontSize: 15,
    fontWeight: 600,
    color: "#f1f5f9",
  },
  taskId: {
    fontSize: 11,
    color: "#64748b",
    fontFamily: "monospace",
  },
  reviewLink: {
    fontSize: 12,
    color: "#6366f1",
    fontWeight: 600,
    marginTop: 4,
  },
  stepProgress: {
    display: "flex",
    gap: 8,
    marginBottom: 12,
  },
  stepDot: {
    width: 12,
    height: 12,
    borderRadius: "50%",
    backgroundColor: "#1e293b",
  },
  currentStep: {
    fontSize: 13,
  },
  errorBox: {
    marginTop: 12,
    padding: 10,
    backgroundColor: "rgba(244, 63, 94, 0.1)",
    borderRadius: 6,
    color: "#fca5a5",
    fontSize: 12,
    border: "1px solid rgba(244, 63, 94, 0.2)",
  },
  progressBarBg: {
    height: 6,
    backgroundColor: "#1e293b",
    borderRadius: 3,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 3,
    transition: "width 0.5s ease",
  },
  progressText: {
    fontSize: 12,
    color: "#cbd5e1",
    fontWeight: 600,
    marginTop: 4,
  },
};
