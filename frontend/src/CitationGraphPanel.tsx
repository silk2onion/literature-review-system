import { useEffect, useMemo, useState } from 'react'

const API_BASE_URL = 'http://localhost:5444'

type NodeType = 'central' | 'cited' | 'citing'

interface CitationGraphNode {
  id: number
  label: string
  type: NodeType
  year?: number | null
  source?: string | null
  extra?: Record<string, unknown> | null
}

interface CitationGraphEdge {
  from: number
  to: number
  source?: string | null
  confidence: number
  created_at?: string | null
}

interface CitationGraphStats {
  total_nodes: number
  total_edges: number
  by_source: Record<string, number>
  in_degree: number
  out_degree: number
}

interface CitationGraphResponse {
  center_paper_id: number
  nodes: CitationGraphNode[]
  edges: CitationGraphEdge[]
  stats: CitationGraphStats
}

interface CitationGraphPanelProps {
  paperId: number
  title?: string
}

function formatNodeType(type: NodeType): string {
  if (type === 'central') return '中心论文'
  if (type === 'cited') return '中心引用的论文'
  return '引用中心的论文'
}

function formatSource(source?: string | null): string {
  if (!source) return '-'
  return source
}

function CitationGraphPanel({ paperId, title }: CitationGraphPanelProps) {
  const [graph, setGraph] = useState<CitationGraphResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)

  async function loadGraph() {
    if (!paperId) return
    setLoading(true)
    setError(null)
    try {
      const url = `${API_BASE_URL}/api/citations/ego-graph/${paperId}`
      const res = await fetch(url)
      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || `加载引用图失败，状态码 ${res.status}`)
      }
      const data = (await res.json()) as CitationGraphResponse
      setGraph(data)
      setLastUpdated(new Date().toLocaleString())
    } catch (e) {
      const err = e as Error
      setError(err.message || '加载引用图时出现错误')
      setGraph(null)
    } finally {
      setLoading(false)
    }
  }

  async function syncAndLoad() {
    if (!paperId) return
    setSyncing(true)
    setError(null)
    try {
      const url = `${API_BASE_URL}/api/citations/sync-for-paper/${paperId}`
      const res = await fetch(url, { method: 'POST' })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || `同步引用数据失败，状态码 ${res.status}`)
      }
      // 同步完成后直接刷新图
      await loadGraph()
    } catch (e) {
      const err = e as Error
      setError(err.message || '同步引用数据时出现错误')
    } finally {
      setSyncing(false)
    }
  }

  useEffect(() => {
    if (!paperId) return
    void loadGraph()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paperId])

  const centerNode = useMemo(() => {
    if (!graph) return null
    return graph.nodes.find(n => n.id === graph.center_paper_id) || null
  }, [graph])

  const neighborNodes = useMemo(() => {
    if (!graph) return [] as CitationGraphNode[]
    return graph.nodes.filter(n => n.id !== graph.center_paper_id)
  }, [graph])

  if (!paperId) {
    return null
  }

  return (
    <section
      style={{
        marginTop: 16,
        padding: 12,
        borderRadius: 8,
        border: '1px solid #1f2937',
        backgroundColor: '#020617',
        color: '#e5e7eb',
        fontSize: 12,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 8,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              marginBottom: 2,
            }}
          >
            引用图
            {title ? `：${title}` : ''}
          </div>
          <div style={{ color: '#9ca3af' }}>
            展示中心论文的一跳引用关系（谁引用它 & 它引用了谁）
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {lastUpdated && (
            <span style={{ color: '#9ca3af' }}>最近更新：{lastUpdated}</span>
          )}
          <button
            type="button"
            className="link-button small"
            onClick={() => {
              void loadGraph()
            }}
            disabled={loading || syncing}
          >
            {loading ? '刷新中…' : '刷新引用图'}
          </button>
          <button
            type="button"
            className="link-button small"
            onClick={() => {
              void syncAndLoad()
            }}
            disabled={loading || syncing}
          >
            {syncing ? '同步中…' : '同步 Crossref 后刷新'}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ color: '#f97373', marginBottom: 8 }}>{error}</div>
      )}

      {!graph && !loading && !error && (
        <div style={{ color: '#9ca3af' }}>暂无引用数据，可以尝试先执行同步。</div>
      )}

      {graph && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 8,
            }}
          >
            <div>
              <div>
                节点数：
                <strong>{graph.stats.total_nodes}</strong>
              </div>
              <div>
                边数：
                <strong>{graph.stats.total_edges}</strong>
              </div>
            </div>
            <div>
              <div>
                被引次数（入度）：
                <strong>{graph.stats.in_degree}</strong>
              </div>
              <div>
                引用数（出度）：
                <strong>{graph.stats.out_degree}</strong>
              </div>
            </div>
            <div>
              <div>按来源统计：</div>
              {Object.keys(graph.stats.by_source).length === 0 ? (
                <div style={{ color: '#9ca3af' }}>暂无来源信息</div>
              ) : (
                <ul
                  style={{
                    listStyle: 'none',
                    paddingLeft: 0,
                    margin: 0,
                  }}
                >
                  {Object.entries(graph.stats.by_source).map(([src, count]) => (
                    <li key={src}>
                      {src}: <strong>{count}</strong>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {centerNode && (
            <div
              style={{
                padding: 8,
                borderRadius: 6,
                border: '1px solid #1f2937',
                backgroundColor: '#020617',
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 4 }}>中心论文</div>
              <div style={{ fontSize: 13, marginBottom: 2 }}>{centerNode.label}</div>
              <div style={{ color: '#9ca3af' }}>
                {centerNode.year ? `年份：${centerNode.year} · ` : ''}
                来源：{formatSource(centerNode.source)}
              </div>
            </div>
          )}

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
              maxHeight: 220,
              overflow: 'auto',
              borderRadius: 6,
              border: '1px solid #1f2937',
              padding: 6,
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 2 }}>相邻论文</div>
            {neighborNodes.length === 0 ? (
              <div style={{ color: '#9ca3af' }}>还没有相邻论文。</div>
            ) : (
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: 12,
                }}
              >
                <thead>
                  <tr>
                    <th
                      style={{
                        textAlign: 'left',
                        padding: '4px 6px',
                        borderBottom: '1px solid #1f2937',
                      }}
                    >
                      标题
                    </th>
                    <th
                      style={{
                        textAlign: 'left',
                        padding: '4px 6px',
                        borderBottom: '1px solid #1f2937',
                        width: 80,
                      }}
                    >
                      类型
                    </th>
                    <th
                      style={{
                        textAlign: 'left',
                        padding: '4px 6px',
                        borderBottom: '1px solid #1f2937',
                        width: 80,
                      }}
                    >
                      年份
                    </th>
                    <th
                      style={{
                        textAlign: 'left',
                        padding: '4px 6px',
                        borderBottom: '1px solid #1f2937',
                        width: 120,
                      }}
                    >
                      来源
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {neighborNodes.map(n => (
                    <tr key={n.id}>
                      <td
                        style={{
                          padding: '4px 6px',
                          borderBottom: '1px solid #020617',
                        }}
                      >
                        {n.label}
                      </td>
                      <td
                        style={{
                          padding: '4px 6px',
                          borderBottom: '1px solid #020617',
                          color: '#9ca3af',
                        }}
                      >
                        {formatNodeType(n.type)}
                      </td>
                      <td
                        style={{
                          padding: '4px 6px',
                          borderBottom: '1px solid #020617',
                          color: '#e5e7eb',
                        }}
                      >
                        {n.year ?? '-'}
                      </td>
                      <td
                        style={{
                          padding: '4px 6px',
                          borderBottom: '1px solid #020617',
                          color: '#9ca3af',
                        }}
                      >
                        {formatSource(n.source)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div
            style={{
              maxHeight: 160,
              overflow: 'auto',
              borderRadius: 6,
              border: '1px solid #1f2937',
              padding: 6,
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 2 }}>边列表</div>
            {graph.edges.length === 0 ? (
              <div style={{ color: '#9ca3af' }}>暂无边。</div>
            ) : (
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: 12,
                }}
              >
                <thead>
                  <tr>
                    <th
                      style={{
                        textAlign: 'left',
                        padding: '4px 6px',
                        borderBottom: '1px solid #1f2937',
                        width: 70,
                      }}
                    >
                      起点
                    </th>
                    <th
                      style={{
                        textAlign: 'left',
                        padding: '4px 6px',
                        borderBottom: '1px solid #1f2937',
                        width: 70,
                      }}
                    >
                      终点
                    </th>
                    <th
                      style={{
                        textAlign: 'left',
                        padding: '4px 6px',
                        borderBottom: '1px solid #1f2937',
                        width: 120,
                      }}
                    >
                      来源
                    </th>
                    <th
                      style={{
                        textAlign: 'left',
                        padding: '4px 6px',
                        borderBottom: '1px solid #1f2937',
                        width: 80,
                      }}
                    >
                      置信度
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {graph.edges.map((e, idx) => (
                    <tr key={idx}>
                      <td
                        style={{
                          padding: '4px 6px',
                          borderBottom: '1px solid #020617',
                        }}
                      >
                        {e.from}
                      </td>
                      <td
                        style={{
                          padding: '4px 6px',
                          borderBottom: '1px solid #020617',
                        }}
                      >
                        {e.to}
                      </td>
                      <td
                        style={{
                          padding: '4px 6px',
                          borderBottom: '1px solid #020617',
                          color: '#9ca3af',
                        }}
                      >
                        {formatSource(e.source)}
                      </td>
                      <td
                        style={{
                          padding: '4px 6px',
                          borderBottom: '1px solid #020617',
                          color: '#e5e7eb',
                        }}
                      >
                        {e.confidence.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

export default CitationGraphPanel