import { useEffect, useState } from "react";
import { API_BASE_URL } from "../../api/config";

type SearchConfig = {
  default_top_k: number;
  recall_alpha: number;
  embedding_text_max_length: number;
  use_graph_propagation: boolean;
};

type Props = { open: boolean };

export default function SearchSettings({ open }: Props) {
  const [searchConfig, setSearchConfig] = useState<SearchConfig>({
    default_top_k: 20,
    recall_alpha: 0.3,
    embedding_text_max_length: 6000,
    use_graph_propagation: true,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSaved(false);

    fetch(`${API_BASE_URL}/api/settings/search`)
      .then((res) => res.json())
      .then((data: SearchConfig) => setSearchConfig(data))
      .catch((err) => console.error("加载语义检索配置失败", err));
  }, [open]);

  return (
    <section className="settings-section">
      <h3>🔍 语义检索</h3>
      <p className="settings-description">
        调整向量检索的 Top-K、混合检索权重
        (alpha)、文本截断长度及引用图谱传播。
      </p>

      {error && <div className="settings-error">错误: {error}</div>}

      <label className="settings-row">
        <span>Default Top-K</span>
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
            value={searchConfig.default_top_k}
            onChange={(e) =>
              setSearchConfig((prev) => ({
                ...prev,
                default_top_k: parseInt(e.target.value),
              }))
            }
            style={{ flex: 1 }}
          />
          <span style={{ minWidth: "40px" }}>
            {searchConfig.default_top_k}
          </span>
        </div>
      </label>
      <label className="settings-row">
        <span>Recall Alpha (向量 vs 关键词)</span>
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
            value={searchConfig.recall_alpha}
            onChange={(e) =>
              setSearchConfig((prev) => ({
                ...prev,
                recall_alpha: parseFloat(e.target.value),
              }))
            }
            style={{ flex: 1 }}
          />
          <span style={{ minWidth: "40px" }}>
            {searchConfig.recall_alpha}
          </span>
        </div>
      </label>
      <label className="settings-row">
        <span>Embedding 文本截断长度</span>
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
            max="20000"
            step="500"
            value={searchConfig.embedding_text_max_length}
            onChange={(e) =>
              setSearchConfig((prev) => ({
                ...prev,
                embedding_text_max_length: parseInt(e.target.value),
              }))
            }
            style={{ flex: 1 }}
          />
          <span style={{ minWidth: "50px" }}>
            {searchConfig.embedding_text_max_length}
          </span>
        </div>
      </label>
      <label className="settings-row">
        <span>启用引用图谱传播</span>
        <input
          type="checkbox"
          checked={searchConfig.use_graph_propagation}
          onChange={(e) =>
            setSearchConfig((prev) => ({
              ...prev,
              use_graph_propagation: e.target.checked,
            }))
          }
        />
      </label>
      <div className="settings-row" style={{ marginTop: "8px" }}>
        <button
          className="settings-secondary"
          onClick={async () => {
            setSaving(true);
            try {
              const res = await fetch(
                `${API_BASE_URL}/api/settings/search`,
                {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(searchConfig),
                },
              );
              if (!res.ok) throw new Error("保存失败");
              setSaved(true);
            } catch (err) {
              console.error(err);
              setError("保存语义检索配置失败");
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
              : "保存检索配置"}
        </button>
      </div>
    </section>
  );
}
