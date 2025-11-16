import { useEffect, useRef, useState } from 'react'

const API_BASE_URL = 'http://localhost:5444'

interface Paper {
  id: number
  title: string
  authors?: string[]
  abstract?: string
  year?: number
  journal?: string
  venue?: string
  source?: string
  doi?: string
}

interface ActivatedGroup {
  name?: string
  keywords?: string[]
  score?: number
  [key: string]: unknown
}

interface SemanticSearchItem {
  paper: Paper
  score: number
}

interface SemanticSearchDebug {
  expanded_keywords: string[]
  activated_groups: Record<string, ActivatedGroup>
  total_candidates: number
}


interface SemanticSearchRequestPayload {
  keywords: string[]
  year_from?: number
  year_to?: number
  limit?: number
}

function SemanticSearchDebugPanel() {
  const [keywordInput, setKeywordInput] = useState('')
  const [yearFrom, setYearFrom] = useState('')
  const [yearTo, setYearTo] = useState('')
  const [limit, setLimit] = useState('20')

  const [items, setItems] = useState<SemanticSearchItem[]>([])
  const [debugInfo, setDebugInfo] = useState<SemanticSearchDebug | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(
    null,
  )

  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, [])

  async function handleSearch() {
    setError(null)
    setMessage(null)
    setLoading(true)
    setItems([])
    setDebugInfo(null)
    setProgress(null)

    // 若已有连接，先关闭
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }

    try {
      const keywords = keywordInput
        .split(',')
        .map(k => k.trim())
        .filter(Boolean)

      if (keywords.length === 0) {
        throw new Error('请先输入至少一个关键词')
      }

      const body: SemanticSearchRequestPayload = {
        keywords,
      }

      if (yearFrom) {
        body.year_from = Number(yearFrom)
      }
      if (yearTo) {
        body.year_to = Number(yearTo)
      }
      if (limit) {
        body.limit = Number(limit)
      }

      const wsUrl = `${API_BASE_URL.replace(/^http/, 'ws')}/api/semantic-search/ws`
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            type: 'search',
            payload: body,
          }),
        )
      }

      ws.onmessage = event => {
        try {
          const data = JSON.parse(event.data as string) as {
            type: string
            message?: string
            debug?: SemanticSearchDebug
            items?: SemanticSearchItem[]
            progress?: { current: number; total: number }
          }

          if (data.type === 'debug' && data.debug) {
            setDebugInfo(data.debug)
            if (data.message) {
              setMessage(data.message)
            }
          } else if (data.type === 'partial_result' && data.items) {
            setItems(prev => [...prev, ...(data.items ?? [])])
            if (data.progress) {
              setProgress({
                current: data.progress.current,
                total: data.progress.total,
              })
            }
          } else if (data.type === 'done') {
            setLoading(false)
          } else if (data.type === 'error') {
            setError(data.message || '语义检索时出现错误')
            setLoading(false)
          }
        } catch (err) {
          console.error('解析 WebSocket 消息时出现错误', err)
          setError('解析 WebSocket 消息时出现错误')
          setLoading(false)
        }
      }

      ws.onerror = () => {
        setError('WebSocket 连接出现错误')
        setLoading(false)
      }

      ws.onclose = () => {
        wsRef.current = null
      }
    } catch (e) {
      const err = e as Error
      setError(err.message || '语义检索时出现错误')
      setItems([])
      setDebugInfo(null)
      setLoading(false)
    }
  }

  return (
    <div className="semantic-search-debug-root">
      <div className="semantic-search-debug-header">
        <h2>RAG 语义检索可视化调试</h2>
        <p className="subtitle">
          输入城市设计相关关键词，查看语义组扩展、相似度排序结果和候选数量。
        </p>
      </div>

      <div className="semantic-search-debug-form">
        <div className="form-row">
          <label className="form-label">关键词（逗号分隔）</label>
          <input
            className="hero-search-input"
            value={keywordInput}
            onChange={e => setKeywordInput(e.target.value)}
            placeholder="例如：urban design, public space, street life"
          />
        </div>
        <div className="form-row">
          <label className="form-label">年份范围</label>
          <input
            className="hero-mini-input"
            value={yearFrom}
            onChange={e => setYearFrom(e.target.value)}
            placeholder="2015"
          />
          <span className="hero-sep">-</span>
          <input
            className="hero-mini-input"
            value={yearTo}
            onChange={e => setYearTo(e.target.value)}
            placeholder="2025"
          />
          <label className="form-label">Top K</label>
          <input
            className="hero-mini-input"
            value={limit}
            onChange={e => setLimit(e.target.value)}
            placeholder="20"
          />
          <button
            type="button"
            className="primary-button hero-search-button"
            onClick={handleSearch}
            disabled={loading}
          >
            {loading ? '检索中…' : '执行语义检索'}
          </button>
        </div>
      </div>

      {error && (
        <div className="error-text" style={{ marginTop: 12 }}>
          {error}
        </div>
      )}
      {message && !error && (
        <div className="info-text" style={{ marginTop: 12 }}>
          {message}
        </div>
      )}
      {progress && !error && (
        <div className="info-text" style={{ marginTop: 8 }}>
          进度：{progress.current} / {progress.total}
        </div>
      )}

      {debugInfo && (
        <div className="semantic-search-debug-section">
          <h3>调试信息</h3>
          <div className="debug-block">
            <div className="debug-row">
              <strong>扩展关键词：</strong>
              {debugInfo.expanded_keywords.length > 0 ? (
                <div className="keyword-chips">
                  {debugInfo.expanded_keywords.map((k, idx) => (
                    <span key={idx} className="chip">
                      {k}
                    </span>
                  ))}
                </div>
              ) : (
                <span>无</span>
              )}
            </div>
            <div className="debug-row">
              <strong>候选文献总数：</strong>
              <span>{debugInfo.total_candidates}</span>
            </div>
            <div className="debug-row">
              <strong>激活语义组：</strong>
              {Object.keys(debugInfo.activated_groups).length > 0 ? (
                <ul className="group-list">
                  {Object.entries(debugInfo.activated_groups).map(([key, group]) => (
                    <li key={key} className="group-item">
                      <div className="group-title">
                        <span className="chip">{key}</span>
                      </div>
                      <pre className="code-block" style={{ whiteSpace: 'pre-wrap' }}>
                        {JSON.stringify(group, null, 2)}
                      </pre>
                    </li>
                  ))}
                </ul>
              ) : (
                <span>无激活语义组</span>
              )}
            </div>
          </div>
        </div>
      )}

      {items.length > 0 && (
        <div className="semantic-search-debug-section">
          <h3>检索结果（按相似度排序）</h3>
          <table className="result-table">
            <thead>
              <tr>
                <th style={{ width: 80 }}>Score</th>
                <th style={{ width: 80 }}>Year</th>
                <th>Title</th>
                <th style={{ width: 220 }}>Authors</th>
                <th style={{ width: 120 }}>Source</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.paper.id}>
                  <td>{item.score.toFixed(4)}</td>
                  <td>{item.paper.year ?? '-'}</td>
                  <td>{item.paper.title}</td>
                  <td>
                    {item.paper.authors && item.paper.authors.length > 0
                      ? item.paper.authors.join(', ')
                      : '-'}
                  </td>
                  <td>{item.paper.journal || item.paper.venue || item.paper.source || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default SemanticSearchDebugPanel