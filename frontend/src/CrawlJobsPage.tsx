import { useEffect, useState } from 'react'

const API_BASE_URL = 'http://localhost:5444'

type JobStatusCode = 'pending' | 'running' | 'completed' | 'failed' | 'paused'

interface CrawlJob {
  id: number
  keywords: string[]
  sources: string[]
  year_from?: number | null
  year_to?: number | null
  max_results: number
  page_size: number
  current_page: number
  fetched_count: number
  failed_count: number
  status: JobStatusCode
  created_at: string
  updated_at: string
}

interface CrawlJobListResponse {
  total: number
  items: CrawlJob[]
}

const STATUS_LABELS: Record<JobStatusCode, string> = {
  pending: '等待中',
  running: '进行中',
  completed: '已完成',
  failed: '失败',
  paused: '已暂停',
}

function formatDate(value: string | undefined | null): string {
  if (!value) return '-'
  try {
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return value
    return d.toLocaleString()
  } catch {
    return value
  }
}

function formatKeywords(keywords: string[]): string {
  if (!keywords || keywords.length === 0) return '无'
  if (keywords.length <= 3) return keywords.join(', ')
  return `${keywords.slice(0, 3).join(', ')} 等 ${keywords.length} 个`
}

function formatSources(sources: string[]): string {
  if (!sources || sources.length === 0) return '默认'
  return sources.join(', ')
}

type FilterStatus = JobStatusCode | 'all'

function CrawlJobsPage() {
  const [jobs, setJobs] = useState<CrawlJob[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all')
  const [actioningJobId, setActioningJobId] = useState<number | null>(null)

  async function fetchJobs() {
    try {
      setLoading(true)
      setError(null)

      const params = new URLSearchParams()
      if (filterStatus !== 'all') {
        params.append('status', filterStatus)
      }
      params.append('skip', '0')
      params.append('limit', '50')

      const res = await fetch(`${API_BASE_URL}/api/crawl/jobs?${params.toString()}`)
      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || `加载任务列表失败: ${res.status}`)
      }

      const data = (await res.json()) as CrawlJobListResponse
      setJobs(data.items || [])
      setTotal(data.total ?? (data.items ? data.items.length : 0))
    } catch (e) {
      const err = e as Error
      setError(err.message || '加载任务列表时出现错误')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchJobs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterStatus])

  async function postAndRefresh(path: string) {
    try {
      const res = await fetch(`${API_BASE_URL}${path}`, { method: 'POST' })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || `操作失败: ${res.status}`)
      }
      await fetchJobs()
    } catch (e) {
      const err = e as Error
      setError(err.message || '操作失败')
      throw err
    }
  }

  async function handleRunOnce(jobId: number) {
    setActioningJobId(jobId)
    try {
      await postAndRefresh(`/api/crawl/jobs/${jobId}/run_once`)
    } finally {
      setActioningJobId(null)
    }
  }

  async function handlePause(jobId: number) {
    setActioningJobId(jobId)
    try {
      await postAndRefresh(`/api/crawl/jobs/${jobId}/pause`)
    } finally {
      setActioningJobId(null)
    }
  }

  async function handleResume(jobId: number) {
    setActioningJobId(jobId)
    try {
      await postAndRefresh(`/api/crawl/jobs/${jobId}/resume`)
    } finally {
      setActioningJobId(null)
    }
  }

  async function handleRetry(jobId: number) {
    if (!window.confirm('确定要重置该任务进度并重新开始吗？')) {
      return
    }
    setActioningJobId(jobId)
    try {
      await postAndRefresh(`/api/crawl/jobs/${jobId}/retry`)
    } finally {
      setActioningJobId(null)
    }
  }

  const hasJobs = jobs.length > 0

  return (
    <section className="jobs-page">
      <div className="jobs-header">
        <div>
          <h2 className="jobs-title">抓取任务</h2>
          <p className="jobs-subtitle">查看并管理批量文献抓取任务的执行状态</p>
        </div>
        <div className="jobs-header-actions">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>状态过滤</span>
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value as FilterStatus)}
            >
              <option value="all">全部</option>
              <option value="pending">等待中</option>
              <option value="running">进行中</option>
              <option value="paused">已暂停</option>
              <option value="completed">已完成</option>
              <option value="failed">失败</option>
            </select>
          </label>
          <button
            type="button"
            className="link-button"
            onClick={() => {
              void fetchJobs()
            }}
          >
            刷新
          </button>
        </div>
      </div>

      {error && (
        <div className="error-text" style={{ marginBottom: 8 }}>
          {error}
        </div>
      )}

      {loading && !hasJobs ? (
        <div className="info-text">正在加载任务列表...</div>
      ) : !hasJobs ? (
        <div className="info-text">当前还没有抓取任务。</div>
      ) : (
        <div className="jobs-table-wrapper">
          <table className="jobs-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>关键词</th>
                <th>数据源</th>
                <th>目标数量</th>
                <th>已抓取</th>
                <th>失败</th>
                <th>状态</th>
                <th>创建时间</th>
                <th>更新时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map(job => {
                const disabled = actioningJobId === job.id
                return (
                  <tr key={job.id}>
                    <td>{job.id}</td>
                    <td>{formatKeywords(job.keywords)}</td>
                    <td>{formatSources(job.sources)}</td>
                    <td>{job.max_results}</td>
                    <td>{job.fetched_count}</td>
                    <td>{job.failed_count}</td>
                    <td>{STATUS_LABELS[job.status]}</td>
                    <td>{formatDate(job.created_at)}</td>
                    <td>{formatDate(job.updated_at)}</td>
                    <td>
                      <div className="jobs-actions">
                        {(job.status === 'pending' || job.status === 'running') && (
                          <button
                            type="button"
                            className="jobs-action-btn"
                            disabled={disabled}
                            onClick={() => {
                              void handleRunOnce(job.id)
                            }}
                          >
                            执行一步
                          </button>
                        )}
                        {(job.status === 'pending' || job.status === 'running') && (
                          <button
                            type="button"
                            className="jobs-action-btn"
                            disabled={disabled}
                            onClick={() => {
                              void handlePause(job.id)
                            }}
                          >
                            暂停
                          </button>
                        )}
                        {job.status === 'paused' && (
                          <button
                            type="button"
                            className="jobs-action-btn"
                            disabled={disabled}
                            onClick={() => {
                              void handleResume(job.id)
                            }}
                          >
                            恢复
                          </button>
                        )}
                        {(job.status === 'failed' || job.status === 'completed') && (
                          <button
                            type="button"
                            className="jobs-action-btn"
                            disabled={disabled}
                            onClick={() => {
                              void handleRetry(job.id)
                            }}
                          >
                            重试
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div className="jobs-footer-meta">共 {total} 个任务</div>
        </div>
      )}
    </section>
  )
}

export default CrawlJobsPage