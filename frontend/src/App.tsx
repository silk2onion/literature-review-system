import { useEffect, useMemo, useState } from 'react'
import './App.css'
import CrawlJobsPage from './CrawlJobsPage'
import LibraryPage from './LibraryPage'
import PhdPipelinePage, { type PhdPipelinePageProps } from './PhdPipelinePage'
import ReviewGenerateFromLibraryPage from './ReviewGenerateFromLibraryPage'
import SemanticSearchDebugPanel from './SemanticSearchDebugPanel'
import SettingsModal from './SettingsModal'
import StagingPapersPage from './StagingPapersPage'

const API_BASE_URL = 'http://127.0.0.1:5444'

// 简单的前端 debug 日志工具
function debugLog(context: string, payload?: unknown) {
  // 在需要时可以统一关掉
   
  console.log(`[FE-DEBUG] ${context}`, payload ?? '')
}

interface Paper {
  id: number
  title: string
  authors?: string[]
  abstract?: string
  source?: string
  year?: number
}

interface TimelinePoint {
  period: string
  topic: string
  paper_ids: number[]
}

interface TopicStat {
  label: string
  count: number
}

type DataSourceId = 'arxiv' | 'crossref'


type Role = 'user' | 'assistant'

interface ReviewMessagePayload {
  keywords: string[]
  year_from?: number
  year_to?: number
  paper_limit: number
  review_id?: number
  preview_markdown?: string
  summary_timeline?: TimelinePoint[]
  summary_topics?: TopicStat[]
  status?: string
}

interface ChatMessage {
  id: string
  role: Role
  createdAt: string
  text: string
  payload?: ReviewMessagePayload
}

interface JobStatus {
  job_id: number
  type: 'crawl' | 'review'
  status: 'pending' | 'running' | 'completed' | 'failed' | 'paused'
  message: string
  progress_percent?: number
}


function App() {
  const [activeView, setActiveView] = useState<
    'review-search' | 'review-generate' | 'library' | 'staging' | 'jobs' | 'rag' | 'phd-pipeline'
  >('review-search')
  const [showSettings, setShowSettings] = useState(false)
  const [phdPipelineProps] = useState<Omit<PhdPipelinePageProps, 'onExit'> | null>(null)

  // 综述助手主搜索区：默认不预填内容
  const [keywordInput, setKeywordInput] = useState('')
  const [yearFrom, setYearFrom] = useState('')
  const [yearTo, setYearTo] = useState('')
  const [limit, setLimit] = useState('20')
  const [selectedSources, setSelectedSources] = useState<DataSourceId[]>(['arxiv'])

  const toggleSource = (id: DataSourceId) => {
    setSelectedSources(prev => {
      if (prev.includes(id)) {
        if (prev.length === 1) {
          // 至少保留一个数据源，避免发出完全为空的请求
          return prev
        }
        return prev.filter(s => s !== id)
      }
      return [...prev, id]
    })
  }

  const [papers, setPapers] = useState<Paper[]>([])
  const [papersLoading, setPapersLoading] = useState(false)
  const [papersError, setPapersError] = useState<string | null>(null)

  // ChatGPT 风格对话消息流（当前搜索视图仅展示已有消息，不再新增）
  const [messages] = useState<ChatMessage[]>([])

  const [backendOk, setBackendOk] = useState<boolean | null>(null)

  // 全局任务状态管理
  const [globalTaskStatus, setGlobalTaskStatus] = useState<JobStatus | null>(null)
  const [showGlobalStatus, setShowGlobalStatus] = useState(false)

  const chatTitle = useMemo(
    () => '城市设计文献综述助手',
    [],
  )

  async function checkBackend() {
    try {
      setBackendOk(null)
      debugLog('health_check:request', { url: `${API_BASE_URL}/api/health` })
      const res = await fetch(`${API_BASE_URL}/api/health`)
      debugLog('health_check:response', { ok: res.ok, status: res.status })
      setBackendOk(res.ok)
    } catch (e) {
      debugLog('health_check:error', e)
      setBackendOk(false)
    }
  }

  async function fetchLatestJobStatus() {
    try {
      const res = await fetch(`${API_BASE_URL}/api/crawl/jobs/latest_status`)
      if (!res.ok) {
        throw new Error(`获取任务状态失败，状态码 ${res.status}`)
      }
      const data = (await res.json()) as JobStatus | null
      
      if (
        data &&
        (data.status === 'running' ||
          data.status === 'pending' ||
          data.status === 'paused')
      ) {
        setGlobalTaskStatus(data)
        setShowGlobalStatus(true)
      } else if (data && (data.status === 'completed' || data.status === 'failed')) {
        // 任务完成或失败，显示短暂通知后隐藏
        setGlobalTaskStatus(data)
        setShowGlobalStatus(true)
        setTimeout(() => {
          setShowGlobalStatus(false)
          setGlobalTaskStatus(null)
        }, 5000)
      } else {
        // 没有正在运行的任务
        setShowGlobalStatus(false)
        setGlobalTaskStatus(null)
      }
    } catch (e) {
      debugLog('fetch_job_status:error', e)
      // 忽略错误，不影响主应用
    }
  }

  useEffect(() => {
    // 立即检查一次，然后每 3 秒轮询一次任务状态
    void fetchLatestJobStatus()
    const intervalId = setInterval(() => {
      void fetchLatestJobStatus()
    }, 3000)

    return () => clearInterval(intervalId)
  }, [])

  interface PaperSearchRequest {
    keywords: string[]
    sources: string[]
    limit: number
    year_from?: number
    year_to?: number
  }

  async function handleSearchPapers() {
    setPapersLoading(true)
    setPapersError(null)
    try {
      const keywords = keywordInput
        .split(',')
        .map(k => k.trim())
        .filter(Boolean)

      const sourcesToUse = selectedSources.length > 0 ? selectedSources : ['arxiv']

      const body: PaperSearchRequest = {
        keywords,
        sources: sourcesToUse,
        limit: Number(limit) || 20,
      }

      if (yearFrom) body.year_from = Number(yearFrom)
      if (yearTo) body.year_to = Number(yearTo)

      debugLog('papers_search:request', {
        url: `${API_BASE_URL}/api/papers/search`,
        body,
      })

      const res = await fetch(`${API_BASE_URL}/api/papers/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })

      debugLog('papers_search:response_meta', {
        ok: res.ok,
        status: res.status,
      })

      if (!res.ok) {
        const text = await res.text()
        debugLog('papers_search:response_error_body', text)
        throw new Error(text || `搜索失败，状态码 ${res.status}`)
      }

      const data = await res.json()
      debugLog('papers_search:response_body', data)

      const items: Paper[] = (data.items || data.papers || data || []) as Paper[]
      setPapers(items)
    } catch (e) {
      const err = e as Error
      debugLog('papers_search:error', err)
      setPapersError(err.message || '搜索文献时出现错误')
    } finally {
      setPapersLoading(false)
    }
  }


  /**
   * 旧的“直接基于当前检索结果生成综述”逻辑已在架构上废弃：
   * - 正确流程：检索 → 暂存库/本地库筛选 → 基于库内 paper_ids 生成综述
   * - 为避免误用，这里保留空实现，仅用于占位和记录错误提示
   */
  // 旧的综述生成入口已拆分到“综述·基于库内生成”页面，这里不再需要该函数

  return (
    <div className="chat-app-root">
      <header className="chat-header">
        <div className="chat-header-left">
          <div className="brand">
            <div className="brand-mark" />
            <div className="brand-text">
              <h1>{chatTitle}</h1>
              <p className="subtitle">
                城市设计 · 文献检索 · 自动综述 · 本地文献库
              </p>
            </div>
          </div>

          {/* 顶部视图切换：综述检索 / 综述生成 / 文献库 / 暂存库 / RAG 调试 / 抓取任务 */}
          <div className="view-switch">
            <button
              type="button"
              className={
                activeView === 'review-search'
                  ? 'view-switch-btn active'
                  : 'view-switch-btn'
              }
              onClick={() => setActiveView('review-search')}
            >
              综述·检索与筛选
            </button>
            <button
              type="button"
              className={
                activeView === 'review-generate'
                  ? 'view-switch-btn active'
                  : 'view-switch-btn'
              }
              onClick={() => setActiveView('review-generate')}
            >
              综述·基于库内生成
            </button>
            <button
              type="button"
              className={
                activeView === 'library'
                  ? 'view-switch-btn active'
                  : 'view-switch-btn'
              }
              onClick={() => setActiveView('library')}
            >
              文献库
            </button>
            <button
              type="button"
              className={
                activeView === 'staging'
                  ? 'view-switch-btn active'
                  : 'view-switch-btn'
              }
              onClick={() => setActiveView('staging')}
            >
              暂存文献库
            </button>
            <button
              type="button"
              className={
                activeView === 'rag'
                  ? 'view-switch-btn active'
                  : 'view-switch-btn'
              }
              onClick={() => setActiveView('rag')}
            >
              RAG 调试
            </button>
            <button
              type="button"
              className={
                activeView === 'jobs'
                  ? 'view-switch-btn active'
                  : 'view-switch-btn'
              }
              onClick={() => setActiveView('jobs')}
            >
              抓取任务
            </button>
          </div>

          {/* 顶部大号搜索框（仅在“综述·检索与筛选”视图下展示） */}
          {activeView === 'review-search' && (
            <div className="hero-search">
              <div className="hero-search-main">
                <div style={{ position: 'relative', flex: 1 }}>
                  <input
                    className="hero-search-input"
                    value={keywordInput}
                    onChange={e => setKeywordInput(e.target.value)}
                    placeholder="例如：urban design, public space, walkability（输入后回车检索文献）"
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        void handleSearchPapers()
                      }
                    }}
                  />
                  {keywordInput.trim() !== '' && (
                    <button
                      type="button"
                      onClick={() => setKeywordInput('')}
                      style={{
                        position: 'absolute',
                        right: 10,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        border: 'none',
                        background: 'transparent',
                        color: '#9ca3af',
                        cursor: 'pointer',
                        fontSize: 14,
                        lineHeight: 1,
                      }}
                    >
                      ×
                    </button>
                  )}
                </div>
                <button
                  className="primary-button hero-search-button"
                  onClick={handleSearchPapers}
                  disabled={papersLoading}
                >
                  {papersLoading ? '正在检索…' : '检索文献'}
                </button>
              </div>

              <div className="hero-search-meta">
                <div className="hero-filters">
                  <span className="hero-label">年份</span>
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
                  <span className="hero-label">文献上限</span>
                  <input
                    className="hero-mini-input"
                    value={limit}
                    onChange={e => setLimit(e.target.value)}
                    placeholder="20"
                  />
                  <span className="hero-label">数据源</span>
                  <label
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      marginLeft: 4,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedSources.includes('arxiv')}
                      onChange={() => toggleSource('arxiv')}
                    />
                    <span style={{ marginLeft: 4 }}>Arxiv</span>
                  </label>
                  <label
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      marginLeft: 8,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedSources.includes('crossref')}
                      onChange={() => toggleSource('crossref')}
                    />
                    <span style={{ marginLeft: 4 }}>Crossref</span>
                  </label>
                  <button
                    type="button"
                    className="link-button subtle"
                    onClick={handleSearchPapers}
                    disabled={papersLoading}
                  >
                    {papersLoading ? '检索中…' : '预检索文献'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 右上角：设置 + 检测链接 + 状态 */}
        <div className="chat-header-right">
          <button
            type="button"
            className="link-button"
            onClick={() => setShowSettings(true)}
          >
            设置
          </button>
          <button className="link-button" onClick={checkBackend}>
            检测后端
          </button>
          {backendOk === true && <span className="ok-tag">后端正常</span>}
          {backendOk === false && <span className="error-tag">后端不可达</span>}
        </div>
      </header>

      {showGlobalStatus && globalTaskStatus && (
        <div
          className="global-task-status"
          style={{
            padding: '8px 16px',
            background: '#0f172a',
            color: '#e5e7eb',
            borderBottom: '1px solid #1f2937',
            fontSize: 13,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <strong style={{ marginRight: 8 }}>
              {globalTaskStatus.type === 'crawl' ? '抓取任务' : '后台任务'}
            </strong>
            <span>{globalTaskStatus.message}</span>
          </div>
          {typeof globalTaskStatus.progress_percent === 'number' && (
            <div style={{ marginLeft: 16 }}>
              进度：{globalTaskStatus.progress_percent.toFixed(1)}%
            </div>
          )}
        </div>
      )}

      <main className="chat-main">
        {activeView === 'review-generate' ? (
          <ReviewGenerateFromLibraryPage />
        ) : activeView === 'library' ? (
          <LibraryPage />
        ) : activeView === 'staging' ? (
          <StagingPapersPage />
        ) : activeView === 'rag' ? (
          <SemanticSearchDebugPanel />
        ) : activeView === 'jobs' ? (
          <CrawlJobsPage />
        ) : activeView === 'phd-pipeline' && phdPipelineProps ? (
          <PhdPipelinePage {...phdPipelineProps} onExit={() => setActiveView('review-search')} />
        ) : activeView === 'review-search' ? (
          <section className="chat-window">
            {/* 顶部提示卡片：只说明这是“检索与筛选”视图 */}
            {messages.length === 0 && (
              <div className="chat-welcome compact">
                <p className="chat-welcome-text">
                  在上方输入城市设计相关关键词并检索；检索出的候选文献请在“暂存文献库 / 本地文献库”
                  中进一步筛选和入库，然后在“综述·基于库内生成”视图中生成综述。
                </p>
              </div>
            )}

            {/* 检索结果气泡：仅展示结果，不再直接触发综述生成 */}
            {papers.length > 0 && (
              <div className="search-bubble-row">
                <div className="search-bubble">
                  <div className="search-bubble-header">
                    <span>检索结果（{papers.length} 篇）</span>
                  </div>
                  <div className="search-bubble-body">
                    <div className="papers-scroll">
                      <ul className="paper-list">
                        {papers.map(p => (
                          <li key={p.id} className="paper-item">
                            <div className="paper-title">{p.title}</div>
                            <div className="paper-meta">
                              {p.authors && p.authors.length > 0 && (
                                <span>作者：{p.authors.join(', ')}</span>
                              )}
                              {p.year && <span>年份：{p.year}</span>}
                              {p.source && <span>来源：{p.source}</span>}
                            </div>
                            {p.abstract && (
                              <p className="paper-abstract">{p.abstract}</p>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="search-bubble-footer">
                      <span className="hint-text">
                        提示：检索结果仅供参考筛选，请通过“抓取任务 → 暂存文献库 → 本地文献库”完成入库，
                        然后在“综述·基于库内生成”中基于库内文献生成正式综述。
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 对话消息流：保留历史交互记录 */}
            {messages.map(msg => {
              const isUser = msg.role === 'user'
              const p = msg.payload

              return (
                <div
                  key={msg.id}
                  className={`chat-bubble-row ${isUser ? 'align-right' : 'align-left'}`}
                >
                  <div className={`chat-bubble ${isUser ? 'user-bubble' : 'assistant-bubble'}`}>
                    <div className="chat-bubble-meta">
                      <span className="chat-role">{isUser ? '你' : '综述助手'}</span>
                      <span className="chat-time">
                        {new Date(msg.createdAt).toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="chat-bubble-body">
                      <p className="chat-text">{msg.text}</p>

                      {!isUser && p && (
                        <>
                          {p.preview_markdown && (
                            <>
                              <h4>综述预览</h4>
                              <pre className="code-block">{p.preview_markdown}</pre>
                            </>
                          )}

                          {p.summary_timeline && p.summary_timeline.length > 0 && (
                            <>
                              <h4>研究时间轴</h4>
                              <ul className="timeline-list">
                                {p.summary_timeline.map((t, idx) => (
                                  <li key={`${t.period}-${idx}`} className="timeline-item">
                                    <strong>{t.period}</strong>：{t.topic}
                                    {t.paper_ids?.length ? (
                                      <span className="timeline-papers">
                                        （代表性方向编号：{t.paper_ids.join(', ')}）
                                      </span>
                                    ) : null}
                                  </li>
                                ))}
                              </ul>
                            </>
                          )}

                          {p.summary_topics && p.summary_topics.length > 0 && (
                            <>
                              <h4>主题统计</h4>
                              <ul className="topic-list">
                                {p.summary_topics.map((t, idx) => (
                                  <li key={`${t.label}-${idx}`} className="topic-item">
                                    <span className="topic-label">{t.label}</span>
                                    <span className="topic-count">× {t.count}</span>
                                  </li>
                                ))}
                              </ul>
                            </>
                          )}

                          {p.status && (
                            <p className="status-text">当前状态：{p.status}</p>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </section>
        ) : null}
      </main>

      {/* 底部区域变为轻量信息栏，而不是主输入框 */}
      <footer className="chat-footer">
        {papersError && <div className="error-text">{papersError}</div>}
      </footer>

      <SettingsModal open={showSettings} onClose={() => setShowSettings(false)} />
    </div>
  )
}

export default App
