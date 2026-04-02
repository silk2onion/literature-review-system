import { useEffect, useState } from "react";
import { API_BASE_URL } from "../../api/config";

type ReviewDefaultsConfig = {
  citation_style: string;
  language: string;
  paper_limit: number;
  section_temperature: number;
  framework_temperature: number;
  section_max_tokens: number;
};

type Props = { open: boolean };

export default function ReviewDefaultsSettings({ open }: Props) {
  const [reviewDefaults, setReviewDefaults] = useState<ReviewDefaultsConfig>({
    citation_style: "harvard",
    language: "zh-CN",
    paper_limit: 30,
    section_temperature: 0.4,
    framework_temperature: 0.3,
    section_max_tokens: 8000,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSaved(false);

    fetch(`${API_BASE_URL}/api/settings/review-defaults`)
      .then((res) => res.json())
      .then((data: ReviewDefaultsConfig) => setReviewDefaults(data))
      .catch((err) => console.error("加载综述默认值失败", err));
  }, [open]);

  return (
    <section className="settings-section">
      <h3>📝 综述生成默认值</h3>
      <p className="settings-description">
        一键生成(Orchestrate)与 PhD Pipeline 使用的默认参数。
      </p>

      {error && <div className="settings-error">错误: {error}</div>}

      <label className="settings-row">
        <span>引用格式</span>
        <select
          value={reviewDefaults.citation_style}
          onChange={(e) =>
            setReviewDefaults((prev) => ({
              ...prev,
              citation_style: e.target.value,
            }))
          }
        >
          <option value="harvard">Harvard</option>
          <option value="apa">APA</option>
          <option value="ieee">IEEE</option>
          <option value="chicago">Chicago</option>
        </select>
      </label>
      <label className="settings-row">
        <span>语言</span>
        <select
          value={reviewDefaults.language}
          onChange={(e) =>
            setReviewDefaults((prev) => ({
              ...prev,
              language: e.target.value,
            }))
          }
        >
          <option value="zh-CN">中文</option>
          <option value="en">English</option>
        </select>
      </label>
      <label className="settings-row">
        <span>文献数量上限</span>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
          }}
        >
          <input
            type="range"
            min="5"
            max="100"
            step="5"
            value={reviewDefaults.paper_limit}
            onChange={(e) =>
              setReviewDefaults((prev) => ({
                ...prev,
                paper_limit: parseInt(e.target.value),
              }))
            }
            style={{ flex: 1 }}
          />
          <span style={{ minWidth: "40px" }}>
            {reviewDefaults.paper_limit}
          </span>
        </div>
      </label>
      <label className="settings-row">
        <span>章节 Temperature</span>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
          }}
        >
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={reviewDefaults.section_temperature}
            onChange={(e) =>
              setReviewDefaults((prev) => ({
                ...prev,
                section_temperature: parseFloat(e.target.value),
              }))
            }
            style={{ flex: 1 }}
          />
          <span style={{ minWidth: "40px" }}>
            {reviewDefaults.section_temperature}
          </span>
        </div>
      </label>
      <label className="settings-row">
        <span>框架 Temperature</span>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
          }}
        >
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={reviewDefaults.framework_temperature}
            onChange={(e) =>
              setReviewDefaults((prev) => ({
                ...prev,
                framework_temperature: parseFloat(e.target.value),
              }))
            }
            style={{ flex: 1 }}
          />
          <span style={{ minWidth: "40px" }}>
            {reviewDefaults.framework_temperature}
          </span>
        </div>
      </label>
      <label className="settings-row">
        <span>章节 Max Tokens</span>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
          }}
        >
          <input
            type="range"
            min="1000"
            max="32000"
            step="1000"
            value={reviewDefaults.section_max_tokens}
            onChange={(e) =>
              setReviewDefaults((prev) => ({
                ...prev,
                section_max_tokens: parseInt(e.target.value),
              }))
            }
            style={{ flex: 1 }}
          />
          <span style={{ minWidth: "50px" }}>
            {reviewDefaults.section_max_tokens}
          </span>
        </div>
      </label>
      <div className="settings-row" style={{ marginTop: "8px" }}>
        <button
          className="settings-secondary"
          onClick={async () => {
            setSaving(true);
            try {
              const res = await fetch(
                `${API_BASE_URL}/api/settings/review-defaults`,
                {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(reviewDefaults),
                },
              );
              if (!res.ok) throw new Error("保存失败");
              setSaved(true);
            } catch (err) {
              console.error(err);
              setError("保存综述默认值失败");
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
              : "保存综述默认值"}
        </button>
      </div>
    </section>
  );
}
