import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import SemanticSearchDebugPanel from './SemanticSearchDebugPanel';
import { AsyncTaskPanel } from './AsyncTaskPanel';

const API_BASE_URL = 'http://localhost:5444';

// 在 App.tsx 中定义的类型，为了快速开始，先在这里复制一份
// 后续可以重构到统一的 types.ts 文件中
interface Paper {
  id: number;
  title: string;
  authors?: string[];
  abstract?: string;
  source?: string;
  year?: number;
}

// 占位符类型，后续根据 API 返回值细化
interface Claim {
  id: number;
  text: string;
  topic: string;
  sub_topic: string;
}

interface ClaimWithEvidence extends Claim {
  evidence: Paper[];
}


export interface PhdPipelinePageProps {
  initialKeywords?: string[];
  initialYearFrom?: number;
  initialYearTo?: number;
  initialPaperLimit?: number;
  initialSources?: string[];
  initialPaperIds?: number[];
  initialGroupId?: number;
  onExit?: () => void;
  embedded?: boolean;
}

/**
 * PhD 级多阶段综述管线页面
 */
const PhdPipelinePage: React.FC<PhdPipelinePageProps> = ({
  initialKeywords = [],
  initialYearFrom,
  initialYearTo,
  initialPaperLimit = 20,
  initialSources = ['arxiv', 'scholar_serpapi', 'scopus', 'semantic_scholar'],
  initialPaperIds = [],
  initialGroupId,
  onExit,
  embedded = false,
}) => {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Configuration State
  const [keywords, setKeywords] = useState<string>(initialKeywords.join(', '));
  const [yearFrom, setYearFrom] = useState<string>(initialYearFrom?.toString() || '');
  const [yearTo, setYearTo] = useState<string>(initialYearTo?.toString() || '');
  const [paperLimit, setPaperLimit] = useState<string>(initialPaperLimit.toString());
  const [sortBy, setSortBy] = useState<string>('year_desc');
  const [sources, setSources] = useState<string[]>(initialSources);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [paperIds, setPaperIds] = useState<number[]>(initialPaperIds);
  const [groupId, setGroupId] = useState<number | undefined>(initialGroupId);

  // 各阶段的产出
  const [claims, setClaims] = useState<Claim[]>([]);
  const [claimsWithEvidence, setClaimsWithEvidence] = useState<ClaimWithEvidence[]>([]);
  const [finalRender, setFinalRender] = useState<string>('');
  
  const [reviewId, setReviewId] = useState<number | null>(null);
  const [exportLoading, setExportLoading] = useState(false);
  const [showRagDebug, setShowRagDebug] = useState(false);
  const [manualReviewId, setManualReviewId] = useState('');

  // Step 0: Framework generation
  const [topic, setTopic] = useState('');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [framework, setFramework] = useState<any>(null);
  const [frameworkLoading, setFrameworkLoading] = useState(false);
  const [frameworkConfirmed, setFrameworkConfirmed] = useState(false);

  // Step 0.5: Auto-search state
  const [papersPerSection, setPapersPerSection] = useState(20);
  const [autoSearchLoading, setAutoSearchLoading] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [autoSearchResults, setAutoSearchResults] = useState<any[]>([]);
  const [autoSearchDone, setAutoSearchDone] = useState(false);

  // Step 4: Assemble state
  const [assembleLoading, setAssembleLoading] = useState(false);
  const [fullReviewMarkdown, setFullReviewMarkdown] = useState('');
  const [citationStyle, setCitationStyle] = useState('harvard');
  const [assembleStats, setAssembleStats] = useState<{cited: number; sections: number} | null>(null);


  const handleStep0_GenerateFramework = async () => {
    setFrameworkLoading(true);
    setError(null);
    setFramework(null);
    setFrameworkConfirmed(false);

    try {
      const kws = keywords.split(/[,\uff0c]/).map(k => k.trim()).filter(k => k);
      const res = await fetch(`${API_BASE_URL}/api/reviews/generate-framework`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic,
          keywords: kws.length > 0 ? kws : [topic],
          language: 'zh-CN',
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || `Framework generation failed: ${res.status}`);
      }

      const data = await res.json();
      setFramework(data.framework);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setFrameworkLoading(false);
    }
  };

  
  const handleStep05_AutoSearch = async () => {
    if (!framework || !framework.sections) {
      setError('Please generate and confirm a framework first.');
      return;
    }
    setAutoSearchLoading(true);
    setError(null);
    setAutoSearchResults([]);

    try {
      const res = await fetch(`${API_BASE_URL}/api/reviews/phd/auto-search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sections: framework.sections,
          papers_per_section: papersPerSection,
          sources: sources,
          year_from: yearFrom ? parseInt(yearFrom) : undefined,
          year_to: yearTo ? parseInt(yearTo) : undefined,
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || `Auto-search failed: ${res.status}`);
      }

      const data = await res.json();
      setAutoSearchResults(data.per_section || []);
      setAutoSearchDone(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAutoSearchLoading(false);
    }
  };

  const handleStep4_Assemble = async () => {
    if (!finalRender && !reviewId) {
      setError('Please complete rendering before assembly.');
      return;
    }
    setAssembleLoading(true);
    setError(null);

    try {
      const renderedSections = finalRender
        ? [{ section_id: '1', section_title: framework?.title || 'Literature Review', text: finalRender, citation_map: {} }]
        : [];

      const res = await fetch(`${API_BASE_URL}/api/reviews/phd/assemble`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          review_id: reviewId,
          title: framework?.title || topic || 'Literature Review',
          rendered_sections: renderedSections,
          citation_style: citationStyle,
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || `Assembly failed: ${res.status}`);
      }

      const data = await res.json();
      setFullReviewMarkdown(data.full_markdown || '');
      setAssembleStats({ cited: data.total_cited_papers || 0, sections: data.total_sections || 0 });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAssembleLoading(false);
    }
  };


  const handleStep1_GenerateClaims = async () => {
    setLoading(true);
    setError(null);
    setStep(1);

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const body: any = {
        keywords: keywords.split(/[,，]/).map(k => k.trim()).filter(k => k),
        data_sources: sources,
        paper_limit: parseInt(paperLimit) || 20,
        year_start: yearFrom ? parseInt(yearFrom) : undefined,
        year_end: yearTo ? parseInt(yearTo) : undefined,
        sort_by: sortBy,
      };

      if (paperIds.length > 0) {
        body.paper_ids = paperIds;
        // 当指定了 paper_ids 时，通常不需要再进行搜索，但保留 keywords 作为元数据
      } else if (groupId) {
        body.group_id = groupId;
        // 当指定了 group_id 时，后端会优先使用该组下的文献
      }

      // 使用新的初始化接口，它会负责创建 Review -> 生成 Framework -> 生成 Claims
      const res = await fetch(`${API_BASE_URL}/api/reviews/phd/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || `Step 1 failed with status ${res.status}`);
      }

      const data = await res.json();
      setReviewId(data.review_id);
      setClaims(data.claims);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleStep2_AttachEvidence = async () => {
    if (!reviewId) {
      setError('Cannot proceed to step 2 without a review ID from step 1.');
      return;
    }
    setLoading(true);
    setError(null);
    setStep(2);

    try {
      const res = await fetch(`${API_BASE_URL}/api/reviews/phd/attach-evidence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ review_id: reviewId }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || `Step 2 failed with status ${res.status}`);
      }

      const data = await res.json();
      setClaimsWithEvidence(data.claims_with_evidence);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleStep3_RenderSection = async () => {
    if (!reviewId) {
      setError('Cannot proceed to step 3 without a review ID.');
      return;
    }
    setLoading(true);
    setError(null);
    setStep(3);

    try {
      const res = await fetch(`${API_BASE_URL}/api/reviews/phd/render-section`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ review_id: reviewId, section_key: 'introduction' }), // 暂时硬编码渲染 introduction
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || `Step 3 failed with status ${res.status}`);
      }

      const data = await res.json();
      // 假设后端返回的是 markdown 内容，或者我们只取 content 字段
      // 如果后端返回的是 rendered_section 对象
      setFinalRender(data.rendered_section.content);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleExportMarkdown = async () => {
    if (!reviewId) {
      setError('当前还没有可导出的综述，请先完成前面的生成步骤。');
      return;
    }
    setExportLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE_URL}/api/reviews/${reviewId}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          format: 'markdown',
          include_references: true,
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || `导出失败，状态码 ${res.status}`);
      }

      const data = await res.json();
      const markdown: string = data.markdown;
      const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `review-${reviewId}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      setError((e as Error).message);
      alert((e as Error).message);
    } finally {
      setExportLoading(false);
    }
  };

  return (
    <div className="phd-pipeline-page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <h2>PhD 级多阶段综述管线</h2>
          {reviewId && (
            <span style={{ fontSize: '12px', opacity: 0.7 }}>
              当前综述 ID: {reviewId}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <button
            onClick={() => setShowRagDebug(!showRagDebug)}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              border: '1px solid #3b82f6',
              backgroundColor: showRagDebug ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
              color: '#3b82f6',
              cursor: 'pointer',
              fontSize: '13px',
            }}
          >
            {showRagDebug ? '关闭 RAG 调试' : 'RAG 调试'}
          </button>
          <button onClick={onExit} className="link-button">返回综述助手</button>
        </div>
      </div>

      {error && <div className="error-text" style={{ marginBottom: '20px' }}>错误：{error}</div>}

      {/* Configuration Section */}
      <div style={{
        marginBottom: '24px',
        padding: '16px',
        backgroundColor: '#0f172a',
        borderRadius: '8px',
        border: '1px solid #1f2937'
      }}>
        <h3 style={{ marginTop: 0, marginBottom: '16px', fontSize: '16px' }}>管线配置</h3>
        
        {groupId ? (
          <div style={{
            padding: '12px',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            border: '1px solid rgba(59, 130, 246, 0.3)',
            borderRadius: '6px',
            marginBottom: '16px',
            color: '#93c5fd',
            fontSize: '14px'
          }}>
            <strong>已选择文献分组 (ID: {groupId})</strong>
            <p style={{ margin: '4px 0 0 0', fontSize: '13px', opacity: 0.9 }}>
              将直接使用该分组下的文献生成综述。您可以调整下方的“文献数量上限”和“排序策略”来控制上下文长度。
            </p>
          </div>
        ) : null}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ opacity: groupId ? 0.5 : 1, pointerEvents: groupId ? 'none' : 'auto' }}>
            <label style={{ display: 'block', fontSize: '13px', color: '#9ca3af', marginBottom: '4px' }}>
              Research Topic (Step 0)
            </label>
            <input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g., Transit-Oriented Development and Cultural Heritage"
              style={{
                width: '100%',
                padding: '8px',
                borderRadius: '4px',
                border: '1px solid #334155',
                backgroundColor: '#1e293b',
                color: '#fff',
                boxSizing: 'border-box'
              }}
            />
          </div>
          <div style={{ opacity: groupId ? 0.5 : 1, pointerEvents: groupId ? 'none' : 'auto' }}>
            <label style={{ display: 'block', fontSize: '13px', color: '#9ca3af', marginBottom: '4px' }}>
              Keywords (comma-separated)
            </label>
            <input
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              style={{
                width: '100%',
                padding: '8px',
                borderRadius: '4px',
                border: '1px solid #334155',
                backgroundColor: '#1e293b',
                color: '#fff',
                boxSizing: 'border-box'
              }}
            />
          </div>
          
          <div style={{ marginBottom: '16px', opacity: groupId ? 0.5 : 1, pointerEvents: groupId ? 'none' : 'auto' }}>
            <label style={{ display: 'block', fontSize: '13px', color: '#9ca3af', marginBottom: '4px' }}>
              数据源
            </label>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              {['arxiv', 'scholar_serpapi', 'scopus', 'semantic_scholar', 'local_rag'].map(src => (
                <label key={src} style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#fff', fontSize: '13px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={sources.includes(src)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSources([...sources, src]);
                      } else {
                        setSources(sources.filter(s => s !== src));
                      }
                    }}
                  />
                  {src === 'local_rag' ? '本地 RAG (增强)' : src}
                </label>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            <div style={{ opacity: groupId ? 0.5 : 1, pointerEvents: groupId ? 'none' : 'auto' }}>
              <label style={{ display: 'block', fontSize: '13px', color: '#9ca3af', marginBottom: '4px' }}>
                起始年份
              </label>
              <input
                type="number"
                value={yearFrom}
                onChange={(e) => setYearFrom(e.target.value)}
                placeholder="2015"
                style={{
                  width: '100px',
                  padding: '8px',
                  borderRadius: '4px',
                  border: '1px solid #334155',
                  backgroundColor: '#1e293b',
                  color: '#fff'
                }}
              />
            </div>
            <div style={{ opacity: groupId ? 0.5 : 1, pointerEvents: groupId ? 'none' : 'auto' }}>
              <label style={{ display: 'block', fontSize: '13px', color: '#9ca3af', marginBottom: '4px' }}>
                结束年份
              </label>
              <input
                type="number"
                value={yearTo}
                onChange={(e) => setYearTo(e.target.value)}
                placeholder="2025"
                style={{
                  width: '100px',
                  padding: '8px',
                  borderRadius: '4px',
                  border: '1px solid #334155',
                  backgroundColor: '#1e293b',
                  color: '#fff'
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', color: '#9ca3af', marginBottom: '4px' }}>
                文献数量上限
              </label>
              <input
                type="number"
                value={paperLimit}
                onChange={(e) => setPaperLimit(e.target.value)}
                style={{
                  width: '100px',
                  padding: '8px',
                  borderRadius: '4px',
                  border: '1px solid #334155',
                  backgroundColor: '#1e293b',
                  color: '#fff'
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', color: '#9ca3af', marginBottom: '4px' }}>
                排序策略
              </label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                style={{
                  width: '140px',
                  padding: '8px',
                  borderRadius: '4px',
                  border: '1px solid #334155',
                  backgroundColor: '#1e293b',
                  color: '#fff'
                }}
              >
                <option value="year_desc">年份 (降序)</option>
                <option value="year_asc">年份 (升序)</option>
                <option value="citations_desc">引用数 (降序)</option>
                <option value="random">随机</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="pipeline-steps-container">
        {/* Step 0: Generate Framework */}
        <div className="pipeline-step">
          <h3>Step 0: Generate Review Framework</h3>
          <button
            onClick={handleStep0_GenerateFramework}
            disabled={frameworkLoading || !topic.trim() || frameworkConfirmed}
            style={{
              padding: '8px 16px',
              borderRadius: '6px',
              border: 'none',
              background: frameworkConfirmed ? '#334155' : 'linear-gradient(135deg, #8b5cf6, #6d28d9)',
              color: '#fff',
              fontWeight: 600,
              cursor: frameworkLoading || !topic.trim() || frameworkConfirmed ? 'not-allowed' : 'pointer',
              opacity: frameworkLoading || !topic.trim() || frameworkConfirmed ? 0.6 : 1,
            }}
          >
            {frameworkLoading ? 'Generating...' : frameworkConfirmed ? 'Framework Confirmed' : 'Generate Framework'}
          </button>

          {framework && (
            <div className="step-result" style={{ marginTop: '12px' }}>
              <h4>{framework.title || 'Review Framework'}</h4>
              {framework.abstract_description && (
                <p style={{ color: '#94a3b8', fontSize: '13px', marginBottom: '12px' }}>
                  {framework.abstract_description}
                </p>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {(framework.sections || []).map((sec: { id: string; title: string; description: string; search_keywords?: string[] }, idx: number) => (
                  <div key={idx} style={{
                    padding: '10px 14px',
                    backgroundColor: '#1e293b',
                    borderRadius: '6px',
                    border: '1px solid #334155',
                  }}>
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '4px',
                    }}>
                      <strong style={{ color: '#e2e8f0', fontSize: '14px' }}>
                        {sec.id}. {sec.title}
                      </strong>
                    </div>
                    <p style={{ color: '#94a3b8', fontSize: '12px', margin: '4px 0' }}>
                      {sec.description}
                    </p>
                    {sec.search_keywords && (
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '4px' }}>
                        {sec.search_keywords.map((kw: string, ki: number) => (
                          <span key={ki} style={{
                            padding: '2px 8px',
                            backgroundColor: 'rgba(139, 92, 246, 0.2)',
                            border: '1px solid rgba(139, 92, 246, 0.4)',
                            borderRadius: '12px',
                            fontSize: '11px',
                            color: '#c4b5fd',
                          }}>
                            {kw}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {!frameworkConfirmed && (
                <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                  <button
                    onClick={() => setFrameworkConfirmed(true)}
                    style={{
                      padding: '8px 20px',
                      borderRadius: '6px',
                      border: 'none',
                      background: 'linear-gradient(135deg, #10b981, #059669)',
                      color: '#fff',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Confirm Framework
                  </button>
                  <button
                    onClick={handleStep0_GenerateFramework}
                    disabled={frameworkLoading}
                    style={{
                      padding: '8px 16px',
                      borderRadius: '6px',
                      border: '1px solid #334155',
                      background: 'transparent',
                      color: '#94a3b8',
                      cursor: 'pointer',
                    }}
                  >
                    Regenerate
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        
        {/* Step 0.5: Auto-Search Papers */}
        <div className="pipeline-step">
          <h3>Step 0.5: Auto-Search Literature</h3>
          <p style={{ color: '#94a3b8', fontSize: '13px', marginBottom: '12px' }}>
            {frameworkConfirmed
              ? 'Framework confirmed. Search papers for each section using its keywords.'
              : 'Generate and confirm a framework first.'}
          </p>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '12px' }}>
            <label style={{ color: '#9ca3af', fontSize: '13px' }}>Papers per section:</label>
            <select
              value={papersPerSection}
              onChange={(e) => setPapersPerSection(parseInt(e.target.value))}
              style={{
                padding: '6px 10px',
                borderRadius: '4px',
                border: '1px solid #334155',
                backgroundColor: '#1e293b',
                color: '#fff',
              }}
            >
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={30}>30</option>
              <option value={50}>50</option>
            </select>
          </div>
          <button
            onClick={handleStep05_AutoSearch}
            disabled={autoSearchLoading || !frameworkConfirmed || autoSearchDone}
            style={{
              padding: '8px 16px',
              borderRadius: '6px',
              border: 'none',
              background: autoSearchDone ? '#334155' : 'linear-gradient(135deg, #f59e0b, #d97706)',
              color: '#fff',
              fontWeight: 600,
              cursor: autoSearchLoading || !frameworkConfirmed || autoSearchDone ? 'not-allowed' : 'pointer',
              opacity: autoSearchLoading || !frameworkConfirmed || autoSearchDone ? 0.6 : 1,
            }}
          >
            {autoSearchLoading ? 'Searching...' : autoSearchDone ? 'Search Complete' : 'Auto-Search Papers'}
          </button>

          {autoSearchResults.length > 0 && (
            <div className="step-result" style={{ marginTop: '12px' }}>
              <h4>Search Results:</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {autoSearchResults.map((r: {section_id: string; section_title: string; new_papers: number; fetched?: number; error?: string}, idx: number) => (
                  <div key={idx} style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    backgroundColor: '#1e293b',
                    borderRadius: '6px',
                    border: '1px solid #334155',
                  }}>
                    <span style={{ color: '#e2e8f0', fontSize: '13px' }}>{r.section_title}</span>
                    <span style={{
                      color: r.error ? '#ef4444' : '#10b981',
                      fontSize: '13px',
                      fontWeight: 600,
                    }}>
                      {r.error ? 'Error' : `+${r.new_papers} new (${r.fetched || 0} total)`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ⚡ Async Full Pipeline Panel */}
        <div className="pipeline-step">
          <div style={{ marginBottom: '8px' }}>
            <h3 style={{ marginBottom: '4px' }}>🤖 全自动一键模式（推荐）</h3>
            <p style={{ color: '#94a3b8', fontSize: '13px', margin: 0 }}>
              全流程自动完成 · 后台运行 · 失败自动重试 · 实时进度
            </p>
          </div>
          <AsyncTaskPanel
            topic={topic}
            keywords={keywords.split(/[,，]/).map(k => k.trim()).filter(k => k)}
            papersPerSection={papersPerSection}
            sources={sources}
            language="zh-CN"
            citationStyle={citationStyle}
          />
        </div>

        <div className="pipeline-step" style={{ opacity: 0.7, pointerEvents: 'none' }}>
          <div style={{
            padding: '8px 14px',
            background: 'rgba(148,163,184,0.05)',
            border: '1px dashed #334155',
            borderRadius: '8px',
            color: '#475569',
            fontSize: '12px',
            marginBottom: '12px',
            textAlign: 'center',
          }}>
            — 或选择下面的手动分步控制模式 —
          </div>
        </div>

        {/* Step 1: Generate Claims */}
        <div className="pipeline-step">
          <h3>步骤 1: 生成主张 (Claims)</h3>
          <button onClick={handleStep1_GenerateClaims} disabled={loading || claims.length > 0}>
            {loading && step === 1 ? '生成中...' : '开始生成主张'}
          </button>
          {claims.length > 0 && (
            <div className="step-result">
              <h4>生成的主张 ({claims.length}):</h4>
              <div className="claims-grid">
                {claims.map((claim) => (
                  <div key={claim.id} className="claim-card">
                    <p>{claim.text}</p>
                    <div className="claim-meta">
                      <span>主题: {claim.topic}</span>
                      <span>子主题: {claim.sub_topic}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 步骤二：关联证据 */}
        <div className="pipeline-step">
          <h3>步骤 2: 关联证据 (Evidence)</h3>
          <button onClick={handleStep2_AttachEvidence} disabled={loading || claims.length === 0 || claimsWithEvidence.length > 0}>
            {loading && step === 2 ? '关联中...' : '为上述主张关联证据'}
          </button>
          {claimsWithEvidence.length > 0 && (
            <div className="step-result">
              <h4>带证据的主张 ({claimsWithEvidence.length}):</h4>
              <div className="claims-with-evidence-list">
                {claimsWithEvidence.map((claim) => (
                  <div key={claim.id} className="claim-with-evidence-card">
                    <div className="claim-card-content">
                      <p>{claim.text}</p>
                      <div className="claim-meta">
                        <span>主题: {claim.topic}</span>
                        <span>子主题: {claim.sub_topic}</span>
                      </div>
                    </div>
                    <h5>关联证据 ({claim.evidence.length}):</h5>
                    <ul className="evidence-list">
                      {claim.evidence.map((paper) => (
                        <li key={paper.id} className="evidence-item">
                          <span className="evidence-title">{paper.title}</span>
                          <span className="evidence-authors">{paper.authors?.join(', ')} ({paper.year})</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 步骤三：渲染综述 */}
        <div className="pipeline-step">
          <h3>步骤 3: 渲染最终综述</h3>
          <button onClick={handleStep3_RenderSection} disabled={loading || claimsWithEvidence.length === 0 || !!finalRender}>
            {loading && step === 3 ? '渲染中...' : '渲染最终综述章节'}
          </button>
          {finalRender && (
            <div className="step-result">
              <h4>最终综述:</h4>
              <div className="final-render-container prose prose-invert max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {finalRender}
                </ReactMarkdown>
              </div>
              <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  onClick={handleExportMarkdown}
                  disabled={exportLoading}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '6px',
                    border: 'none',
                    background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
                    color: '#fff',
                    fontWeight: 600,
                    cursor: exportLoading ? 'not-allowed' : 'pointer',
                    opacity: exportLoading ? 0.7 : 1,
                  }}
                >
                  {exportLoading ? '导出中...' : '导出 Markdown'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* RAG Debug Drawer */}
      
        {/* Step 4: Assemble Complete Review */}
        <div className="pipeline-step">
          <h3>Step 4: Assemble Complete Review</h3>
          <p style={{ color: '#94a3b8', fontSize: '13px', marginBottom: '12px' }}>
            Combine all rendered sections and generate a reference list.
          </p>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '12px' }}>
            <label style={{ color: '#9ca3af', fontSize: '13px' }}>Citation Style:</label>
            <select
              value={citationStyle}
              onChange={(e) => setCitationStyle(e.target.value)}
              style={{
                padding: '6px 10px',
                borderRadius: '4px',
                border: '1px solid #334155',
                backgroundColor: '#1e293b',
                color: '#fff',
              }}
            >
              <option value="harvard">Harvard</option>
              <option value="apa">APA 7th</option>
              <option value="ieee">IEEE</option>
              <option value="chicago">Chicago</option>
              <option value="vancouver">Vancouver</option>
            </select>
          </div>
          <button
            onClick={handleStep4_Assemble}
            disabled={assembleLoading || (!finalRender && !reviewId)}
            style={{
              padding: '8px 16px',
              borderRadius: '6px',
              border: 'none',
              background: assembleStats ? '#334155' : 'linear-gradient(135deg, #ec4899, #be185d)',
              color: '#fff',
              fontWeight: 600,
              cursor: assembleLoading || (!finalRender && !reviewId) ? 'not-allowed' : 'pointer',
              opacity: assembleLoading || (!finalRender && !reviewId) ? 0.6 : 1,
            }}
          >
            {assembleLoading ? 'Assembling...' : assembleStats ? 'Assembly Complete' : 'Assemble Full Review'}
          </button>

          {assembleStats && (
            <div style={{ marginTop: '8px', color: '#10b981', fontSize: '13px' }}>
              Assembled {assembleStats.sections} sections, {assembleStats.cited} papers cited.
            </div>
          )}

          {fullReviewMarkdown && (
            <div className="step-result" style={{ marginTop: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <h4>Complete Review:</h4>
                <button
                  onClick={() => {
                    const blob = new Blob([fullReviewMarkdown], { type: 'text/markdown' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `review_${reviewId || 'draft'}.md`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '6px',
                    border: '1px solid #334155',
                    background: 'transparent',
                    color: '#60a5fa',
                    cursor: 'pointer',
                    fontSize: '13px',
                  }}
                >
                  Download .md
                </button>
              </div>
              <div style={{
                maxHeight: '500px',
                overflow: 'auto',
                padding: '16px',
                backgroundColor: '#0f172a',
                borderRadius: '8px',
                border: '1px solid #1e293b',
              }}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{fullReviewMarkdown}</ReactMarkdown>
              </div>
            </div>
          )}
        </div>


        {showRagDebug && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            right: 0,
            width: '600px',
            height: '100vh',
            backgroundColor: '#0f172a',
            borderLeft: '1px solid #334155',
            zIndex: 1000,
            overflowY: 'auto',
            boxShadow: '-4px 0 15px rgba(0,0,0,0.5)',
            padding: '20px',
            boxSizing: 'border-box',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '10px' }}>
            <button
              onClick={() => setShowRagDebug(false)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#9ca3af',
                cursor: 'pointer',
                fontSize: '20px',
              }}
            >
              ×
            </button>
          </div>
          <SemanticSearchDebugPanel />
        </div>
      )}
    </div>
  );
};

export default PhdPipelinePage;