import { useEffect, useState } from "react";
import { API_BASE_URL } from "../../api/config";

type Props = { open: boolean };

export default function SystemPromptSettings({ open }: Props) {
  const [systemPrompt, setSystemPrompt] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSaved(false);

    fetch(`${API_BASE_URL}/api/settings/system-prompt`)
      .then((res) => res.json())
      .then((data: { content: string }) => setSystemPrompt(data.content || ""))
      .catch((err) => console.error("加载系统提示词失败", err));
  }, [open]);

  return (
    <section className="settings-section">
      <h3>Agent 系统提示词</h3>
      <p className="settings-description">
        自定义 Agent 的系统提示词，将拼接在所有 AI
        对话的开头。可用于注入 VCP 插件指令、角色设定等。
      </p>

      {error && <div className="settings-error">错误: {error}</div>}

      <textarea
        value={systemPrompt}
        onChange={(e) => {
          setSystemPrompt(e.target.value);
          setSaved(false);
        }}
        placeholder="输入自定义系统提示词...例如：你是一位城市设计领域的研究助手..."
        rows={6}
        style={{
          width: "100%",
          boxSizing: "border-box",
          padding: "10px",
          borderRadius: "6px",
          border: "1px solid #334155",
          backgroundColor: "#1e293b",
          color: "#e2e8f0",
          fontSize: "13px",
          fontFamily: "monospace",
          resize: "vertical",
          minHeight: "100px",
        }}
      />
      <div className="settings-row" style={{ marginTop: "8px" }}>
        <button
          className="settings-secondary"
          onClick={async () => {
            setSaving(true);
            try {
              const res = await fetch(
                `${API_BASE_URL}/api/settings/system-prompt`,
                {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ content: systemPrompt }),
                },
              );
              if (!res.ok) throw new Error("保存失败");
              setSaved(true);
            } catch (err) {
              console.error(err);
              setError("保存系统提示词失败");
            } finally {
              setSaving(false);
            }
          }}
          disabled={saving}
        >
          {saving ? "保存中..." : saved ? "✓ 已保存" : "保存提示词"}
        </button>
      </div>
    </section>
  );
}
