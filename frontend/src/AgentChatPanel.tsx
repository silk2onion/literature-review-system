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

// ── 工具图标和标签 ──────────────────────────────────

const TOOL_LABELS: Record<string, { label: string; emoji: string; color: string }> = {
  search_papers: { label: "搜索文献", emoji: "🔍", color: "#3b82f6" },
  list_staging: { label: "查看暂存库", emoji: "📋", color: "#8b5cf6" },
  promote_papers: { label: "提升文献", emoji: "⬆️", color: "#22c55e" },
  delete_staging: { label: "删除暂存", emoji: "🗑️", color: "#ef4444" },
  search_library: { label: "搜索正式库", emoji: "📚", color: "#f59e0b" },
  sync_citations: { label: "同步引用", emoji: "🔗", color: "#06b6d4" },
  system_status: { label: "系统状态", emoji: "⚙️", color: "#64748b" },
  general_chat: { label: "对话", emoji: "💬", color: "#6366f1" },
};

// ── 操作卡片组件 ────────────────────────────────────

function ActionCard({ action }: { action: ActionResult }) {
  const toolInfo = TOOL_LABELS[action.tool] || {
    label: action.tool,
    emoji: "⚡",
    color: "#64748b",
  };

  const highlights: string[] = [];
  const result = action.result;

  if (result.error) {
    highlights.push(`❌ ${result.error}`);
  } else {
    if (typeof result.total === "number") highlights.push(`共 ${result.total} 条`);
    if (typeof result.new_papers === "number")
      highlights.push(`新增 ${result.new_papers} 篇`);
    if (typeof result.promoted === "number")
      highlights.push(`提升 ${result.promoted} 篇`);
    if (typeof result.deleted === "number") highlights.push(`删除 ${result.deleted} 条`);
    if (typeof result.total_papers === "number")
      highlights.push(`正式库 ${result.total_papers} 篇`);
    if (typeof result.total_staging === "number")
      highlights.push(`暂存库 ${result.total_staging} 篇`);
    if (typeof result.processed_count === "number")
      highlights.push(`处理 ${result.processed_count} 篇`);
    if (typeof result.created_edges === "number")
      highlights.push(`新增引用 ${result.created_edges} 条`);
    if (typeof result.fetched_count === "number")
      highlights.push(`抓取 ${result.fetched_count} 篇`);
  }

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
        style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}
      >
        <Zap size={14} style={{ color: toolInfo.color }} />
        <span style={{ fontWeight: 600, color: toolInfo.color, fontSize: 12 }}>
          {toolInfo.emoji} {toolInfo.label}
        </span>
      </div>
      {highlights.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {highlights.map((h, i) => (
            <span
              key={i}
              style={{
                padding: "2px 8px",
                borderRadius: 12,
                backgroundColor: `${toolInfo.color}15`,
                color: toolInfo.color,
                fontSize: 11,
                fontWeight: 500,
              }}
            >
              {h}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── persistence ─────────────────────────────────────

const STORAGE_KEY = "agent_chat_history";
type ChatMode = "ask" | "agent";

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

function loadHistory(mode: ChatMode): ChatMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [makeWelcomeMsg(mode)];
    const parsed = JSON.parse(raw) as ChatMessage[];
    if (!Array.isArray(parsed) || parsed.length === 0) return [makeWelcomeMsg(mode)];
    return parsed;
  } catch {
    return [makeWelcomeMsg(mode)];
  }
}

function saveHistory(msgs: ChatMessage[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(msgs));
  } catch {
    /* quota exceeded — ignore */
  }
}

// ── API 调用 ────────────────────────────────────────

async function callAgent(
  message: string,
  history: { role: string; content: string }[],
  mode: ChatMode = "agent"
): Promise<{ reply: string; action: ActionResult | null }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);

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
}

export default function AgentChatPanel({ isOpen, onClose }: AgentChatPanelProps) {
  const [mode, setMode] = useState<ChatMode>(() => {
    return (sessionStorage.getItem("agent_chat_mode") as ChatMode) || "agent";
  });
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadHistory(mode));
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Persist mode
  useEffect(() => {
    sessionStorage.setItem("agent_chat_mode", mode);
  }, [mode]);

  // Persist on change
  useEffect(() => {
    saveHistory(messages);
  }, [messages]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Focus on open
  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 300);
  }, [isOpen]);

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
      const updated = [...base, userMsg];
      setMessages(updated);
      setInput("");
      setLoading(true);

      try {
        const history = updated
          .filter((m) => m.id !== "welcome")
          .map((m) => ({ role: m.role, content: m.content }));

        const data = await callAgent(text.trim(), history, mode);

        const aiMsg: ChatMessage = {
          id: `ai-${Date.now()}`,
          role: "assistant",
          content: data.reply || "(空回复)",
          action: data.action,
          timestamp: new Date().toISOString(),
        };

        setMessages((prev) => [...prev, aiMsg]);
      } catch (err) {
        const errName =
          (err as Error).name === "AbortError" ? "请求超时（60s）" : (err as Error).message;
        const errorMsg: ChatMessage = {
          id: `err-${Date.now()}`,
          role: "assistant",
          content: `请求失败 😥：${errName}\n\n💡 提示：请检查后端是否正在运行（端口 5444）`,
          timestamp: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, errorMsg]);
      } finally {
        setLoading(false);
      }
    },
    [loading, messages]
  );

  // ── 重新生成最后一条 AI 回复 ──────────────────────

  const regenerate = useCallback(() => {
    // Find the last user message
    const lastUserIdx = messages.findLastIndex((m) => m.role === "user");
    if (lastUserIdx < 0) return;

    const lastUserMsg = messages[lastUserIdx];
    // Remove everything after (and including) that user message
    const truncated = messages.slice(0, lastUserIdx);
    setMessages(truncated);

    // Re-send
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

      // Truncate everything from this message onwards
      const truncated = messages.slice(0, idx);
      setMessages(truncated);
      setEditingId(null);

      // Re-send with edited text
      sendMessage(editText, truncated);
    },
    [messages, editText, sendMessage]
  );

  // ── 删除消息 ─────────────────────────────────────

  const deleteMessage = (msgId: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== msgId));
  };

  // ── 清除历史 ─────────────────────────────────────

  const clearHistory = () => {
    localStorage.removeItem(STORAGE_KEY);
    setMessages([makeWelcomeMsg(mode)]);
  };

  const switchMode = (newMode: ChatMode) => {
    if (newMode === mode) return;
    setMode(newMode);
    // Update welcome message if it's the only message
    setMessages((prev) => {
      if (prev.length === 1 && prev[0].id === "welcome") {
        return [makeWelcomeMsg(newMode)];
      }
      return prev;
    });
  };

  // ── 键盘 ─────────────────────────────────────────

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="agent-panel">
      {/* Header */}
      <div className="agent-header">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
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
            title="清除历史"
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
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
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
          placeholder={mode === "ask" ? "问我任何学术问题..." : "输入你的指令..."}
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
