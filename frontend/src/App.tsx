import { useMemo, useState } from 'react'
import './App.css'
import LibraryPage from './LibraryPage'

const API_BASE_URL = 'http://localhost:5444'

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

interface ReviewGenerateResponse {
  success: boolean
  review_id: number
  status: string
  message: string
  preview_markdown?: string
  used_prompt?: string | null
  summary_stats?: {
    timeline?: TimelinePoint[]
    topics?: TopicStat[]
  }
}

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


function App() {
  const [activeView, setActiveView] = useState<'review' | 'library'>('review')

  const [keywordInput, setKeywordInput] = useState('urban design, public space')
  const [yearFrom, setYearFrom] = useState('2015')
  const [yearTo, setYearTo] = useState('2025')
  const [limit, setLimit] = useState('20')

  const [papers, setPapers] = useState<Paper[]>([])
  const [papersLoading, setPapersLoading] = useState(false)
  const [papersError, setPapersError] = useState<string | null>(null)

  const [reviewLoading, setReviewLoading] = useState(false)
  const [reviewError, setReviewError] = useState<string | null>(null)

  // ChatGPT 风格对话消息流
  const [messages, setMessages] = useState<ChatMessage[]>([])

  const [backendOk, setBackendOk] = useState<boolean | null>(null)

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

      const body: PaperSearchRequest = {
        keywords,
        sources: ['arxiv'],
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

  interface ReviewGenerateRequest {
    keywords: string[]
    paper_limit: number
    sources: string[]
    year_from?: number
    year_to?: number
    framework_only: boolean
    custom_prompt: string | null
  }

  async function handleGenerateReview() {
    setReviewLoading(true)
    setReviewError(null)

    try {
      const keywords = keywordInput
        .split(',')
        .map(k => k.trim())
        .filter(Boolean)
        .filter(k => k.length > 0)

      if (keywords.length === 0) {
        throw new Error('请先输入至少一个关键词')
      }

      const paperLimit = Number(limit) || 20
      const yearFromNum = yearFrom ? Number(yearFrom) : undefined
      const yearToNum = yearTo ? Number(yearTo) : undefined

      // 1) 先在对话区追加一条用户消息
      const createdAt = new Date().toISOString()
      const userMsg: ChatMessage = {
        id: createdAt,
        role: 'user',
        createdAt,
        text: `基于关键词「${keywords.join(', ')}」，时间范围 ${yearFromNum ?? '任意'}–${
          yearToNum ?? '任意'
        }，文献数上限 ${paperLimit}，生成一篇城市设计文献综述。`,
        payload: {
          keywords,
          year_from: yearFromNum,
          year_to: yearToNum,
          paper_limit: paperLimit,
        },
      }
      setMessages(prev => [...prev, userMsg])

      const body: ReviewGenerateRequest = {
        keywords,
        paper_limit: paperLimit,
        sources: ['arxiv'],
        year_from: yearFromNum,
        year_to: yearToNum,
        framework_only: false,
        custom_prompt: null,
      }

      debugLog('review_generate:request', {
        url: `${API_BASE_URL}/api/reviews/generate`,
        body,
      })

      const res = await fetch(`${API_BASE_URL}/api/reviews/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })

      debugLog('review_generate:response_meta', {
        ok: res.ok,
        status: res.status,
      })

      if (!res.ok) {
        const text = await res.text()
        debugLog('review_generate:response_error_body', text)
        throw new Error(text || `生成综述失败，状态码 ${res.status}`)
      }

      const data = (await res.json()) as ReviewGenerateResponse
      debugLog('review_generate:response_body', data)

      if (!data.success) {
        throw new Error(data.message || 'LLM 生成综述失败')
      }

      // 2) 在对话区追加一条助手消息，带上 LLM 生成结果
      const assistantCreated = new Date().toISOString()
      const assistantMsg: ChatMessage = {
        id: assistantCreated,
        role: 'assistant',
        createdAt: assistantCreated,
        text: data.message || '已生成一篇城市设计文献综述。',
        payload: {
          keywords,
          year_from: yearFromNum,
          year_to: yearToNum,
          paper_limit: paperLimit,
          review_id: data.review_id,
          preview_markdown: data.preview_markdown,
          summary_timeline: data.summary_stats?.timeline ?? [],
          summary_topics: data.summary_stats?.topics ?? [],
          status: data.status,
        },
      }
      setMessages(prev => [...prev, assistantMsg])
    } catch (e) {
      const err = e as Error
      setReviewError(err.message || '生成综述时出现错误')

      // 同时在对话区记录错误信息
      const ts = new Date().toISOString()
      const errorMsg: ChatMessage = {
        id: ts,
        role: 'assistant',
        createdAt: ts,
        text: `生成综述时出错：${err.message || '未知错误'}`,
      }
      setMessages(prev => [...prev, errorMsg])
    } finally {
      setReviewLoading(false)
    }
  }

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

          {/* 顶部视图切换：综述助手 / 文献库 */}
          <div className="view-switch">
            <button
              type="button"
              className={
                activeView === 'review'
                  ? 'view-switch-btn active'
                  : 'view-switch-btn'
              }
              onClick={() => setActiveView('review')}
            >
              综述助手
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
          </div>

          {/* 顶部大号搜索框（仅在综述助手视图下展示） */}
          {activeView === 'review' && (
            <div className="hero-search">
              <div className="hero-search-main">
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

        {/* 右上角：检测链接 + 状态 */}
        <div className="chat-header-right">
          <button className="link-button" onClick={checkBackend}>
            检测后端
          </button>
          {backendOk === true && <span className="ok-tag">后端正常</span>}
          {backendOk === false && <span className="error-tag">后端不可达</span>}
        </div>
      </header>

      <main className="chat-main">
        {activeView === 'library' ? (
          // 文献库二级页面：基于本地 SQLite 文献库的检索与浏览
          <LibraryPage />
        ) : (
          <section className="chat-window">
          {/* 顶部提示卡片 */}
          {messages.length === 0 && (
            <div className="chat-welcome compact">
              <p className="chat-welcome-text">
                在上方输入城市设计相关关键词并检索，将在这里看到检索结果和基于文献的综述。
              </p>
            </div>
          )}

          {/* 检索结果气泡：完整展示文献列表，气泡右下角有“生成综述”按钮 */}
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
                    <button
                      className="primary-button hero-search-button"
                      onClick={handleGenerateReview}
                      disabled={reviewLoading}
                    >
                      {reviewLoading ? '正在生成综述…' : '基于以上文献生成综述'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 对话消息流 */}
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
        )}
      </main>

      {/* 底部区域变为轻量信息栏，而不是主输入框 */}
      <footer className="chat-footer">
        {papersError && <div className="error-text">{papersError}</div>}
        {reviewError && <div className="error-text">{reviewError}</div>}
      </footer>
    </div>
  )
}

export default App
