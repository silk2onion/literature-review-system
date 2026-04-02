import React, { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { API_BASE_URL } from "../api/config";

interface StepLog {
  step: string;
  label: string;
  status: "pending" | "running" | "done" | "failed" | "retrying";
  message: string;
  elapsed: number | null;
  attempt: number;
  max_attempts: number;
}

interface TaskState {
  task_id: string;
  status: "pending" | "running" | "done" | "failed";
  topic: string;
  created_at: string;
  finished_at: string | null;
  error: string | null;
  review_id: number | null;
  full_markdown: string | null;
  references_markdown: string | null;
  total_cited_papers: number;
  steps: StepLog[];
}

const STEP_ICONS = {
  pending: "⏳",
  running: "🔄",
  done: "✅",
  failed: "❌",
  retrying: "🔁",
};

const STEP_COLORS = {
  pending: "#64748b",
  running: "#f59e0b",
  done: "#10b981",
  failed: "#ef4444",
  retrying: "#f97316",
};

interface AsyncTaskPanelProps {
  topic: string;
  keywords: string[];
  papersPerSection: number;
  sources: string[];
  language?: string;
  citationStyle?: string;
}

export const AsyncTaskPanel: React.FC<AsyncTaskPanelProps> = ({
  topic,
  keywords,
  papersPerSection,
  sources,
  language = "zh-CN",
  citationStyle = "harvard",
}) => {
  const [task, setTask] = useState<TaskState | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showMarkdown, setShowMarkdown] = useState(false);
  const [isResuming, setIsResuming] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  const cleanup = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  };

  useEffect(() => {
    return cleanup;
  }, []);

  const handleStartTask = async () => {
    setStarting(true);
    setError(null);
    setTask(null);
    cleanup();

    try {
      const res = await fetch(`${API_BASE_URL}/api/reviews/phd/start-task`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic,
          keywords,
          papers_per_section: papersPerSection,
          sources,
          language,
          citation_style: citationStyle,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || `Failed to start task: ${res.status}`);
      }

      const data = await res.json();
      const tid = data.task_id;

      // Connect to SSE stream
      const es = new EventSource(
        `${API_BASE_URL}/api/reviews/phd/task/${tid}/stream`,
      );
      eventSourceRef.current = es;

      const handleEvent = (e: MessageEvent) => {
        try {
          const taskData: TaskState = JSON.parse(e.data);
          setTask(taskData);
          if (taskData.status === "done" || taskData.status === "failed") {
            cleanup();
          }
        } catch {
          // ignore parse errors
        }
      };

      es.addEventListener("snapshot", handleEvent);
      es.addEventListener("step_update", handleEvent);
      es.addEventListener("task_done", handleEvent);
      es.addEventListener("final", handleEvent);
      es.addEventListener("task_error", (e: MessageEvent) => {
        try {
          const errData = JSON.parse(e.data);
          setError(errData.error || "Task failed");
          if (errData.task) setTask(errData.task);
        } catch {
          /* ignore */
        }
        cleanup();
      });

      es.onerror = () => {
        // SSE closed — poll once for final state
        cleanup();
        fetch(`${API_BASE_URL}/api/reviews/phd/task/${tid}`)
          .then((r) => r.json())
          .then(setTask)
          .catch(() => {});
      };
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setStarting(false);
    }
  };

  const handleDownload = () => {
    if (!task?.full_markdown) return;
    const blob = new Blob([task.full_markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `review_${task.task_id || "draft"}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      style={{
        background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
        border: "1px solid #334155",
        borderRadius: "12px",
        padding: "20px",
        marginTop: "16px",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "16px",
        }}
      >
        <div>
          <h3
            style={{
              color: "#e2e8f0",
              margin: 0,
              fontSize: "16px",
              fontWeight: 700,
            }}
          >
            ⚡ 一键全自动综述生成
          </h3>
          <p style={{ color: "#64748b", fontSize: "12px", margin: "4px 0 0" }}>
            异步执行 · 自动重试 · 实时进度
          </p>
        </div>
        {task && (
          <span
            style={{
              padding: "4px 12px",
              borderRadius: "20px",
              fontSize: "12px",
              fontWeight: 700,
              background:
                task.status === "done"
                  ? "rgba(16,185,129,0.15)"
                  : task.status === "failed"
                    ? "rgba(239,68,68,0.15)"
                    : "rgba(245,158,11,0.15)",
              color:
                task.status === "done"
                  ? "#10b981"
                  : task.status === "failed"
                    ? "#ef4444"
                    : "#f59e0b",
              border: `1px solid ${task.status === "done" ? "#10b981" : task.status === "failed" ? "#ef4444" : "#f59e0b"}`,
            }}
          >
            {task.status === "done"
              ? "完成"
              : task.status === "failed"
                ? "失败"
                : "进行中"}
          </span>
        )}
      </div>

      {/* Start button */}
      {!task && (
        <button
          onClick={handleStartTask}
          disabled={starting || (!topic && keywords.length === 0)}
          style={{
            width: "100%",
            padding: "12px",
            borderRadius: "8px",
            border: "none",
            background: starting
              ? "#334155"
              : "linear-gradient(135deg, #8b5cf6, #ec4899)",
            color: "#fff",
            fontWeight: 700,
            fontSize: "15px",
            cursor: starting ? "not-allowed" : "pointer",
            opacity: starting ? 0.7 : 1,
            transition: "opacity 0.2s",
          }}
        >
          {starting ? "正在启动..." : "🚀 一键生成完整文献综述"}
        </button>
      )}

      {/* Error */}
      {error && (
        <div
          style={{
            padding: "10px 14px",
            background: "rgba(239,68,68,0.1)",
            border: "1px solid #ef4444",
            borderRadius: "8px",
            color: "#ef4444",
            fontSize: "13px",
            marginTop: "12px",
          }}
        >
          ❌ {error}
        </div>
      )}

      {/* Progress steps */}
      {task && (
        <div style={{ marginTop: "16px" }}>
          {/* Task ID badge */}
          <div
            style={{ color: "#475569", fontSize: "11px", marginBottom: "12px" }}
          >
            任务 ID: <code style={{ color: "#94a3b8" }}>{task.task_id}</code>
            {task.finished_at && (
              <span style={{ marginLeft: "12px" }}>
                完成于 {new Date(task.finished_at).toLocaleTimeString()}
              </span>
            )}
          </div>

          {/* Steps */}
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {task.steps.map((step, idx) => (
              <div
                key={step.step}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "10px",
                  padding: "10px 14px",
                  background:
                    step.status === "pending"
                      ? "transparent"
                      : step.status === "done"
                        ? "rgba(16,185,129,0.05)"
                        : step.status === "failed"
                          ? "rgba(239,68,68,0.08)"
                          : "rgba(245,158,11,0.08)",
                  border: `1px solid ${
                    step.status === "pending"
                      ? "#1e293b"
                      : step.status === "done"
                        ? "rgba(16,185,129,0.3)"
                        : step.status === "failed"
                          ? "rgba(239,68,68,0.3)"
                          : "rgba(245,158,11,0.3)"
                  }`,
                  borderRadius: "8px",
                  transition: "all 0.3s ease",
                }}
              >
                {/* Step icon with pulse animation for running */}
                <span
                  style={{
                    fontSize: "16px",
                    lineHeight: 1,
                    flexShrink: 0,
                    animation:
                      step.status === "running" || step.status === "retrying"
                        ? "spin 1.5s linear infinite"
                        : "none",
                  }}
                >
                  {STEP_ICONS[step.status]}
                </span>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <span
                      style={{
                        color: STEP_COLORS[step.status],
                        fontWeight: step.status !== "pending" ? 600 : 400,
                        fontSize: "13px",
                      }}
                    >
                      {idx + 1}. {step.label}
                    </span>
                    <div
                      style={{
                        display: "flex",
                        gap: "8px",
                        alignItems: "center",
                      }}
                    >
                      {step.status === "retrying" && (
                        <span
                          style={{
                            fontSize: "11px",
                            color: "#f97316",
                            background: "rgba(249,115,22,0.15)",
                            padding: "2px 8px",
                            borderRadius: "10px",
                            border: "1px solid rgba(249,115,22,0.3)",
                          }}
                        >
                          重试 {step.attempt}/{step.max_attempts}
                        </span>
                      )}
                      {step.elapsed !== null && (
                        <span style={{ fontSize: "11px", color: "#475569" }}>
                          {step.elapsed}s
                        </span>
                      )}
                    </div>
                  </div>
                  {step.message && step.status !== "pending" && (
                    <p
                      style={{
                        color: "#64748b",
                        fontSize: "12px",
                        margin: "3px 0 0",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {step.message}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Result stats */}
          {task.status === "done" && (
            <div
              style={{
                marginTop: "16px",
                padding: "14px",
                background: "rgba(16,185,129,0.08)",
                border: "1px solid rgba(16,185,129,0.3)",
                borderRadius: "8px",
                display: "flex",
                gap: "16px",
                flexWrap: "wrap",
              }}
            >
              <div style={{ color: "#10b981", fontSize: "13px" }}>
                <strong>📚 引用文献</strong>: {task.total_cited_papers} 篇
              </div>
              {task.review_id && (
                <div style={{ color: "#60a5fa", fontSize: "13px" }}>
                  <strong>📄 综述 ID</strong>: {task.review_id}
                </div>
              )}
              <div style={{ display: "flex", gap: "8px", marginLeft: "auto" }}>
                <button
                  onClick={() => setShowMarkdown(!showMarkdown)}
                  style={{
                    padding: "6px 14px",
                    borderRadius: "6px",
                    border: "1px solid #334155",
                    background: "transparent",
                    color: "#94a3b8",
                    cursor: "pointer",
                    fontSize: "12px",
                  }}
                >
                  {showMarkdown ? "收起预览" : "预览全文"}
                </button>
                <button
                  onClick={handleDownload}
                  style={{
                    padding: "6px 14px",
                    borderRadius: "6px",
                    border: "none",
                    background: "linear-gradient(135deg, #3b82f6, #1d4ed8)",
                    color: "#fff",
                    cursor: "pointer",
                    fontSize: "12px",
                    fontWeight: 600,
                  }}
                >
                  ⬇️ 下载 .md
                </button>
              </div>
            </div>
          )}

          {/* Failure retry button */}
          {task.status === "failed" && (
            <div
              style={{
                marginTop: "12px",
                display: "flex",
                gap: "8px",
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <button
                disabled={isResuming}
                onClick={async () => {
                  try {
                    setIsResuming(true);
                    const res = await fetch(
                      `${API_BASE_URL}/api/reviews/phd/task/${task.task_id}/resume`,
                      {
                        method: "POST",
                      },
                    );
                    if (!res.ok) {
                      const errText = await res.text();
                      setError(`恢复失败: ${errText}`);
                      setIsResuming(false);
                      return;
                    }
                    setError(null);
                    // Reconnect SSE stream
                    cleanup();
                    const es = new EventSource(
                      `${API_BASE_URL}/api/reviews/phd/task/${task.task_id}/stream`,
                    );
                    eventSourceRef.current = es;
                    const handleEvent = (e: MessageEvent) => {
                      try {
                        const taskData: TaskState = JSON.parse(e.data);
                        setTask(taskData);
                        if (
                          taskData.status === "done" ||
                          taskData.status === "failed"
                        ) {
                          cleanup();
                        }
                      } catch {
                        /* ignore */
                      }
                    };
                    es.addEventListener("snapshot", handleEvent);
                    es.addEventListener("step_update", handleEvent);
                    es.addEventListener("task_done", handleEvent);
                    es.addEventListener("task_error", (e: MessageEvent) => {
                      try {
                        const errData = JSON.parse(e.data);
                        setError(errData.error || "Task failed");
                        if (errData.task) setTask(errData.task);
                      } catch {
                        /* ignore */
                      }
                      cleanup();
                    });
                    es.onerror = () => {
                      cleanup();
                      fetch(
                        `${API_BASE_URL}/api/reviews/phd/task/${task.task_id}`,
                      )
                        .then((r) => r.json())
                        .then(setTask)
                        .catch(() => {});
                    };
                  } catch (e) {
                    setError(`恢复请求失败: ${e}`);
                  } finally {
                    setIsResuming(false);
                  }
                }}
                style={{
                  padding: "8px 16px",
                  borderRadius: "6px",
                  border: "none",
                  background: isResuming
                    ? "#94a3b8"
                    : "linear-gradient(135deg, #10b981, #059669)",
                  color: "#fff",
                  fontWeight: 600,
                  cursor: isResuming ? "not-allowed" : "pointer",
                  fontSize: "13px",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                {isResuming ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  "▶️"
                )}
                {isResuming ? "正在恢复..." : "断点续跑"}
              </button>
              <button
                disabled={isResuming}
                onClick={() => {
                  setTask(null);
                  setError(null);
                }}
                style={{
                  padding: "8px 16px",
                  borderRadius: "6px",
                  border: "none",
                  background: "linear-gradient(135deg, #f59e0b, #d97706)",
                  color: "#fff",
                  fontWeight: 600,
                  cursor: "pointer",
                  fontSize: "13px",
                }}
              >
                🔁 重新开始
              </button>
              {task.error && (
                <span
                  style={{
                    color: "#ef4444",
                    fontSize: "12px",
                    alignSelf: "center",
                  }}
                >
                  {task.error}
                </span>
              )}
            </div>
          )}

          {/* Markdown preview */}
          {showMarkdown && task.full_markdown && (
            <div
              style={{
                marginTop: "16px",
                maxHeight: "600px",
                overflow: "auto",
                padding: "16px",
                background: "#0f172a",
                borderRadius: "8px",
                border: "1px solid #1e293b",
                fontSize: "14px",
                lineHeight: 1.7,
                color: "#cbd5e1",
              }}
            >
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {task.full_markdown}
              </ReactMarkdown>
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default AsyncTaskPanel;
