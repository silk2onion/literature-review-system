import { useEffect, useState } from "react";
import { API_BASE_URL } from "../../api/config";

type ModelOptions = {
  llm_models: string[];
  embedding_models: string[];
  current_llm_model: string;
  current_embedding_model: string;
};

type Props = { open: boolean };

export default function ModelSelectionSettings({ open }: Props) {
  const [modelOptions, setModelOptions] = useState<ModelOptions | null>(null);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsSaving, setModelsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setModelsLoading(true);
    setModelOptions(null);

    fetch(`${API_BASE_URL}/api/settings/models`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`加载模型列表失败: ${res.status}`);
        return res.json();
      })
      .then((data: ModelOptions) => setModelOptions(data))
      .catch((err) => console.error("加载模型配置失败", err))
      .finally(() => setModelsLoading(false));
  }, [open]);

  const handleModelSelectChange = (field: "llm" | "embedding", value: string) => {
    setModelOptions((prev) =>
      prev
        ? {
            ...prev,
            current_llm_model: field === "llm" ? value : prev.current_llm_model,
            current_embedding_model:
              field === "embedding" ? value : prev.current_embedding_model,
          }
        : prev,
    );
  };

  const handleSaveModels = () => {
    if (!modelOptions) return;
    setModelsSaving(true);
    setError(null);

    const payload = {
      llm_model: modelOptions.current_llm_model,
      embedding_model: modelOptions.current_embedding_model,
    };

    fetch(`${API_BASE_URL}/api/settings/models`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then(async (res) => {
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || `保存模型配置失败: ${res.status}`);
        }
        return res.json();
      })
      .then((data: ModelOptions) => setModelOptions(data))
      .catch((err) => {
        console.error("保存模型配置失败", err);
        setError(err.message || "保存模型配置失败");
      })
      .finally(() => setModelsSaving(false));
  };

  const handleReloadModels = () => {
    setModelsLoading(true);
    setModelOptions(null);

    fetch(`${API_BASE_URL}/api/settings/models`)
      .then(async (res) => {
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || `刷新模型列表失败: ${res.status}`);
        }
        return res.json();
      })
      .then((data: ModelOptions) => setModelOptions(data))
      .catch((err) => {
        console.error("刷新模型列表失败", err);
        setError(err.message || "刷新模型列表失败");
      })
      .finally(() => setModelsLoading(false));
  };

  return (
    <section className="settings-section">
      <h3>LLM 与 Embedding 模型</h3>
      <p className="settings-description">
        从上游模型服务中选择主对话模型与 Embedding
        模型。当前仅在运行时生效，不会写回 .env。
      </p>

      {error && <div className="settings-error">错误: {error}</div>}

      <div className="settings-row">
        <button
          type="button"
          className="settings-secondary"
          onClick={handleReloadModels}
          disabled={modelsLoading}
        >
          {modelsLoading ? "刷新中..." : "刷新模型列表"}
        </button>
      </div>

      {modelsLoading ? (
        <div className="settings-loading">正在加载模型列表...</div>
      ) : modelOptions ? (
        <>
          <label className="settings-row">
            <span>主 LLM 模型</span>
            <select
              value={modelOptions.current_llm_model}
              onChange={(e) => handleModelSelectChange("llm", e.target.value)}
            >
              {modelOptions.llm_models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>

          <label className="settings-row">
            <span>Embedding 模型</span>
            <select
              value={modelOptions.current_embedding_model}
              onChange={(e) => handleModelSelectChange("embedding", e.target.value)}
            >
              {modelOptions.embedding_models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>

          <div className="settings-row">
            <button
              className="settings-secondary"
              onClick={handleSaveModels}
              disabled={modelsSaving}
            >
              {modelsSaving ? "保存模型中..." : "保存模型设置"}
            </button>
          </div>
        </>
      ) : (
        <div className="settings-loading">
          未能获取模型列表，请检查后端模型配置或日志。
        </div>
      )}
    </section>
  );
}
