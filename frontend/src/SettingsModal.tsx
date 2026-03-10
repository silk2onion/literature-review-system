import { useEffect, useState } from 'react'

const API_BASE_URL = 'http://localhost:5444'

type SingleSourceConfig = {
  enabled: boolean
  api_key: string
  engine?: string | null
}

type RagConfig = {
  enabled: boolean
}

type DataSourcesConfig = {
  serpapi: SingleSourceConfig
  scopus: SingleSourceConfig
  rag: RagConfig
}

type ModelOptions = {
  llm_models: string[]
  embedding_models: string[]
  current_embedding_model: string
}

type AgentConfig = {
  proactive_enabled: boolean
  heartbeat_interval: number
}

type DebugResult = {
  [source: string]: {
    enabled: boolean
    count: number
  }
}

type SettingsModalProps = {
  open: boolean
  onClose: () => void
}

const defaultConfig: DataSourcesConfig = {
  serpapi: {
    enabled: false,
    api_key: '',
    engine: '',
  },
  scopus: {
    enabled: false,
    api_key: '',
    engine: '',
  },
  rag: {
    enabled: false,
  },
}

function SettingsModal({ open, onClose }: SettingsModalProps) {
  const [config, setConfig] = useState<DataSourcesConfig>(defaultConfig)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [debugResult, setDebugResult] = useState<DebugResult | null>(null)

  const [modelOptions, setModelOptions] = useState<ModelOptions | null>(null)
  const [modelsLoading, setModelsLoading] = useState(false)
  const [modelsSaving, setModelsSaving] = useState(false)

  const [systemPromptSaved, setSystemPromptSaved] = useState(false)

  // Agent 主动模式配置
  const [agentConfig, setAgentConfig] = useState<AgentConfig>({ proactive_enabled: true, heartbeat_interval: 60 })
  const [agentLoading, setAgentLoading] = useState(false)
  const [agentSaving, setAgentSaving] = useState(false)

  // 打开弹窗时加载当前配置
  useEffect(() => {
    if (!open) return

    setError(null)
    setDebugResult(null)
    setLoading(true)
    setModelsLoading(true)
    setModelOptions(null)

    fetch(`${API_BASE_URL}/api/settings/data-sources`)
      .then(async res => {
        if (!res.ok) {
          throw new Error(`加载失败: ${res.status}`)
        }
        return res.json()
      })
      .then((data: DataSourcesConfig) => {
        setConfig(data)
      })
      .catch(err => {
        console.error('加载数据源配置失败', err)
        setError(err.message || '加载配置失败')
      })
      .finally(() => {
        setLoading(false)
      })

    fetch(`${API_BASE_URL}/api/settings/models`)
      .then(async res => {
        if (!res.ok) {
          throw new Error(`加载模型列表失败: ${res.status}`)
        }
        return res.json()
      })
      .then((data: ModelOptions) => {
        setModelOptions(data)
      })
      .catch(err => {
        console.error('加载模型配置失败', err)
        // 这里不单独设置 error，避免覆盖数据源错误；仅记录日志
      })
      .finally(() => {
        setModelsLoading(false)
      })

    // 加载 Agent 配置
    setAgentLoading(true)
    fetch(`${API_BASE_URL}/api/settings/agent`)
      .then(res => res.json())
      .then((data: AgentConfig) => {
        setAgentConfig(data)
      })
      .catch(err => console.error('加载 Agent 配置失败', err))
      .finally(() => setAgentLoading(false))

    setSystemPromptSaved(false)
  }, [open])

  const handleChange = (
    section: keyof DataSourcesConfig,
    field: keyof SingleSourceConfig,
    value: string | boolean,
  ) => {
    setConfig(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [field]: value,
      },
    }))
  }

  const handleSave = () => {
    setSaving(true)
    setError(null)
    setDebugResult(null)

    fetch(`${API_BASE_URL}/api/settings/data-sources`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(config),
    })
      .then(async res => {
        if (!res.ok) {
          const text = await res.text()
          throw new Error(text || `保存失败: ${res.status}`)
        }
        return res.json()
      })
      .then((data: DataSourcesConfig) => {
        setConfig(data)
      })
      .catch(err => {
        console.error('保存数据源配置失败', err)
        setError(err.message || '保存配置失败')
      })
      .finally(() => {
        setSaving(false)
      })
  }

  const handleModelSelectChange = (field: 'llm' | 'embedding', value: string) => {
    setModelOptions(prev =>
      prev
        ? {
            ...prev,
            current_llm_model: field === 'llm' ? value : prev.current_llm_model,
            current_embedding_model:
              field === 'embedding' ? value : prev.current_embedding_model,
          }
        : prev,
    )
  }

  const handleSaveModels = () => {
    if (!modelOptions) return

    setModelsSaving(true)
    setError(null)

    const payload = {
      llm_model: modelOptions.current_llm_model,
      embedding_model: modelOptions.current_embedding_model,
    }

    fetch(`${API_BASE_URL}/api/settings/models`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
      .then(async res => {
        if (!res.ok) {
          const text = await res.text()
          throw new Error(text || `保存模型配置失败: ${res.status}`)
        }
        return res.json()
      })
      .then((data: ModelOptions) => {
        setModelOptions(data)
      })
      .catch(err => {
        console.error('保存模型配置失败', err)
        setError(err.message || '保存模型配置失败')
      })
      .finally(() => {
        setModelsSaving(false)
      })
  }

  const handleReloadModels = () => {
    setModelsLoading(true)
    setModelOptions(null)

    fetch(`${API_BASE_URL}/api/settings/models`)
      .then(async res => {
        if (!res.ok) {
          const text = await res.text()
          throw new Error(text || `刷新模型列表失败: ${res.status}`)
        }
        return res.json()
      })
      .then((data: ModelOptions) => {
        setModelOptions(data)
      })
      .catch(err => {
        console.error('刷新模型列表失败', err)
        setError(err.message || '刷新模型列表失败')
      })
      .finally(() => {
        setModelsLoading(false)
      })
  }

  const handleTest = () => {
    setTesting(true)
    setError(null)
    setDebugResult(null)

    const params = new URLSearchParams({
      query: 'urban design',
      max_results: '3',
    })

    fetch(`${API_BASE_URL}/api/debug/external-sources/test?${params.toString()}`)
      .then(async res => {
        if (!res.ok) {
          const text = await res.text()
          throw new Error(text || `测试失败: ${res.status}`)
        }
        return res.json()
      })
      .then((data: DebugResult) => {
        setDebugResult(data)
      })
      .catch(err => {
        console.error('测试外部数据源失败', err)
        setError(err.message || '测试失败')
      })
      .finally(() => {
        setTesting(false)
      })
  }

  if (!open) return null

  return (
    <div className="settings-backdrop">
      <div className="settings-modal">
        <div className="settings-header">
          <h2>数据源设置</h2>
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
                    onChange={e => handleChange('serpapi', 'enabled', e.target.checked)}
                  />
                </label>

                <label className="settings-row">
                  <span>API Key</span>
                  <input
                    type="text"
                    value={config.serpapi.api_key || ''}
                    onChange={e => handleChange('serpapi', 'api_key', e.target.value)}
                    placeholder="SERPAPI_API_KEY"
                  />
                </label>

                <label className="settings-row">
                  <span>Engine</span>
                  <input
                    type="text"
                    value={config.serpapi.engine || ''}
                    onChange={e => handleChange('serpapi', 'engine', e.target.value)}
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
                    onChange={e => handleChange('scopus', 'enabled', e.target.checked)}
                  />
                </label>

                <label className="settings-row">
                  <span>API Key</span>
                  <input
                    type="text"
                    value={config.scopus.api_key || ''}
                    onChange={e => handleChange('scopus', 'api_key', e.target.value)}
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
                    onChange={e => handleChange('rag', 'enabled', e.target.checked)}
                  />
                </label>
              </section>

              <section className="settings-section">
                <h3>LLM 与 Embedding 模型</h3>
                <p className="settings-description">
                  从上游模型服务中选择主对话模型与 Embedding 模型。当前仅在运行时生效，不会写回 .env。
                </p>

                <div className="settings-row">
                  <button
                    type="button"
                    className="settings-secondary"
                    onClick={handleReloadModels}
                    disabled={modelsLoading}
                  >
                    {modelsLoading ? '刷新中...' : '刷新模型列表'}
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
                        onChange={e => handleModelSelectChange('llm', e.target.value)}
                      >
                        {modelOptions.llm_models.map(m => (
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
                        onChange={e =>
                          handleModelSelectChange('embedding', e.target.value)
                        }
                      >
                        {modelOptions.embedding_models.map(m => (
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
                        {modelsSaving ? '保存模型中...' : '保存模型设置'}
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
                  自定义 Agent 的系统提示词，将拼接在所有 AI 对话的开头。可用于注入 VCP 插件指令、角色设定等。
                </p>
                <textarea
                  value={systemPrompt}
                  onChange={e => {
                    setSystemPrompt(e.target.value)
                    setSystemPromptSaved(false)
                  }}
                  placeholder="输入自定义系统提示词...例如：你是一位城市设计领域的研究助手..."
                  rows={6}
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    padding: '10px',
                    borderRadius: '6px',
                    border: '1px solid #334155',
                    backgroundColor: '#1e293b',
                    color: '#e2e8f0',
                    fontSize: '13px',
                    fontFamily: 'monospace',
                    resize: 'vertical',
                    minHeight: '100px',
                  }}
                />
                <div className="settings-row" style={{ marginTop: '8px' }}>
                  <button
                    className="settings-secondary"
                    onClick={async () => {
                      setSystemPromptSaving(true)
                      try {
                        const res = await fetch(`${API_BASE_URL}/api/settings/system-prompt`, {
                          method: 'PUT',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ content: systemPrompt }),
                        })
                        if (!res.ok) throw new Error('保存失败')
                        setSystemPromptSaved(true)
                      } catch (err) {
                        console.error(err)
                        setError('保存系统提示词失败')
                      } finally {
                        setSystemPromptSaving(false)
                      }
                    }}
                    disabled={systemPromptSaving}
                  >
                    {systemPromptSaving ? '保存中...' : systemPromptSaved ? '✓ 已保存' : '保存提示词'}
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
                    onChange={e => setAgentConfig(prev => ({ ...prev, proactive_enabled: e.target.checked }))}
                  />
                </label>
                <label className="settings-row">
                  <span>心跳检查频率 (秒)</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <input
                      type="range"
                      min="30"
                      max="300"
                      step="30"
                      value={agentConfig.heartbeat_interval}
                      onChange={e => setAgentConfig(prev => ({ ...prev, heartbeat_interval: parseInt(e.target.value) }))}
                      style={{ flex: 1 }}
                    />
                    <span style={{ minWidth: '40px' }}>{agentConfig.heartbeat_interval}s</span>
                  </div>
                </label>
                <div className="settings-row">
                  <button
                    className="settings-secondary"
                    onClick={async () => {
                      setAgentSaving(true)
                      try {
                        const res = await fetch(`${API_BASE_URL}/api/settings/agent`, {
                          method: 'PUT',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify(agentConfig),
                        })
                        if (!res.ok) throw new Error('保存失败')
                        // 保存成功后也可以提示
                      } catch (err) {
                        console.error(err)
                        setError('保存 Agent 配置失败')
                      } finally {
                        setAgentSaving(false)
                      }
                    }}
                    disabled={agentSaving}
                  >
                    {agentSaving ? '保存中...' : '保存 Agent 设置'}
                  </button>
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
            {testing ? '测试中...' : '测试外部数据源'}
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
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default SettingsModal