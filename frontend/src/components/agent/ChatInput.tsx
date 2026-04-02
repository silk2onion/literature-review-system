import { forwardRef } from "react";
import { Send, Sparkles, Zap } from "lucide-react";
import type { ChatMode } from "./ChatSessionList";

interface ChatInputProps {
  input: string;
  setInput: (v: string) => void;
  loading: boolean;
  mode: ChatMode;
  onSend: () => void;
  onSwitchMode: (mode: ChatMode) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
}

const ChatInput = forwardRef<HTMLTextAreaElement, ChatInputProps>(
  ({ input, setInput, loading, mode, onSend, onSwitchMode, onKeyDown }, ref) => {
    return (
      <>
        {/* Mode Switcher */}
        <div className="agent-mode-switcher">
          <button
            className={`agent-mode-btn ${mode === "ask" ? "active" : ""}`}
            onClick={() => onSwitchMode("ask")}
          >
            <Sparkles size={13} />
            Ask
          </button>
          <button
            className={`agent-mode-btn ${mode === "agent" ? "active" : ""}`}
            onClick={() => onSwitchMode("agent")}
          >
            <Zap size={13} />
            Agent
          </button>
        </div>

        {/* Input Area */}
        <div className="agent-input-area">
          <textarea
            ref={ref}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={
              mode === "ask" ? "问我任何学术问题..." : "输入你的指令..."
            }
            rows={1}
            className="agent-input"
            disabled={loading}
          />
          <button
            onClick={onSend}
            disabled={!input.trim() || loading}
            className="agent-send-btn"
          >
            <Send size={16} />
          </button>
        </div>
      </>
    );
  },
);

ChatInput.displayName = "ChatInput";

export default ChatInput;
