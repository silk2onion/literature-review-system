import { useEffect, useState } from "react";
import { API_BASE_URL } from "../../api/config";

type DisciplineProfileConfig = {
  field_name: string;
  researcher_identity: string;
  review_system_prompt: string;
  review_user_template: string;
  example_timeline_topics: string[];
  example_theme_labels: string[];
  claims_system_prompt: string;
  framework_system_prompt: string;
  section_system_prompt: string;
};

type Props = { open: boolean };

export default function DisciplineProfileSettings({ open }: Props) {
  const [disciplineProfile, setDisciplineProfile] =
    useState<DisciplineProfileConfig>({
      field_name: "",
      researcher_identity: "",
      review_system_prompt: "",
      review_user_template: "",
      example_timeline_topics: [],
      example_theme_labels: [],
      claims_system_prompt: "",
      framework_system_prompt: "",
      section_system_prompt: "",
    });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [presets, setPresets] = useState<string[]>([]);
  const [presetName, setPresetName] = useState("");
  const [presetSaving, setPresetSaving] = useState(false);
  const [presetLoading, setPresetLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSaved(false);

    fetch(`${API_BASE_URL}/api/settings/discipline-profile`)
      .then((res) => res.json())
      .then((data: DisciplineProfileConfig) => setDisciplineProfile(data))
      .catch((err) => console.error("加载学科配置失败", err));

    fetch(`${API_BASE_URL}/api/settings/discipline-presets`)
      .then((res) => res.json())
      .then((data: { presets: { name: string; field_name: string }[] }) => {
        const names = Array.isArray(data?.presets)
          ? data.presets.map((p) => p.name)
          : [];
        setPresets(names);
      })
      .catch((err) => console.error("加载学科预设失败", err));
  }, [open]);

  return (
    <section className="settings-section">
      <h3>🎓 学科 / 研究领域配置</h3>
      <p className="settings-description">
        配置综述生成系统的学科身份。所有 LLM
        提示词将根据此配置动态调整。 也可在 Agent
        聊天中输入「配置学科：XX学」让 AI 自动生成。
      </p>

      {error && <div className="settings-error">错误: {error}</div>}

      {/* 预设选择 */}
      <label className="settings-row">
        <span>加载预设</span>
        <div style={{ display: "flex", gap: "8px", flex: 1 }}>
          <select
            value=""
            onChange={async (e) => {
              const name = e.target.value;
              if (!name) return;
              setPresetLoading(true);
              try {
                const res = await fetch(
                  `${API_BASE_URL}/api/settings/discipline-presets/${encodeURIComponent(name)}/load`,
                  { method: "POST" },
                );
                if (!res.ok) throw new Error("加载预设失败");
                const data = await res.json();
                const profile: DisciplineProfileConfig =
                  data.profile || data;
                setDisciplineProfile(profile);
                setSaved(false);
              } catch (err) {
                console.error(err);
                setError("加载学科预设失败");
              } finally {
                setPresetLoading(false);
              }
            }}
            disabled={presetLoading}
            style={{ flex: 1 }}
          >
            <option value="">
              {presetLoading ? "加载中..." : "-- 选择预设 --"}
            </option>
            {presets.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
      </label>

      {/* 基本字段 */}
      <label className="settings-row">
        <span>学科名称</span>
        <input
          type="text"
          value={disciplineProfile.field_name}
          onChange={(e) => {
            setDisciplineProfile((prev) => ({
              ...prev,
              field_name: e.target.value,
            }));
            setSaved(false);
          }}
          placeholder="例如：计算机视觉、建筑学、分子生物学"
          style={{ flex: 1 }}
        />
      </label>

      <label className="settings-row">
        <span>研究者身份</span>
        <input
          type="text"
          value={disciplineProfile.researcher_identity}
          onChange={(e) => {
            setDisciplineProfile((prev) => ({
              ...prev,
              researcher_identity: e.target.value,
            }));
            setSaved(false);
          }}
          placeholder="例如：你是一位资深的XX领域学术研究者"
          style={{ flex: 1 }}
        />
      </label>

      <label className="settings-row">
        <span>示例时间线主题</span>
        <input
          type="text"
          value={disciplineProfile.example_timeline_topics.join(", ")}
          onChange={(e) => {
            setDisciplineProfile((prev) => ({
              ...prev,
              example_timeline_topics: e.target.value
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
            }));
            setSaved(false);
          }}
          placeholder="用逗号分隔，例如：早期探索, 方法论突破, 深度学习时代"
          style={{ flex: 1 }}
        />
      </label>

      <label className="settings-row">
        <span>示例主题标签</span>
        <input
          type="text"
          value={disciplineProfile.example_theme_labels.join(", ")}
          onChange={(e) => {
            setDisciplineProfile((prev) => ({
              ...prev,
              example_theme_labels: e.target.value
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
            }));
            setSaved(false);
          }}
          placeholder="用逗号分隔，例如：目标检测, 图像分割, 语义理解"
          style={{ flex: 1 }}
        />
      </label>

      {/* 高级展开 */}
      <div
        style={{
          marginTop: "12px",
          cursor: "pointer",
          color: "#60a5fa",
          fontSize: "13px",
          userSelect: "none",
        }}
        onClick={() => setAdvanced((prev) => !prev)}
      >
        {advanced ? "▼" : "▶"} 高级：系统提示词模板（通常由
        AI 自动生成）
      </div>

      {advanced && (
        <div
          style={{
            marginTop: "8px",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
          }}
        >
          {[
            {
              label: "综述 System Prompt",
              key: "review_system_prompt" as const,
            },
            {
              label:
                "综述 User Prompt 模板（必须含 {keywords}, {year_range}, {paper_summaries}）",
              key: "review_user_template" as const,
              rows: 4,
            },
            {
              label: "论点提取 System Prompt",
              key: "claims_system_prompt" as const,
            },
            {
              label: "框架生成 System Prompt",
              key: "framework_system_prompt" as const,
            },
            {
              label: "章节撰写 System Prompt",
              key: "section_system_prompt" as const,
            },
          ].map((item) => (
            <label
              key={item.key}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "4px",
              }}
            >
              <span style={{ fontSize: "12px", color: "#94a3b8" }}>
                {item.label}
              </span>
              <textarea
                value={disciplineProfile[item.key]}
                onChange={(e) => {
                  setDisciplineProfile((prev) => ({
                    ...prev,
                    [item.key]: e.target.value,
                  }));
                  setSaved(false);
                }}
                rows={item.rows || 3}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: "8px",
                  borderRadius: "6px",
                  border: "1px solid #334155",
                  backgroundColor: "#1e293b",
                  color: "#e2e8f0",
                  fontSize: "12px",
                  fontFamily: "monospace",
                  resize: "vertical",
                }}
              />
            </label>
          ))}
        </div>
      )}

      {/* 保存 + 另存为预设 */}
      <div
        style={{
          display: "flex",
          gap: "8px",
          marginTop: "12px",
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <button
          className="settings-secondary"
          onClick={async () => {
            setSaving(true);
            try {
              const res = await fetch(
                `${API_BASE_URL}/api/settings/discipline-profile`,
                {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(disciplineProfile),
                },
              );
              if (!res.ok) throw new Error("保存失败");
              setSaved(true);
            } catch (err) {
              console.error(err);
              setError("保存学科配置失败");
            } finally {
              setSaving(false);
            }
          }}
          disabled={saving}
        >
          {saving
            ? "保存中..."
            : saved
              ? "✓ 已保存"
              : "保存学科配置"}
        </button>

        <span style={{ color: "#475569", fontSize: "13px" }}>|</span>

        <input
          type="text"
          value={presetName}
          onChange={(e) => setPresetName(e.target.value)}
          placeholder="预设名称"
          style={{
            width: "140px",
            padding: "6px 10px",
            borderRadius: "6px",
            border: "1px solid #334155",
            backgroundColor: "#1e293b",
            color: "#e2e8f0",
            fontSize: "13px",
          }}
        />
        <button
          className="settings-secondary"
          onClick={async () => {
            if (!presetName.trim()) {
              setError("请输入预设名称");
              return;
            }
            setPresetSaving(true);
            try {
              const res = await fetch(
                `${API_BASE_URL}/api/settings/discipline-presets`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    name: presetName.trim(),
                    profile: disciplineProfile,
                  }),
                },
              );
              if (!res.ok) throw new Error("保存预设失败");
              // 刷新预设列表
              const listRes = await fetch(
                `${API_BASE_URL}/api/settings/discipline-presets`,
              );
              if (listRes.ok) {
                const listData: {
                  presets: { name: string; field_name: string }[];
                } = await listRes.json();
                const names = Array.isArray(listData?.presets)
                  ? listData.presets.map((p) => p.name)
                  : [];
                setPresets(names);
              }
              setPresetName("");
            } catch (err) {
              console.error(err);
              setError("保存学科预设失败");
            } finally {
              setPresetSaving(false);
            }
          }}
          disabled={presetSaving || !presetName.trim()}
        >
          {presetSaving ? "保存中..." : "另存为预设"}
        </button>

        {/* 删除预设 */}
        {presets.length > 0 && (
          <select
            value=""
            onChange={async (e) => {
              const name = e.target.value;
              if (!name) return;
              if (!confirm(`确定删除预设「${name}」？`)) return;
              try {
                const res = await fetch(
                  `${API_BASE_URL}/api/settings/discipline-presets/${encodeURIComponent(name)}`,
                  { method: "DELETE" },
                );
                if (!res.ok) throw new Error("删除失败");
                setPresets((prev) =>
                  prev.filter((p) => p !== name),
                );
              } catch (err) {
                console.error(err);
                setError("删除学科预设失败");
              }
            }}
            style={{
              padding: "6px 10px",
              borderRadius: "6px",
              border: "1px solid #334155",
              backgroundColor: "#1e293b",
              color: "#e2e8f0",
              fontSize: "13px",
            }}
          >
            <option value="">🗑️ 删除预设...</option>
            {presets.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        )}
      </div>
    </section>
  );
}
