import { useEffect, useState } from "react";
import { API_BASE_URL } from "../../api/config";

type SingleSourceConfig = {
  enabled: boolean;
  api_key: string;
  engine?: string | null;
};

type RagConfig = {
  enabled: boolean;
};

type DataSourcesConfig = {
  serpapi: SingleSourceConfig;
  scopus: SingleSourceConfig;
  rag: RagConfig;
};

type DebugResult = {
  [source: string]: {
    enabled: boolean;
    count: number;
  };
};

const defaultConfig: DataSourcesConfig = {
  serpapi: { enabled: false, api_key: "", engine: "" },
  scopus: { enabled: false, api_key: "", engine: "" },
  rag: { enabled: false },
};

type Props = { open: boolean };

export default function DataSourcesSettings({ open }: Props) {
  const [config, setConfig] = useState<DataSourcesConfig>(defaultConfig);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [debugResult, setDebugResult] = useState<DebugResult | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setDebugResult(null);
    setLoading(true);

    fetch(`${API_BASE_URL}/api/settings/data-sources`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`加载失败: ${res.status}`);
        return res.json();
      })
      .then((data: DataSourcesConfig) => setConfig(data))
      .catch((err) => {
        console.error("加载数据源配置失败", err);
        setError(err.message || "加载配置失败");
      })
      .finally(() => setLoading(false));
  }, [open]);

  const handleChange = (
    section: keyof DataSourcesConfig,
    field: keyof SingleSourceConfig,
    value: string | boolean,
  ) => {
    setConfig((prev) => ({
      ...prev,
      [section]: { ...prev[section], [field]: value },
    }));
  };

  const handleSave = () => {
    setSaving(true);
    setError(null);
    setDebugResult(null);

    const payload: DataSourcesConfig = {
      ...config,
      serpapi: { ...config.serpapi, api_key: (config.serpapi.api_key || "").trim() },
      scopus: { ...config.scopus, api_key: (config.scopus.api_key || "").trim() },
      rag: { ...config.rag },
    };

    fetch(`${API_BASE_URL}/api/settings/data-sources`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then(async (res) => {
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || `保存失败: ${res.status}`);
        }
        return res.json();
      })
      .then((data: DataSourcesConfig) => setConfig(data))
      .catch((err) => {
        console.error("保存数据源配置失败", err);
        setError(err.message || "保存配置失败");
      })
      .finally(() => setSaving(false));
  };

  const handleTest = () => {
    setTesting(true);
    setError(null);
    setDebugResult(null);

    const params = new URLSearchParams({ query: "urban design", max_results: "3" });

    fetch(`${API_BASE_URL}/api/debug/external-sources/test?${params.toString()}`)
      .then(async (res) => {
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || `测试失败: ${res.status}`);
        }
        return res.json();
      })
      .then((data: DebugResult) => setDebugResult(data))
      .catch((err) => {
        console.error("测试外部数据源失败", err);
        setError(err.message || "测试失败");
      })
      .finally(() => setTesting(false));
  };

  if (loading) {
    return <div className="settings-loading">正在加载配置...</div>;
  }

  return (
    <>
      {error && <div className="settings-error">错误: {error}</div>}

      <section className="settings-section">
        <h3>SerpAPI / Google Scholar</h3>
        <label className="settings-row">
          <span>启用</span>
          <input
            type="checkbox"
            checked={config.serpapi.enabled}
            onChange={(e) => handleChange("serpapi", "enabled", e.target.checked)}
          />
        </label>
        <label className="settings-row">
          <span>API Key</span>
          <input
            type="text"
            value={config.serpapi.api_key || ""}
            onChange={(e) => handleChange("serpapi", "api_key", e.target.value)}
            placeholder="SERPAPI_API_KEY"
          />
        </label>
        <label className="settings-row">
          <span>Engine</span>
          <input
            type="text"
            value={config.serpapi.engine || ""}
            onChange={(e) => handleChange("serpapi", "engine", e.target.value)}
            placeholder="例如 scholar"
          />
        </label>
      </section>

      <section className="settings-section">
        <h3>Scopus</h3>
        <label className="settings-row">
          <span>启用</span>
          <input
            type="checkbox"
            checked={config.scopus.enabled}
            onChange={(e) => handleChange("scopus", "enabled", e.target.checked)}
          />
        </label>
        <label className="settings-row">
          <span>API Key</span>
          <input
            type="text"
            value={config.scopus.api_key || ""}
            onChange={(e) => handleChange("scopus", "api_key", e.target.value)}
            placeholder="SCOPUS_API_KEY"
          />
        </label>
      </section>

      <section className="settings-section">
        <h3>RAG 语义检索</h3>
        <p className="settings-description">
          启用后，将在后续版本中使用向量检索和知识增强生成综述（当前为预留开关）。
        </p>
        <label className="settings-row">
          <span>启用 RAG</span>
          <input
            type="checkbox"
            checked={config.rag?.enabled ?? false}
            onChange={(e) => handleChange("rag", "enabled", e.target.checked)}
          />
        </label>
      </section>

      <div className="settings-footer">
        <button
          className="settings-secondary"
          onClick={handleTest}
          disabled={testing || loading}
        >
          {testing ? "测试中..." : "测试外部数据源"}
        </button>
        <div className="settings-footer-spacer" />
        <button
          className="settings-primary"
          onClick={handleSave}
          disabled={saving || loading}
        >
          {saving ? "保存中..." : "保存"}
        </button>
      </div>

      {debugResult && (
        <section className="settings-section">
          <h3>最近一次测试结果</h3>
          <pre className="settings-debug-pre">
            {JSON.stringify(debugResult, null, 2)}
          </pre>
        </section>
      )}
    </>
  );
}
