import { useEffect, useState } from "react";
import { API_BASE_URL } from "../../api/config";

type AgentConfig = {
  proactive_enabled: boolean;
  heartbeat_interval: number;
};

type Props = { open: boolean };

export default function AgentSettings({ open }: Props) {
  const [agentConfig, setAgentConfig] = useState<AgentConfig>({
    proactive_enabled: true,
    heartbeat_interval: 60,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    fetch(`${API_BASE_URL}/api/settings/agent`)
      .then((res) => res.json())
      .then((data: AgentConfig) => setAgentConfig(data))
      .catch((err) => console.error("加载 Agent 配置失败", err));
  }, [open]);

  return (
    <section className="settings-section">
      <h3>Agent 主动交互 (萌妹女仆心跳)</h3>
      <p className="settings-description">
        开启后，小爱女仆会每隔一段时间检查任务进度，并主动在聊天框向你汇报~
      </p>

      {error && <div className="settings-error">错误: {error}</div>}

      <label className="settings-row">
        <span>启用主动汇报</span>
        <input
          type="checkbox"
          checked={agentConfig.proactive_enabled}
          onChange={(e) =>
            setAgentConfig((prev) => ({
              ...prev,
              proactive_enabled: e.target.checked,
            }))
          }
        />
      </label>
      <label className="settings-row">
        <span>心跳检查频率 (秒)</span>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
          }}
        >
          <input
            type="range"
            min="30"
            max="300"
            step="30"
            value={agentConfig.heartbeat_interval}
            onChange={(e) =>
              setAgentConfig((prev) => ({
                ...prev,
                heartbeat_interval: parseInt(e.target.value),
              }))
            }
            style={{ flex: 1 }}
          />
          <span style={{ minWidth: "40px" }}>
            {agentConfig.heartbeat_interval}s
          </span>
        </div>
      </label>
      <div className="settings-row">
        <button
          className="settings-secondary"
          onClick={async () => {
            setSaving(true);
            try {
              const res = await fetch(
                `${API_BASE_URL}/api/settings/agent`,
                {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(agentConfig),
                },
              );
              if (!res.ok) throw new Error("保存失败");
            } catch (err) {
              console.error(err);
              setError("保存 Agent 配置失败");
            } finally {
              setSaving(false);
            }
          }}
          disabled={saving}
        >
          {saving ? "保存中..." : "保存 Agent 设置"}
        </button>
      </div>
    </section>
  );
}
