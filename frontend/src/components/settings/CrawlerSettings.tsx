import { useEffect, useState } from "react";
import { API_BASE_URL } from "../../api/config";

type CrawlerConfig = {
  delay_min: number;
  delay_max: number;
  max_retries: number;
  timeout: number;
};

type Props = { open: boolean };

export default function CrawlerSettings({ open }: Props) {
  const [crawlerConfig, setCrawlerConfig] = useState<CrawlerConfig>({
    delay_min: 1,
    delay_max: 3,
    max_retries: 3,
    timeout: 30,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSaved(false);

    fetch(`${API_BASE_URL}/api/settings/crawler`)
      .then((res) => res.json())
      .then((data: CrawlerConfig) => setCrawlerConfig(data))
      .catch((err) => console.error("加载爬虫配置失败", err));
  }, [open]);

  return (
    <section className="settings-section">
      <h3>🕷️ 爬虫配置</h3>
      <p className="settings-description">
        控制学术爬虫的请求速率、超时和重试策略。修改后立即热生效。
      </p>

      {error && <div className="settings-error">错误: {error}</div>}

      <label className="settings-row">
        <span>最小延迟 (秒)</span>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
          }}
        >
          <input
            type="range"
            min="0.5"
            max="10"
            step="0.5"
            value={crawlerConfig.delay_min}
            onChange={(e) =>
              setCrawlerConfig((prev) => ({
                ...prev,
                delay_min: parseFloat(e.target.value),
              }))
            }
            style={{ flex: 1 }}
          />
          <span style={{ minWidth: "40px" }}>
            {crawlerConfig.delay_min}s
          </span>
        </div>
      </label>
      <label className="settings-row">
        <span>最大延迟 (秒)</span>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
          }}
        >
          <input
            type="range"
            min="1"
            max="30"
            step="1"
            value={crawlerConfig.delay_max}
            onChange={(e) =>
              setCrawlerConfig((prev) => ({
                ...prev,
                delay_max: parseFloat(e.target.value),
              }))
            }
            style={{ flex: 1 }}
          />
          <span style={{ minWidth: "40px" }}>
            {crawlerConfig.delay_max}s
          </span>
        </div>
      </label>
      <label className="settings-row">
        <span>最大重试次数</span>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
          }}
        >
          <input
            type="range"
            min="1"
            max="10"
            step="1"
            value={crawlerConfig.max_retries}
            onChange={(e) =>
              setCrawlerConfig((prev) => ({
                ...prev,
                max_retries: parseInt(e.target.value),
              }))
            }
            style={{ flex: 1 }}
          />
          <span style={{ minWidth: "40px" }}>
            {crawlerConfig.max_retries}
          </span>
        </div>
      </label>
      <label className="settings-row">
        <span>请求超时 (秒)</span>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
          }}
        >
          <input
            type="range"
            min="10"
            max="120"
            step="5"
            value={crawlerConfig.timeout}
            onChange={(e) =>
              setCrawlerConfig((prev) => ({
                ...prev,
                timeout: parseInt(e.target.value),
              }))
            }
            style={{ flex: 1 }}
          />
          <span style={{ minWidth: "40px" }}>
            {crawlerConfig.timeout}s
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
                `${API_BASE_URL}/api/settings/crawler`,
                {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(crawlerConfig),
                },
              );
              if (!res.ok) throw new Error("保存失败");
              setSaved(true);
            } catch (err) {
              console.error(err);
              setError("保存爬虫配置失败");
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
              : "保存爬虫配置"}
        </button>
      </div>
    </section>
  );
}
