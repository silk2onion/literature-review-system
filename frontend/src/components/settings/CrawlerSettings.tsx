import { useEffect, useState } from "react";
import { API_BASE_URL } from "../../api/config";
import { useLocale } from "../../hooks/useLocale";

type CrawlerConfig = {
  delay_min: number;
  delay_max: number;
  max_retries: number;
  timeout: number;
};

type Props = { open: boolean };

export default function CrawlerSettings({ open }: Props) {
  const { t } = useLocale();
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
      .catch((err) => console.error("Failed to load crawler config", err));
  }, [open]);

  return (
    <section className="settings-section">
      <h3>🕷️ {t("settings.crawler.title")}</h3>
      <p className="settings-description">
        {t("settings.crawler.description")}
      </p>

      {error && <div className="settings-error">{t("common.error")} {error}</div>}

      <label className="settings-row">
        <span>{t("settings.crawler.minDelay")}</span>
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
        <span>{t("settings.crawler.maxDelay")}</span>
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
        <span>{t("settings.crawler.maxRetries")}</span>
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
        <span>{t("settings.crawler.timeout")}</span>
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
              if (!res.ok) throw new Error(t("common.saveFailed"));
              setSaved(true);
            } catch (err) {
              console.error(err);
              setError(t("settings.crawler.saveError"));
            } finally {
              setSaving(false);
            }
          }}
          disabled={saving}
        >
          {saving
            ? t("common.saving")
            : saved
              ? t("common.saved")
              : t("settings.crawler.saveCrawlerConfig")}
        </button>
      </div>
    </section>
  );
}
