import { useEffect, useState } from "react";

const API_BASE_URL = "http://localhost:5444";

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

type ModelOptions = {
  llm_models: string[];
  embedding_models: string[];
  current_llm_model: string;
  current_embedding_model: string;
};

type AgentConfig = {
  proactive_enabled: boolean;
  heartbeat_interval: number;
};

type LLMConnectionConfig = {
  api_key: string;
  base_url: string;
};

type ReviewDefaultsConfig = {
  citation_style: string;
  language: string;
  paper_limit: number;
  section_temperature: number;
  framework_temperature: number;
  section_max_tokens: number;
};

type CrawlerConfig = {
  delay_min: number;
  delay_max: number;
  max_retries: number;
  timeout: number;
};

type SearchConfig = {
  default_top_k: number;
  recall_alpha: number;
  embedding_text_max_length: number;
  use_graph_propagation: boolean;
};

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

type DebugResult = {
  [source: string]: {
    enabled: boolean;
    count: number;
  };
};

type SettingsModalProps = {
  open: boolean;
  onClose: () => void;
};

const defaultConfig: DataSourcesConfig = {
  serpapi: {
    enabled: false,
    api_key: "",
    engine: "",
  },
  scopus: {
    enabled: false,
    api_key: "",
    engine: "",
  },
  rag: {
    enabled: false,
  },
};

function SettingsModal({ open, onClose }: SettingsModalProps) {
  const [config, setConfig] = useState<DataSourcesConfig>(defaultConfig);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [debugResult, setDebugResult] = useState<DebugResult | null>(null);

  const [modelOptions, setModelOptions] = useState<ModelOptions | null>(null);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsSaving, setModelsSaving] = useState(false);

  // System Prompt
  const [systemPrompt, setSystemPrompt] = useState("");
  const [systemPromptSaving, setSystemPromptSaving] = useState(false);
  const [systemPromptSaved, setSystemPromptSaved] = useState(false);

  // Agent 主动模式配置
  const [agentConfig, setAgentConfig] = useState<AgentConfig>({
    proactive_enabled: true,
    heartbeat_interval: 60,
  });
  const [agentSaving, setAgentSaving] = useState(false);

  // LLM 连接配置
  const [llmConnection, setLLMConnection] = useState<LLMConnectionConfig>({
    api_key: "",
    base_url: "https://api.openai.com/v1",
  });
  const [llmConnSaving, setLlmConnSaving] = useState(false);
  const [llmConnSaved, setLlmConnSaved] = useState(false);

  // 综述生成默认值
  const [reviewDefaults, setReviewDefaults] = useState<ReviewDefaultsConfig>({
    citation_style: "harvard",
    language: "zh-CN",
    paper_limit: 30,
    section_temperature: 0.4,
    framework_temperature: 0.3,
    section_max_tokens: 8000,
  });
  const [reviewDefaultsSaving, setReviewDefaultsSaving] = useState(false);
  const [reviewDefaultsSaved, setReviewDefaultsSaved] = useState(false);

  // 爬虫配置
  const [crawlerConfig, setCrawlerConfig] = useState<CrawlerConfig>({
    delay_min: 1,
    delay_max: 3,
    max_retries: 3,
    timeout: 30,
  });
  const [crawlerSaving, setCrawlerSaving] = useState(false);
  const [crawlerSaved, setCrawlerSaved] = useState(false);

  // 语义检索配置
  const [searchConfig, setSearchConfig] = useState<SearchConfig>({
    default_top_k: 20,
    recall_alpha: 0.3,
    embedding_text_max_length: 6000,
    use_graph_propagation: true,
  });
  const [searchSaving, setSearchSaving] = useState(false);
  const [searchSaved, setSearchSaved] = useState(false);

  // 学科配置
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
  const [disciplineSaving, setDisciplineSaving] = useState(false);
  const [disciplineSaved, setDisciplineSaved] = useState(false);
  const [disciplineAdvanced, setDisciplineAdvanced] = useState(false);
  const [disciplinePresets, setDisciplinePresets] = useState<string[]>([]);
  const [presetName, setPresetName] = useState("");
  const [presetSaving, setPresetSaving] = useState(false);
  const [presetLoading, setPresetLoading] = useState(false);

  // 打开弹窗时加载当前配置
  useEffect(() => {
    if (!open) return;

    setError(null);
    setDebugResult(null);
    setLoading(true);
    setModelsLoading(true);
    setModelOptions(null);

    fetch(`${API_BASE_URL}/api/settings/data-sources`)
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`加载失败: ${res.status}`);
        }
        return res.json();
      })
      .then((data: DataSourcesConfig) => {
        setConfig(data);
      })
      .catch((err) => {
        console.error("加载数据源配置失败", err);
        setError(err.message || "加载配置失败");
      })
      .finally(() => {
        setLoading(false);
      });

    fetch(`${API_BASE_URL}/api/settings/models`)
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`加载模型列表失败: ${res.status}`);
        }
        return res.json();
      })
      .then((data: ModelOptions) => {
        setModelOptions(data);
      })
      .catch((err) => {
        console.error("加载模型配置失败", err);
        // 这里不单独设置 error，避免覆盖数据源错误；仅记录日志
      })
      .finally(() => {
        setModelsLoading(false);
      });

    // 加载 Agent 配置
    fetch(`${API_BASE_URL}/api/settings/agent`)
      .then((res) => res.json())
      .then((data: AgentConfig) => setAgentConfig(data))
      .catch((err) => console.error("加载 Agent 配置失败", err));

    // 加载系统提示词
    fetch(`${API_BASE_URL}/api/settings/system-prompt`)
      .then((res) => res.json())
      .then((data: { content: string }) => setSystemPrompt(data.content || ""))
      .catch((err) => console.error("加载系统提示词失败", err));

    // 加载 LLM 连接配置
    fetch(`${API_BASE_URL}/api/settings/llm-connection`)
      .then((res) => res.json())
      .then((data: LLMConnectionConfig) => setLLMConnection(data))
      .catch((err) => console.error("加载 LLM 连接配置失败", err));

    // 加载综述默认值
    fetch(`${API_BASE_URL}/api/settings/review-defaults`)
      .then((res) => res.json())
      .then((data: ReviewDefaultsConfig) => setReviewDefaults(data))
      .catch((err) => console.error("加载综述默认值失败", err));

    // 加载爬虫配置
    fetch(`${API_BASE_URL}/api/settings/crawler`)
      .then((res) => res.json())
      .then((data: CrawlerConfig) => setCrawlerConfig(data))
      .catch((err) => console.error("加载爬虫配置失败", err));

    // 加载语义检索配置
    fetch(`${API_BASE_URL}/api/settings/search`)
      .then((res) => res.json())
      .then((data: SearchConfig) => setSearchConfig(data))
      .catch((err) => console.error("加载语义检索配置失败", err));

    // 加载学科配置
    fetch(`${API_BASE_URL}/api/settings/discipline-profile`)
      .then((res) => res.json())
      .then((data: DisciplineProfileConfig) => setDisciplineProfile(data))
      .catch((err) => console.error("加载学科配置失败", err));

    // 加载预设列表
    fetch(`${API_BASE_URL}/api/settings/discipline-presets`)
      .then((res) => res.json())
      .then((data: { presets: { name: string; field_name: string }[] }) => {
        const names = Array.isArray(data?.presets)
          ? data.presets.map((p) => p.name)
          : [];
        setDisciplinePresets(names);
      })
      .catch((err) => console.error("加载学科预设失败", err));

    setSystemPromptSaved(false);
    setLlmConnSaved(false);
    setReviewDefaultsSaved(false);
    setCrawlerSaved(false);
    setSearchSaved(false);
    setDisciplineSaved(false);
  }, [open]);

  const handleChange = (
    section: keyof DataSourcesConfig,
    field: keyof SingleSourceConfig,
    value: string | boolean,
  ) => {
    setConfig((prev) => ({
      ...prev,
      [section]: {
        ...prev[section],
        [field]: value,
      },
    }));
  };

  const handleSave = () => {
    setSaving(true);
    setError(null);
    setDebugResult(null);

    fetch(`${API_BASE_URL}/api/settings/data-sources`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(config),
    })
      .then(async (res) => {
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || `保存失败: ${res.status}`);
        }
        return res.json();
      })
      .then((data: DataSourcesConfig) => {
        setConfig(data);
      })
      .catch((err) => {
        console.error("保存数据源配置失败", err);
        setError(err.message || "保存配置失败");
      })
      .finally(() => {
        setSaving(false);
      });
  };

  const handleModelSelectChange = (
    field: "llm" | "embedding",
    value: string,
  ) => {
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
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    })
      .then(async (res) => {
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || `保存模型配置失败: ${res.status}`);
        }
        return res.json();
      })
      .then((data: ModelOptions) => {
        setModelOptions(data);
      })
      .catch((err) => {
        console.error("保存模型配置失败", err);
        setError(err.message || "保存模型配置失败");
      })
      .finally(() => {
        setModelsSaving(false);
      });
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
      .then((data: ModelOptions) => {
        setModelOptions(data);
      })
      .catch((err) => {
        console.error("刷新模型列表失败", err);
        setError(err.message || "刷新模型列表失败");
      })
      .finally(() => {
        setModelsLoading(false);
      });
  };

  const handleTest = () => {
    setTesting(true);
    setError(null);
    setDebugResult(null);

    const params = new URLSearchParams({
      query: "urban design",
      max_results: "3",
    });

    fetch(
      `${API_BASE_URL}/api/debug/external-sources/test?${params.toString()}`,
    )
      .then(async (res) => {
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || `测试失败: ${res.status}`);
        }
        return res.json();
      })
      .then((data: DebugResult) => {
        setDebugResult(data);
      })
      .catch((err) => {
        console.error("测试外部数据源失败", err);
        setError(err.message || "测试失败");
      })
      .finally(() => {
        setTesting(false);
      });
  };

  if (!open) return null;

  return (
    <div className="settings-backdrop">
      <div className="settings-modal">
        <div className="settings-header">
          <h2>系统设置</h2>
          <button className="settings-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="settings-body">
          {loading ? (
            <div className="settings-loading">正在加载配置...</div>
          ) : (
            <>
              {error && <div className="settings-error">错误: {error}</div>}

              <section className="settings-section">
                <h3>SerpAPI / Google Scholar</h3>
                <label className="settings-row">
                  <span>启用</span>
                  <input
                    type="checkbox"
                    checked={config.serpapi.enabled}
                    onChange={(e) =>
                      handleChange("serpapi", "enabled", e.target.checked)
                    }
                  />
                </label>

                <label className="settings-row">
                  <span>API Key</span>
                  <input
                    type="text"
                    value={config.serpapi.api_key || ""}
                    onChange={(e) =>
                      handleChange("serpapi", "api_key", e.target.value)
                    }
                    placeholder="SERPAPI_API_KEY"
                  />
                </label>

                <label className="settings-row">
                  <span>Engine</span>
                  <input
                    type="text"
                    value={config.serpapi.engine || ""}
                    onChange={(e) =>
                      handleChange("serpapi", "engine", e.target.value)
                    }
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
                    onChange={(e) =>
                      handleChange("scopus", "enabled", e.target.checked)
                    }
                  />
                </label>

                <label className="settings-row">
                  <span>API Key</span>
                  <input
                    type="text"
                    value={config.scopus.api_key || ""}
                    onChange={(e) =>
                      handleChange("scopus", "api_key", e.target.value)
                    }
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
                    onChange={(e) =>
                      handleChange("rag", "enabled", e.target.checked)
                    }
                  />
                </label>
              </section>

              <section className="settings-section">
                <h3>LLM 与 Embedding 模型</h3>
                <p className="settings-description">
                  从上游模型服务中选择主对话模型与 Embedding
                  模型。当前仅在运行时生效，不会写回 .env。
                </p>

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
                        onChange={(e) =>
                          handleModelSelectChange("llm", e.target.value)
                        }
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
                        onChange={(e) =>
                          handleModelSelectChange("embedding", e.target.value)
                        }
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

              <section className="settings-section">
                <h3>Agent 系统提示词</h3>
                <p className="settings-description">
                  自定义 Agent 的系统提示词，将拼接在所有 AI
                  对话的开头。可用于注入 VCP 插件指令、角色设定等。
                </p>
                <textarea
                  value={systemPrompt}
                  onChange={(e) => {
                    setSystemPrompt(e.target.value);
                    setSystemPromptSaved(false);
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
                      setSystemPromptSaving(true);
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
                        setSystemPromptSaved(true);
                      } catch (err) {
                        console.error(err);
                        setError("保存系统提示词失败");
                      } finally {
                        setSystemPromptSaving(false);
                      }
                    }}
                    disabled={systemPromptSaving}
                  >
                    {systemPromptSaving
                      ? "保存中..."
                      : systemPromptSaved
                        ? "✓ 已保存"
                        : "保存提示词"}
                  </button>
                </div>
              </section>

              <section className="settings-section">
                <h3>Agent 主动交互 (萌妹女仆心跳)</h3>
                <p className="settings-description">
                  开启后，小爱女仆会每隔一段时间检查任务进度，并主动在聊天框向你汇报~
                </p>
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
                      setAgentSaving(true);
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
                        // 保存成功后也可以提示
                      } catch (err) {
                        console.error(err);
                        setError("保存 Agent 配置失败");
                      } finally {
                        setAgentSaving(false);
                      }
                    }}
                    disabled={agentSaving}
                  >
                    {agentSaving ? "保存中..." : "保存 Agent 设置"}
                  </button>
                </div>
              </section>
              {/* ── LLM 连接配置 ── */}
              <section className="settings-section">
                <h3>🔗 LLM 连接</h3>
                <p className="settings-description">
                  配置 OpenAI 兼容 API 的密钥和 Base
                  URL。修改后立即热生效，无需重启后端。
                </p>
                <label className="settings-row">
                  <span>API Key</span>
                  <input
                    type="password"
                    value={llmConnection.api_key}
                    onChange={(e) =>
                      setLLMConnection((prev) => ({
                        ...prev,
                        api_key: e.target.value,
                      }))
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
                      setLLMConnection((prev) => ({
                        ...prev,
                        base_url: e.target.value,
                      }))
                    }
                    placeholder="https://api.openai.com/v1"
                    style={{ flex: 1 }}
                  />
                </label>
                <div className="settings-row" style={{ marginTop: "8px" }}>
                  <button
                    className="settings-secondary"
                    onClick={async () => {
                      setLlmConnSaving(true);
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
                        setLlmConnSaved(true);
                      } catch (err) {
                        console.error(err);
                        setError("保存 LLM 连接配置失败");
                      } finally {
                        setLlmConnSaving(false);
                      }
                    }}
                    disabled={llmConnSaving}
                  >
                    {llmConnSaving
                      ? "保存中..."
                      : llmConnSaved
                        ? "✓ 已保存"
                        : "保存连接配置"}
                  </button>
                </div>
              </section>

              {/* ── 综述生成默认值 ── */}
              <section className="settings-section">
                <h3>📝 综述生成默认值</h3>
                <p className="settings-description">
                  一键生成(Orchestrate)与 PhD Pipeline 使用的默认参数。
                </p>
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
                      setReviewDefaultsSaving(true);
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
                        setReviewDefaultsSaved(true);
                      } catch (err) {
                        console.error(err);
                        setError("保存综述默认值失败");
                      } finally {
                        setReviewDefaultsSaving(false);
                      }
                    }}
                    disabled={reviewDefaultsSaving}
                  >
                    {reviewDefaultsSaving
                      ? "保存中..."
                      : reviewDefaultsSaved
                        ? "✓ 已保存"
                        : "保存综述默认值"}
                  </button>
                </div>
              </section>

              {/* ── 爬虫配置 ── */}
              <section className="settings-section">
                <h3>🕷️ 爬虫配置</h3>
                <p className="settings-description">
                  控制学术爬虫的请求速率、超时和重试策略。修改后立即热生效。
                </p>
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
                      setCrawlerSaving(true);
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
                        setCrawlerSaved(true);
                      } catch (err) {
                        console.error(err);
                        setError("保存爬虫配置失败");
                      } finally {
                        setCrawlerSaving(false);
                      }
                    }}
                    disabled={crawlerSaving}
                  >
                    {crawlerSaving
                      ? "保存中..."
                      : crawlerSaved
                        ? "✓ 已保存"
                        : "保存爬虫配置"}
                  </button>
                </div>
              </section>

              {/* ── 语义检索配置 ── */}
              <section className="settings-section">
                <h3>🔍 语义检索</h3>
                <p className="settings-description">
                  调整向量检索的 Top-K、混合检索权重
                  (alpha)、文本截断长度及引用图谱传播。
                </p>
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
                      setSearchSaving(true);
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
                        setSearchSaved(true);
                      } catch (err) {
                        console.error(err);
                        setError("保存语义检索配置失败");
                      } finally {
                        setSearchSaving(false);
                      }
                    }}
                    disabled={searchSaving}
                  >
                    {searchSaving
                      ? "保存中..."
                      : searchSaved
                        ? "✓ 已保存"
                        : "保存检索配置"}
                  </button>
                </div>
              </section>
              {/* ── 🎓 学科配置 ── */}
              <section className="settings-section">
                <h3>🎓 学科 / 研究领域配置</h3>
                <p className="settings-description">
                  配置综述生成系统的学科身份。所有 LLM
                  提示词将根据此配置动态调整。 也可在 Agent
                  聊天中输入「配置学科：XX学」让 AI 自动生成。
                </p>

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
                          // 后端返回 {success, message, profile: {...}}，提取 profile
                          const profile: DisciplineProfileConfig =
                            data.profile || data;
                          setDisciplineProfile(profile);
                          setDisciplineSaved(false);
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
                      {disciplinePresets.map((p) => (
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
                      setDisciplineSaved(false);
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
                      setDisciplineSaved(false);
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
                      setDisciplineSaved(false);
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
                      setDisciplineSaved(false);
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
                  onClick={() => setDisciplineAdvanced((prev) => !prev)}
                >
                  {disciplineAdvanced ? "▼" : "▶"} 高级：系统提示词模板（通常由
                  AI 自动生成）
                </div>

                {disciplineAdvanced && (
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
                            setDisciplineSaved(false);
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
                      setDisciplineSaving(true);
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
                        setDisciplineSaved(true);
                      } catch (err) {
                        console.error(err);
                        setError("保存学科配置失败");
                      } finally {
                        setDisciplineSaving(false);
                      }
                    }}
                    disabled={disciplineSaving}
                  >
                    {disciplineSaving
                      ? "保存中..."
                      : disciplineSaved
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
                          setDisciplinePresets(names);
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
                  {disciplinePresets.length > 0 && (
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
                          setDisciplinePresets((prev) =>
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
                      {disciplinePresets.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </section>

              {debugResult && (
                <section className="settings-section">
                  <h3>最近一次测试结果</h3>
                  <pre className="settings-debug-pre">
                    {JSON.stringify(debugResult, null, 2)}
                  </pre>
                </section>
              )}
            </>
          )}
        </div>

        <div className="settings-footer">
          <button
            className="settings-secondary"
            onClick={handleTest}
            disabled={testing || loading}
          >
            {testing ? "测试中..." : "测试外部数据源"}
          </button>

          <div className="settings-footer-spacer" />

          <button className="settings-secondary" onClick={onClose}>
            取消
          </button>
          <button
            className="settings-primary"
            onClick={handleSave}
            disabled={saving || loading}
          >
            {saving ? "保存中..." : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default SettingsModal;
