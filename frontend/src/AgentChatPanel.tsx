import { useState, useRef, useEffect, useCallback } from "react";
import {
  Send,
  Bot,
  User,
  Zap,
  X,
  MessageSquare,
  Loader,
  RefreshCw,
  Pencil,
  Check,
  Trash2,
  Sparkles,
  ExternalLink,
  Plus,
  MessageCircle,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";

const API_BASE_URL = "http://localhost:5444";

// ── 类型 ────────────────────────────────────────────

type ActionResult = {
  tool: string;
  params: Record<string, unknown>;
  result: Record<string, unknown>;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  action?: ActionResult | null;
  timestamp: string; // ISO string for serialization
};

type ChatMode = "ask" | "agent";

type ChatSession = {
  id: string;
  title: string;
  updatedAt: string;
  mode: ChatMode;
  messages: ChatMessage[];
};

// ── 工具图标和标签 ──────────────────────────────────

const TOOL_LABELS: Record<
  string,
  { label: string; emoji: string; color: string }
> = {
  search_papers: { label: "搜索文献", emoji: "🔍", color: "#3b82f6" },
  list_staging: { label: "查看暂存库", emoji: "📋", color: "#8b5cf6" },
  promote_papers: { label: "提升文献", emoji: "⬆️", color: "#22c55e" },
  delete_staging: { label: "删除暂存", emoji: "🗑️", color: "#ef4444" },
  search_library: { label: "搜索正式库", emoji: "📚", color: "#f59e0b" },
  sync_citations: { label: "同步引用", emoji: "🔗", color: "#06b6d4" },
  system_status: { label: "系统状态", emoji: "⚙️", color: "#64748b" },
  general_chat: { label: "对话", emoji: "💬", color: "#6366f1" },
  generate_framework: { label: "生成框架", emoji: "📝", color: "#8b5cf6" },
  start_review_task: { label: "异步生成综述", emoji: "🚀", color: "#ec4899" },
  run_phd_pipeline: { label: "运行管线", emoji: "🔬", color: "#14b8a6" },
  list_reviews: { label: "查看综述", emoji: "📄", color: "#f59e0b" },
  export_review: { label: "导出综述", emoji: "📥", color: "#22c55e" },
  semantic_search: { label: "语义搜索", emoji: "🧠", color: "#a855f7" },
  manage_groups: { label: "管理分组", emoji: "📁", color: "#64748b" },
};

// ── 操作卡片组件 ────────────────────────────────────

function ActionCard({ action }: { action: ActionResult }) {
  const toolInfo = TOOL_LABELS[action.tool] || {
    label: action.tool,
    emoji: "⚡",
    color: "#64748b",
  };

  return (
    <div
      style={{
        margin: "8px 0",
        padding: "10px 14px",
        borderRadius: 10,
        border: `1px solid ${toolInfo.color}22`,
        backgroundColor: `${toolInfo.color}08`,
        fontSize: 13,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 6,
        }}
      >
        <Zap size={14} style={{ color: toolInfo.color }} />
        <span style={{ fontWeight: 600, color: toolInfo.color, fontSize: 12 }}>
          {toolInfo.emoji} {toolInfo.label}
        </span>
      </div>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
          alignItems: "center",
        }}
      >
        {action.result.error ? (
          <span style={{ color: "#ef4444" }}>
            ❌ {action.result.error as string}
          </span>
        ) : (
          <>
            {typeof action.result.total === "number" && (
              <span style={styles.badge}>{action.result.total} 条</span>
            )}
            {(action.result.task_id ||
              action.result.id ||
              action.result.job_id) && (
              <>
                <span style={styles.badge}>
                  🚀 ID:{" "}
                  {String(
                    action.result.task_id ||
                      action.result.id ||
                      action.result.job_id,
                  )}
                </span>
                <button
                  onClick={() => {
                    const nav = (window as any).onAgentNavigate;
                    if (nav) nav("monitoring");
                  }}
                  style={styles.actionBtn}
                >
                  前往监控面板 <ExternalLink size={10} />
                </button>
              </>
            )}
            {/* Fallback for other results */}
            {!action.result.task_id && !action.result.error && (
              <span style={{ color: toolInfo.color }}>操作成功</span>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const styles = {
  badge: {
    padding: "2px 8px",
    borderRadius: 12,
    backgroundColor: "rgba(99, 102, 241, 0.1)",
    color: "#4f46e5",
    fontSize: 11,
    fontWeight: 500 as const,
  },
  actionBtn: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    padding: "2px 8px",
    borderRadius: 12,
    backgroundColor: "#6366f1",
    color: "white",
    fontSize: 11,
    fontWeight: 500 as const,
    border: "none",
    cursor: "pointer",
  },
};

// ── persistence ─────────────────────────────────────

const STORAGE_KEY = "agent_chat_sessions";

const WELCOME_MESSAGES: Record<ChatMode, string> = {
  agent:
    "👋 你好！我是文献综述助手。你可以用自然语言告诉我你想做什么，比如：\n\n" +
    "• 「搜索 transit oriented development 的论文」\n" +
    "• 「暂存库有哪些论文」\n" +
    "• 「把暂存库的论文提升为正式库」\n" +
    "• 「系统现在什么状态」",
  ask:
    "👋 你好！我是学术研究助手。你可以问我任何学术问题，比如：\n\n" +
    "• 「TOD 是什么概念」\n" +
    "• 「步行性评价有哪些常用方法」\n" +
    "• 「5Ds 框架包含哪些维度」\n" +
    "• 「如何写文献综述的理论框架」",
};

function makeWelcomeMsg(mode: ChatMode): ChatMessage {
  return {
    id: "welcome",
    role: "assistant",
    content: WELCOME_MESSAGES[mode],
    timestamp: new Date().toISOString(),
  };
}

function createNewSession(mode: ChatMode = "agent"): ChatSession {
  return {
    id: `sess-${Date.now()}`,
    title: "新对话",
    updatedAt: new Date().toISOString(),
    mode,
    messages: [makeWelcomeMsg(mode)],
  };
}

function loadSessions(): ChatSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      // Return a default new session
      return [createNewSession("agent")];
    }
    const parsed = JSON.parse(raw);

    // Legacy migration: If it's an array of messages (old format)
    if (
      Array.isArray(parsed) &&
      parsed.length > 0 &&
      !("messages" in parsed[0])
    ) {
      const mode =
        (sessionStorage.getItem("agent_chat_mode") as ChatMode) || "agent";
      const migratedSession: ChatSession = {
        id: `sess-legacy-${Date.now()}`,
        title: "之前的对话",
        updatedAt: new Date().toISOString(),
        mode,
        messages: parsed,
      };
      saveSessions([migratedSession]);
      return [migratedSession];
    }

    // Legacy migration from old flat history logic to session
    // Just in case we also have 'agent_chat_history' around
    const oldHistoryRaw = localStorage.getItem("agent_chat_history");
    let legacySessions: ChatSession[] = [];
    if (oldHistoryRaw && (!Array.isArray(parsed) || parsed.length === 0)) {
      const oldHistory = JSON.parse(oldHistoryRaw);
      if (
        Array.isArray(oldHistory) &&
        oldHistory.length > 0 &&
        !("messages" in oldHistory[0])
      ) {
        const mode =
          (sessionStorage.getItem("agent_chat_mode") as ChatMode) || "agent";
        const migratedSession: ChatSession = {
          id: `sess-legacy-${Date.now()}`,
          title: "之前的对话",
          updatedAt: new Date().toISOString(),
          mode,
          messages: oldHistory,
        };
        legacySessions.push(migratedSession);
        localStorage.removeItem("agent_chat_history"); // delete old
      }
    }

    if (Array.isArray(parsed) && parsed.length > 0 && "messages" in parsed[0]) {
      return [...legacySessions, ...parsed];
    }
    if (legacySessions.length > 0) return legacySessions;
    return [createNewSession("agent")];
  } catch {
    return [createNewSession("agent")];
  }
}

function saveSessions(sessions: ChatSession[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  } catch {
    /* quota exceeded — ignore */
  }
}

// ── API 调用 ────────────────────────────────────────

async function callAgent(
  message: string,
  history: { role: string; content: string }[],
  mode: ChatMode = "agent",
): Promise<{ reply: string; action: ActionResult | null }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 300_000); // 5 min for multi-step agent

  try {
    const resp = await fetch(`${API_BASE_URL}/api/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, history, mode }),
      signal: controller.signal,
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`HTTP ${resp.status}: ${text.slice(0, 200)}`);
    }

    return await resp.json();
  } finally {
    clearTimeout(timeout);
  }
}

// ── 主面板组件 ──────────────────────────────────────

interface AgentChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate?: (
    tab:
      | "search"
      | "library"
      | "staging"
      | "rag"
      | "draft"
      | "orchestrate"
      | "monitoring",
  ) => void;
}

export default function AgentChatPanel({
  isOpen,
  onClose,
  onNavigate,
}: AgentChatPanelProps) {
  useEffect(() => {
    (window as any).onAgentNavigate = onNavigate;
    return () => {
      delete (window as any).onAgentNavigate;
    };
  }, [onNavigate]);

  // Session State
  const [sessions, setSessions] = useState<ChatSession[]>(() => loadSessions());
  const [activeSessionId, setActiveSessionId] = useState<string>(
    () => sessions[0]?.id,
  );
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Current session derived state
  const activeSession =
    sessions.find((s) => s.id === activeSessionId) || sessions[0];
  const mode = activeSession.mode;
  const messages = activeSession.messages;

  // UI State
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Persist on change
  useEffect(() => {
    saveSessions(sessions);
  }, [sessions]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Focus on open
  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 300);
  }, [isOpen, activeSessionId]);

  // WebSocket for proactive maid heartbeat
  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimer: number;

    const connect = () => {
      const wsUrl = API_BASE_URL.replace(/^http/, "ws") + "/api/agent/ws";
      ws = new WebSocket(wsUrl);

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "proactive_notification") {
            const proactiveMsg: ChatMessage = {
              id: `proactive-${data.task_id}-${Date.now()}`,
              role: data.role || "assistant",
              content: data.content,
              timestamp: data.timestamp || new Date().toISOString(),
            };

            // Append the message to the active session
            setSessions((prevSessions) => {
              const targetIdx = prevSessions.findIndex(
                (s) => s.id === activeSessionId,
              );
              if (targetIdx < 0) return prevSessions;
              const newSessions = [...prevSessions];
              newSessions[targetIdx] = {
                ...newSessions[targetIdx],
                messages: [...newSessions[targetIdx].messages, proactiveMsg],
                updatedAt: new Date().toISOString(),
              };
              return newSessions;
            });
          }
        } catch (err) {
          console.error("Agent WS receive error", err);
        }
      };

      ws.onclose = () => {
        reconnectTimer = window.setTimeout(connect, 5000);
      };
    };

    connect();

    return () => {
      clearTimeout(reconnectTimer);
      if (ws) {
        ws.onclose = null;
        ws.close();
      }
    };
  }, [activeSessionId]);

  // ── Session 管理 ─────────────────────────────────

  const handleNewChat = () => {
    const newSession = createNewSession("agent");
    setSessions((prev) => [newSession, ...prev]);
    setActiveSessionId(newSession.id);
  };

  const handleDeleteSession = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setSessions((prev) => {
      const updated = prev.filter((s) => s.id !== id);
      if (updated.length === 0) {
        const fresh = createNewSession("agent");
        setActiveSessionId(fresh.id);
        return [fresh];
      }
      if (activeSessionId === id) {
        setActiveSessionId(updated[0].id);
      }
      return updated;
    });
  };

  const updateActiveSession = (
    updateFn: (session: ChatSession) => ChatSession,
  ) => {
    setSessions((prev) => {
      const targetIdx = prev.findIndex((s) => s.id === activeSessionId);
      if (targetIdx < 0) return prev;
      const newSessions = [...prev];
      newSessions[targetIdx] = updateFn(newSessions[targetIdx]);
      return newSessions;
    });
  };

  // ── 发送消息 ──────────────────────────────────────

  const sendMessage = useCallback(
    async (text: string, historyOverride?: ChatMessage[]) => {
      if (!text.trim() || loading) return;

      const userMsg: ChatMessage = {
        id: `user-${Date.now()}`,
        role: "user",
        content: text.trim(),
        timestamp: new Date().toISOString(),
      };

      const base = historyOverride ?? messages;
      const updatedMessages = [...base, userMsg];

      let newTitle = activeSession.title;
      // Auto name if it's the first real user message
      if (newTitle === "新对话" && base.length <= 1) {
        newTitle = text.length > 15 ? text.slice(0, 15) + "..." : text;
      }

      updateActiveSession((s) => ({
        ...s,
        title: newTitle,
        messages: updatedMessages,
        updatedAt: new Date().toISOString(),
      }));

      setInput("");
      setLoading(true);

      try {
        const historyData = updatedMessages
          .filter((m) => m.id !== "welcome")
          .map((m) => ({ role: m.role, content: m.content }));

        const data = await callAgent(text.trim(), historyData, mode);

        const aiMsg: ChatMessage = {
          id: `ai-${Date.now()}`,
          role: "assistant",
          content: data.reply || "(空回复)",
          action: data.action,
          timestamp: new Date().toISOString(),
        };

        updateActiveSession((s) => ({
          ...s,
          messages: [...s.messages, aiMsg],
          updatedAt: new Date().toISOString(),
        }));
      } catch (err) {
        const errName =
          (err as Error).name === "AbortError"
            ? "请求超时（5分钟），请检查后端日志"
            : (err as Error).message;
        const errorMsg: ChatMessage = {
          id: `err-${Date.now()}`,
          role: "assistant",
          content: `请求失败 😥：${errName}\n\n💡 提示：请检查后端是否正在运行（端口 5444）`,
          timestamp: new Date().toISOString(),
        };
        updateActiveSession((s) => ({
          ...s,
          messages: [...s.messages, errorMsg],
          updatedAt: new Date().toISOString(),
        }));
      } finally {
        setLoading(false);
      }
    },
    [loading, messages, activeSession.title, activeSessionId, mode], // activeSessionId used over activeSession.id
  );

  // ── 重新生成最后一条 AI 回复 ──────────────────────

  const regenerate = useCallback(() => {
    const lastUserIdx = messages.findLastIndex(
      (m: ChatMessage) => m.role === "user",
    );
    if (lastUserIdx < 0) return;

    const lastUserMsg = messages[lastUserIdx];
    const truncated = messages.slice(0, lastUserIdx);

    updateActiveSession((s) => ({ ...s, messages: truncated }));
    sendMessage(lastUserMsg.content, truncated);
  }, [messages, sendMessage]);

  // ── 编辑用户消息 ─────────────────────────────────

  const startEdit = (msg: ChatMessage) => {
    setEditingId(msg.id);
    setEditText(msg.content);
  };

  const confirmEdit = useCallback(
    (msgId: string) => {
      const idx = messages.findIndex((m) => m.id === msgId);
      if (idx < 0) return;

      const truncated = messages.slice(0, idx);
      updateActiveSession((s) => ({ ...s, messages: truncated }));
      setEditingId(null);

      sendMessage(editText, truncated);
    },
    [messages, editText, sendMessage],
  );

  // ── 删除及模式切换 ────────────────────────────────

  const deleteMessage = (msgId: string) => {
    updateActiveSession((s) => ({
      ...s,
      messages: s.messages.filter((m) => m.id !== msgId),
    }));
  };

  const clearHistory = () => {
    updateActiveSession((s) => ({
      ...s,
      messages: [makeWelcomeMsg(s.mode)],
      title: "新对话",
    }));
  };

  const switchMode = (newMode: ChatMode) => {
    if (newMode === mode) return;
    updateActiveSession((s) => {
      let newMessages = s.messages;
      if (s.messages.length === 1 && s.messages[0].id === "welcome") {
        newMessages = [makeWelcomeMsg(newMode)];
      }
      return { ...s, mode: newMode, messages: newMessages };
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="agent-panel" style={{ width: sidebarOpen ? 630 : 380 }}>
      {/* 侧边栏: Chat History (Antigravity Style) */}
      {sidebarOpen && (
        <div className="agent-sidebar">
          <div className="agent-sidebar-header">历史对话</div>

          <button className="agent-new-chat-btn" onClick={handleNewChat}>
            <Plus size={16} /> 新建对话
          </button>

          <div className="agent-session-list">
            {sessions.map((sess) => (
              <div
                key={sess.id}
                className={`agent-session-item ${sess.id === activeSessionId ? "active" : ""}`}
                onClick={() => setActiveSessionId(sess.id)}
              >
                <MessageCircle
                  size={14}
                  style={{
                    color: "var(--text-secondary)",
                    marginRight: 8,
                    flexShrink: 0,
                  }}
                />
                <span className="agent-session-title">{sess.title}</span>
                <button
                  className="agent-session-delete"
                  onClick={(e) => handleDeleteSession(e, sess.id)}
                  title="删除对话"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 主聊天区 */}
      <div className="agent-chat-main">
        {/* Header */}
        <div className="agent-header">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="agent-close-btn"
              title={sidebarOpen ? "收起侧边栏" : "展开侧边栏"}
            >
              {sidebarOpen ? (
                <PanelLeftClose size={18} />
              ) : (
                <PanelLeftOpen size={18} />
              )}
            </button>
            <Bot size={18} />
            <span style={{ fontWeight: 600, fontSize: 14 }}>AI 助手</span>
            <span
              style={{
                fontSize: 11,
                color: "#94a3b8",
                background: "#f1f5f9",
                padding: "1px 6px",
                borderRadius: 8,
              }}
            >
              {messages.filter((m) => m.id !== "welcome").length} 条
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
            <button
              onClick={clearHistory}
              className="agent-close-btn"
              title="清除当前记录"
            >
              <Trash2 size={14} />
            </button>
            <button onClick={onClose} className="agent-close-btn">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Mode Switcher */}
        <div className="agent-mode-switcher">
          <button
            className={`agent-mode-btn ${mode === "ask" ? "active" : ""}`}
            onClick={() => switchMode("ask")}
          >
            <Sparkles size={13} />
            Ask
          </button>
          <button
            className={`agent-mode-btn ${mode === "agent" ? "active" : ""}`}
            onClick={() => switchMode("agent")}
          >
            <Zap size={13} />
            Agent
          </button>
        </div>

        {/* Messages */}
        <div className="agent-messages">
          {messages.map((msg) => (
            <div key={msg.id} className={`agent-msg ${msg.role}`}>
              <div className="agent-msg-avatar">
                {msg.role === "user" ? <User size={14} /> : <Bot size={14} />}
              </div>
              <div className="agent-msg-body">
                {/* Action Card */}
                {msg.action && msg.action.tool !== "general_chat" && (
                  <ActionCard action={msg.action} />
                )}

                {/* Text or Edit Mode */}
                {editingId === msg.id ? (
                  <div
                    style={{ display: "flex", flexDirection: "column", gap: 6 }}
                  >
                    <textarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      className="agent-input"
                      rows={3}
                      autoFocus
                      style={{ minHeight: 60 }}
                    />
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        onClick={() => confirmEdit(msg.id)}
                        className="agent-action-btn"
                        style={{ background: "#3b82f6", color: "white" }}
                      >
                        <Check size={12} /> 发送
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="agent-action-btn"
                      >
                        取消
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="agent-msg-text">
                    {msg.content.split("\n").map((line, i) => (
                      <span key={i}>
                        {line}
                        {i < msg.content.split("\n").length - 1 && <br />}
                      </span>
                    ))}
                  </div>
                )}

                {/* Action Bar (Hover) */}
                {msg.id !== "welcome" && editingId !== msg.id && (
                  <div className="agent-msg-actions">
                    {msg.role === "user" && (
                      <button
                        onClick={() => startEdit(msg)}
                        className="agent-action-btn"
                        title="编辑"
                      >
                        <Pencil size={11} />
                      </button>
                    )}
                    {msg.role === "assistant" && msg.id !== "welcome" && (
                      <button
                        onClick={regenerate}
                        className="agent-action-btn"
                        title="重新生成"
                        disabled={loading}
                      >
                        <RefreshCw size={11} />
                      </button>
                    )}
                    <button
                      onClick={() => deleteMessage(msg.id)}
                      className="agent-action-btn"
                      title="删除"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Loading indicator */}
          {loading && (
            <div className="agent-msg assistant">
              <div className="agent-msg-avatar">
                <Bot size={14} />
              </div>
              <div className="agent-msg-body">
                <div className="agent-thinking">
                  <Loader size={14} className="agent-spinner" />
                  <span>思考中...</span>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="agent-input-area">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              mode === "ask" ? "问我任何学术问题..." : "输入你的指令..."
            }
            rows={1}
            className="agent-input"
            disabled={loading}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || loading}
            className="agent-send-btn"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 触发按钮 ────────────────────────────────────────

export function AgentToggleButton({
  isOpen,
  onClick,
}: {
  isOpen: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`agent-toggle-btn ${isOpen ? "active" : ""}`}
      title="AI 助手"
    >
      <MessageSquare size={18} />
    </button>
  );
}
