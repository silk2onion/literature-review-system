import { apiPost } from "./http";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export const agentApi = {
  chat(messages: ChatMessage[], mode: "ask" | "agent") {
    return apiPost<{
      reply: string;
      action?: {
        tool: string;
        params: Record<string, unknown>;
        result: Record<string, unknown>;
      } | null;
    }>("/api/agent/chat", { messages, mode });
  },
};
