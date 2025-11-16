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
  current_llm_model: string
  current_embedding_model: string
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