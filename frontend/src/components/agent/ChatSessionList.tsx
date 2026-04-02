import { Plus, MessageCircle, Trash2 } from "lucide-react";

export type ChatMode = "ask" | "agent";

export type ChatSession = {
  id: string;
  title: string;
  updatedAt: string;
  mode: ChatMode;
  messages: import("./ChatMessage").ChatMessageData[];
};

interface ChatSessionListProps {
  sessions: ChatSession[];
  activeSessionId: string;
  onSelectSession: (id: string) => void;
  onNewChat: () => void;
  onDeleteSession: (e: React.MouseEvent, id: string) => void;
}

export default function ChatSessionList({
  sessions,
  activeSessionId,
  onSelectSession,
  onNewChat,
  onDeleteSession,
}: ChatSessionListProps) {
  return (
    <div className="agent-sidebar">
      <div className="agent-sidebar-header">历史对话</div>

      <button className="agent-new-chat-btn" onClick={onNewChat}>
        <Plus size={16} /> 新建对话
      </button>

      <div className="agent-session-list">
        {sessions.map((sess) => (
          <div
            key={sess.id}
            className={`agent-session-item ${sess.id === activeSessionId ? "active" : ""}`}
            onClick={() => onSelectSession(sess.id)}
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
              onClick={(e) => onDeleteSession(e, sess.id)}
              title="删除对话"
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
