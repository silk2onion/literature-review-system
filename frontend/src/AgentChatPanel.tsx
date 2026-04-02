import { useState, useRef, useEffect, useCallback } from "react";
import {
  Bot,
  X,
  MessageSquare,
  Trash2,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { API_BASE_URL } from "./api/config";
import {
  ChatMessage,
  ChatLoadingIndicator,
  ChatSessionList,
  ChatInput,
} from "./components/agent";
import type {
  ChatMessageData,
  ChatSession,
  ChatMode,
  ActionResult,
} from "./components/agent";

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

function makeWelcomeMsg(mode: ChatMode): ChatMessageData {
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
      return [createNewSession("agent")];
    }
    const parsed = JSON.parse(raw);

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
        localStorage.removeItem("agent_chat_history");
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

// ── API ────────────────────────────────────────

async function callAgent(
  message: string,
  history: { role: string; content: string }[],
  mode: ChatMode = "agent",
): Promise<{ reply: string; action: ActionResult | null }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 300_000);

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

// ── Main Panel Component ──────────────────────────────

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
            const proactiveMsg: ChatMessageData = {
              id: `proactive-${data.task_id}-${Date.now()}`,
              role: data.role || "assistant",
              content: data.content,
              timestamp: data.timestamp || new Date().toISOString(),
            };

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

  // ── Session management ─────────────────────────────

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

  // ── Send message ──────────────────────────────────

  const sendMessage = useCallback(
    async (text: string, historyOverride?: ChatMessageData[]) => {
      if (!text.trim() || loading) return;

      const userMsg: ChatMessageData = {
        id: `user-${Date.now()}`,
        role: "user",
        content: text.trim(),
        timestamp: new Date().toISOString(),
      };

      const base = historyOverride ?? messages;
      const updatedMessages = [...base, userMsg];

      let newTitle = activeSession.title;
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

        const aiMsg: ChatMessageData = {
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
        const errorMsg: ChatMessageData = {
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
    [loading, messages, activeSession.title, activeSessionId, mode],
  );

  const regenerate = useCallback(() => {
    const lastUserIdx = messages.findLastIndex(
      (m: ChatMessageData) => m.role === "user",
    );
    if (lastUserIdx < 0) return;

    const lastUserMsg = messages[lastUserIdx];
    const truncated = messages.slice(0, lastUserIdx);

    updateActiveSession((s) => ({ ...s, messages: truncated }));
    sendMessage(lastUserMsg.content, truncated);
  }, [messages, sendMessage]);

  const startEdit = (msg: ChatMessageData) => {
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
      {/* Sidebar */}
      {sidebarOpen && (
        <ChatSessionList
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSelectSession={setActiveSessionId}
          onNewChat={handleNewChat}
          onDeleteSession={handleDeleteSession}
        />
      )}

      {/* Main chat area */}
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

        {/* Messages */}
        <div className="agent-messages">
          {messages.map((msg) => (
            <ChatMessage
              key={msg.id}
              msg={msg}
              editingId={editingId}
              editText={editText}
              setEditText={setEditText}
              onStartEdit={startEdit}
              onConfirmEdit={confirmEdit}
              onCancelEdit={() => setEditingId(null)}
              onRegenerate={regenerate}
              onDelete={deleteMessage}
              loading={loading}
            />
          ))}

          {loading && <ChatLoadingIndicator />}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <ChatInput
          ref={inputRef}
          input={input}
          setInput={setInput}
          loading={loading}
          mode={mode}
          onSend={() => sendMessage(input)}
          onSwitchMode={switchMode}
          onKeyDown={handleKeyDown}
        />
      </div>
    </div>
  );
}

// ── Toggle Button ────────────────────────────────────

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
