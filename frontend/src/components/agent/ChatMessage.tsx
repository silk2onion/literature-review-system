import {
  Bot,
  User,
  Pencil,
  Check,
  RefreshCw,
  Trash2,
  Loader,
} from "lucide-react";
import ToolActionCard from "./ToolActionCard";
import type { ActionResult } from "./ToolActionCard";

export type ChatMessageData = {
  id: string;
  role: "user" | "assistant";
  content: string;
  action?: ActionResult | null;
  timestamp: string;
  /** Streaming-only transient fields */
  _streamPhase?: string;
  _streamPhaseMsg?: string;
};

interface ChatMessageProps {
  msg: ChatMessageData;
  editingId: string | null;
  editText: string;
  setEditText: (v: string) => void;
  onStartEdit: (msg: ChatMessageData) => void;
  onConfirmEdit: (msgId: string) => void;
  onCancelEdit: () => void;
  onRegenerate: () => void;
  onDelete: (msgId: string) => void;
  loading: boolean;
}

export default function ChatMessage({
  msg,
  editingId,
  editText,
  setEditText,
  onStartEdit,
  onConfirmEdit,
  onCancelEdit,
  onRegenerate,
  onDelete,
  loading,
}: ChatMessageProps) {
  return (
    <div className={`agent-msg ${msg.role}`}>
      <div className="agent-msg-avatar">
        {msg.role === "user" ? <User size={14} /> : <Bot size={14} />}
      </div>
      <div className="agent-msg-body">
        {/* Action Card */}
        {msg.action && msg.action.tool !== "general_chat" && (
          <ToolActionCard action={msg.action} />
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
                onClick={() => onConfirmEdit(msg.id)}
                className="agent-action-btn"
                style={{ background: "#3b82f6", color: "white" }}
              >
                <Check size={12} /> 发送
              </button>
              <button onClick={onCancelEdit} className="agent-action-btn">
                取消
              </button>
            </div>
          </div>
        ) : (
          <div className="agent-msg-text">
            {/* Phase indicator during streaming */}
            {msg._streamPhase && !msg.content && (
              <div className="agent-thinking">
                <Loader size={14} className="agent-spinner" />
                <span>{msg._streamPhaseMsg || "处理中..."}</span>
              </div>
            )}
            {/* Content (supports partial/streaming) */}
            {msg.content &&
              msg.content.split("\n").map((line, i) => (
                <span key={i}>
                  {line}
                  {i < msg.content.split("\n").length - 1 && <br />}
                </span>
              ))}
            {/* Streaming cursor */}
            {msg._streamPhase && msg.content && (
              <span className="agent-cursor">▌</span>
            )}
          </div>
        )}

        {/* Action Bar (Hover) */}
        {msg.id !== "welcome" && editingId !== msg.id && (
          <div className="agent-msg-actions">
            {msg.role === "user" && (
              <button
                onClick={() => onStartEdit(msg)}
                className="agent-action-btn"
                title="编辑"
              >
                <Pencil size={11} />
              </button>
            )}
            {msg.role === "assistant" && msg.id !== "welcome" && (
              <button
                onClick={onRegenerate}
                className="agent-action-btn"
                title="重新生成"
                disabled={loading}
              >
                <RefreshCw size={11} />
              </button>
            )}
            <button
              onClick={() => onDelete(msg.id)}
              className="agent-action-btn"
              title="删除"
            >
              <Trash2 size={11} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function ChatLoadingIndicator() {
  return (
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
  );
}
