import { useEffect, useState } from "react";
import { API_BASE_URL } from "../../api/config";

type LLMConnectionConfig = {
  api_key: string;
  base_url: string;
};

type Props = { open: boolean };

export default function LLMConnectionSettings({ open }: Props) {
  const [llmConnection, setLLMConnection] = useState<LLMConnectionConfig>({
    api_key: "",
    base_url: "https://api.openai.com/v1",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSaved(false);

    fetch(`${API_BASE_URL}/api/settings/llm-connection`)
      .then((res) => res.json())
      .then((data: LLMConnectionConfig) => setLLMConnection(data))
      .catch((err) => console.error("加载 LLM 连接配置失败", err));
  }, [open]);

  return (
    <section className="settings-section">
      <h3>🔗 LLM 连接</h3>
      <p className="settings-description">
        配置 OpenAI 兼容 API 的密钥和 Base URL。修改后立即热生效，无需重启后端。
      </p>

      {error && <div className="settings-error">错误: {error}</div>}

      <label className="settings-row">
        <span>API Key</span>
        <input
          type="password"
          value={llmConnection.api_key}
          onChange={(e) =>
            setLLMConnection((prev) => ({ ...prev, api_key: e.target.value }))
          }
          placeholder="sk-..."
          style={{ flex: 1 }}
        />
      </label>
      <label className="settings-row">
        <span>Base URL</span>
        <input
          type="text"
          value={llmConnection.base_url}
          onChange={(e) =>
            setLLMConnection((prev) => ({ ...prev, base_url: e.target.value }))
          }
          placeholder="https://api.openai.com/v1"
          style={{ flex: 1 }}
        />
      </label>
      <div className="settings-row" style={{ marginTop: "8px" }}>
        <button
          className="settings-secondary"
          onClick={async () => {
            setSaving(true);
            try {
              const res = await fetch(
                `${API_BASE_URL}/api/settings/llm-connection`,
                {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(llmConnection),
                },
              );
              if (!res.ok) throw new Error("保存失败");
              setSaved(true);
            } catch (err) {
              console.error(err);
              setError("保存 LLM 连接配置失败");
            } finally {
              setSaving(false);
            }
          }}
          disabled={saving}
        >
          {saving ? "保存中..." : saved ? "✓ 已保存" : "保存连接配置"}
        </button>
      </div>
    </section>
  );
}
