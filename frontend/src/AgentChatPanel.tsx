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
import { useLocale } from "./hooks/useLocale";

// ── persistence ─────────────────────────────────

const STORAGE_KEY = "agent_chat_sessions";

function makeWelcomeMsg(
  mode: ChatMode,
  t: (key: string) => string
): ChatMessageData {
  return {
    id: "welcome",
    role: "assistant",
    content: mode === "agent" ? t("agent.welcomeAgent") : t("agent.welcomeAsk"),
    timestamp: new Date().toISOString(),
  };
}

function createNewSession(
  mode: ChatMode = "agent",
  t?: (key: string) => string
): ChatSession {
  return {
    id: `sess-${Date.now()}`,
    title: t ? t("agent.newConversation") : "新对话",
    updatedAt: new Date().toISOString(),
    mode,
    messages: t
      ? [makeWelcomeMsg(mode, t)]
      : [
          {
            id: "welcome",
            role: "assistant",
            content: "",
            timestamp: new Date().toISOString(),
          },
        ],
  };
}

function loadSessions(t?: (key: string) => string): ChatSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [createNewSession("agent", t)];
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
        title: t ? t("agent.previousChat") : "之前的对话",
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
          title: t ? t("agent.previousChat") : "之前的对话",
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
    return [createNewSession("agent", t)];
  } catch {
    return [createNewSession("agent", t)];
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
  mode: ChatMode = "agent"
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

/** SSE 流式调用 Agent */
async function callAgentStream(
  message: string,
  history: { role: string; content: string }[],
  mode: ChatMode,
  callbacks: {
    onPhase: (phase: string, message: string, tool?: string) => void;
    onAction: (action: ActionResult) => void;
    onDelta: (content: string) => void;
    onDone: () => void;
    onError: (message: string) => void;
  },
  signal?: AbortSignal
): Promise<void> {
  const resp = await fetch(`${API_BASE_URL}/api/agent/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, history, mode }),
    signal,
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`HTTP ${resp.status}: ${text.slice(0, 200)}`);
  }

  const reader = resp.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Parse SSE events from buffer
      const parts = buffer.split("\n\n");
      buffer = parts.pop() || ""; // last part may be incomplete

      for (const part of parts) {
        if (!part.trim()) continue;

        let eventType = "message";
        let eventData = "";

        for (const line of part.split("\n")) {
          if (line.startsWith("event: ")) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            eventData = line.slice(6);
          }
        }

        if (!eventData) continue;

        try {
          const data = JSON.parse(eventData);
          switch (eventType) {
            case "phase":
              callbacks.onPhase(data.phase, data.message, data.tool);
              break;
            case "action":
              callbacks.onAction(data);
              break;
            case "delta":
              callbacks.onDelta(data.content);
              break;
            case "done":
              callbacks.onDone();
              break;
            case "error":
              callbacks.onError(data.message);
              break;
          }
        } catch {
          // Malformed JSON — skip this event
        }
      }
    }
  } finally {
    reader.releaseLock();
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
      | "monitoring"
  ) => void;
}

export default function AgentChatPanel({
  isOpen,
  onClose,
  onNavigate,
}: AgentChatPanelProps) {
  const { t } = useLocale();

  useEffect(() => {
    (window as any).onAgentNavigate = onNavigate;
    return () => {
      delete (window as any).onAgentNavigate;
    };
  }, [onNavigate]);

  // Session State
  const [sessions, setSessions] = useState<ChatSession[]>(() =>
    loadSessions(t)
  );
  const [activeSessionId, setActiveSessionId] = useState<string>(
    () => sessions[0]?.id
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
  /** 用于中断当前流式请求 */
  const abortRef = useRef<AbortController | null>(null);

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
                (s) => s.id === activeSessionId
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
    abortRef.current?.abort(); // 中断当前流式请求
    setLoading(false);
    const newSession = createNewSession("agent", t);
    setSessions((prev) => [newSession, ...prev]);
    setActiveSessionId(newSession.id);
  };

  const handleDeleteSession = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setSessions((prev) => {
      const updated = prev.filter((s) => s.id !== id);
      if (updated.length === 0) {
        const fresh = createNewSession("agent", t);
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
    updateFn: (session: ChatSession) => ChatSession
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
      if (newTitle === t("agent.newConversation") && base.length <= 1) {
        newTitle = text.length > 15 ? text.slice(0, 15) + "..." : text;
      }

      // Create placeholder AI message
      const aiMsgId = `ai-${Date.now()}`;
      const aiMsg: ChatMessageData = {
        id: aiMsgId,
        role: "assistant",
        content: "",
        timestamp: new Date().toISOString(),
        _streamPhase: "thinking",
        _streamPhaseMsg: "正在思考...",
      };

      updateActiveSession((s) => ({
        ...s,
        title: newTitle,
        messages: [...updatedMessages, aiMsg],
        updatedAt: new Date().toISOString(),
      }));

      setInput("");
      setLoading(true);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 300_000);

      let accumulatedContent = "";
      let hasError = false;

      try {
        const historyData = updatedMessages
          .filter((m) => m.id !== "welcome")
          .map((m) => ({ role: m.role, content: m.content }));

        await callAgentStream(
          text.trim(),
          historyData,
          mode,
          {
            onPhase: (phase, phaseMsg) => {
              updateActiveSession((s) => ({
                ...s,
                messages: s.messages.map((m) =>
                  m.id === aiMsgId
                    ? { ...m, _streamPhase: phase, _streamPhaseMsg: phaseMsg }
                    : m
                ),
              }));
            },
            onAction: (action) => {
              updateActiveSession((s) => ({
                ...s,
                messages: s.messages.map((m) =>
                  m.id === aiMsgId ? { ...m, action } : m
                ),
              }));
            },
            onDelta: (content) => {
              accumulatedContent += content;
              const snapshot = accumulatedContent;
              updateActiveSession((s) => ({
                ...s,
                messages: s.messages.map((m) =>
                  m.id === aiMsgId ? { ...m, content: snapshot } : m
                ),
              }));
            },
            onDone: () => {
              if (hasError) return; // Error already handled — don't overwrite
              const finalContent = accumulatedContent;
              updateActiveSession((s) => ({
                ...s,
                messages: s.messages.map((m) => {
                  if (m.id !== aiMsgId) return m;
                  const { _streamPhase, _streamPhaseMsg, ...rest } = m;
                  return {
                    ...rest,
                    content: finalContent || t("agent.emptyReply"),
                  };
                }),
                updatedAt: new Date().toISOString(),
              }));
            },
            onError: (errMsg) => {
              hasError = true;
              const errorContent = accumulatedContent
                ? `${accumulatedContent}\n\n⚠️ ${errMsg}`
                : `${t("agent.requestFailed")}${errMsg}\n\n${t(
                    "agent.errorHint"
                  )}`;
              updateActiveSession((s) => ({
                ...s,
                messages: s.messages.map((m) =>
                  m.id === aiMsgId
                    ? {
                        ...m,
                        content: errorContent,
                        _streamPhase: undefined,
                        _streamPhaseMsg: undefined,
                      }
                    : m
                ),
                updatedAt: new Date().toISOString(),
              }));
            },
          },
          controller.signal
        );
      } catch (err) {
        if (!hasError) {
          const errName =
            (err as Error).name === "AbortError"
              ? t("agent.requestTimeout")
              : (err as Error).message;
          updateActiveSession((s) => ({
            ...s,
            messages: s.messages.map((m) =>
              m.id === aiMsgId
                ? {
                    ...m,
                    content: `${t("agent.requestFailed")}${errName}\n\n${t(
                      "agent.errorHint"
                    )}`,
                    _streamPhase: undefined,
                    _streamPhaseMsg: undefined,
                  }
                : m
            ),
            updatedAt: new Date().toISOString(),
          }));
        }
      } finally {
        clearTimeout(timeout);
        abortRef.current = null;
        setLoading(false);
        // 确保流式状态总是被清理（防止异常断流导致消息卡在 streaming 状态）
        updateActiveSession((s) => ({
          ...s,
          messages: s.messages.map((m) => {
            if (m.id !== aiMsgId || !m._streamPhase) return m;
            const { _streamPhase, _streamPhaseMsg, ...rest } = m;
            return {
              ...rest,
              content:
                rest.content || accumulatedContent || t("agent.emptyReply"),
            };
          }),
        }));
      }
    },
    [loading, messages, activeSession.title, activeSessionId, mode, t]
  );

  const regenerate = useCallback(() => {
    const lastUserIdx = messages.findLastIndex(
      (m: ChatMessageData) => m.role === "user"
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
    [messages, editText, sendMessage]
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
      messages: [makeWelcomeMsg(s.mode, t)],
      title: t("agent.newConversation"),
    }));
  };

  const switchMode = (newMode: ChatMode) => {
    if (newMode === mode) return;
    updateActiveSession((s) => {
      let newMessages = s.messages;
      if (s.messages.length === 1 && s.messages[0].id === "welcome") {
        newMessages = [makeWelcomeMsg(newMode, t)];
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
              title={
                sidebarOpen
                  ? t("agent.collapseSidebar")
                  : t("agent.expandSidebar")
              }
            >
              {sidebarOpen ? (
                <PanelLeftClose size={18} />
              ) : (
                <PanelLeftOpen size={18} />
              )}
            </button>
            <Bot size={18} />
            <span style={{ fontWeight: 600, fontSize: 14 }}>
              {t("agent.title")}
            </span>
            <span
              style={{
                fontSize: 11,
                color: "#94a3b8",
                background: "#f1f5f9",
                padding: "1px 6px",
                borderRadius: 8,
              }}
            >
              {t("agent.messageCount", {
                count: messages.filter((m) => m.id !== "welcome").length,
              })}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
            <button
              onClick={clearHistory}
              className="agent-close-btn"
              title={t("agent.clearHistory")}
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

          {loading && !messages.some((m) => m._streamPhase) && (
            <ChatLoadingIndicator />
          )}

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
      title="AI Assistant"
    >
      <MessageSquare size={18} />
    </button>
  );
}
