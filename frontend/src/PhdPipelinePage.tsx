import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import SemanticSearchDebugPanel from './SemanticSearchDebugPanel';

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
  initialSources = ['arxiv', 'scholar_serpapi', 'scopus'],
  initialPaperIds = [],
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
  const [sources, setSources] = useState<string[]>(initialSources);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [paperIds, setPaperIds] = useState<number[]>(initialPaperIds);

  // 各阶段的产出
  const [claims, setClaims] = useState<Claim[]>([]);
  const [claimsWithEvidence, setClaimsWithEvidence] = useState<ClaimWithEvidence[]>([]);
  const [finalRender, setFinalRender] = useState<string>('');
  
  const [reviewId, setReviewId] = useState<number | null>(null);
  const [exportLoading, setExportLoading] = useState(false);
  const [showRagDebug, setShowRagDebug] = useState(false);
  const [manualReviewId, setManualReviewId] = useState('');

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
      };

      if (paperIds.length > 0) {
        body.paper_ids = paperIds;
        // 当指定了 paper_ids 时，通常不需要再进行搜索，但保留 keywords 作为元数据
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', color: '#9ca3af', marginBottom: '4px' }}>
              关键词 (逗号分隔)
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
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '13px', color: '#9ca3af', marginBottom: '4px' }}>
              数据源
            </label>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              {['arxiv', 'scholar_serpapi', 'scopus', 'local_rag'].map(src => (
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

          <div style={{ display: 'flex', gap: '16px' }}>
            <div>
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
            <div>
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
          </div>
        </div>
      </div>

      <div className="pipeline-steps-container">
        {/* 步骤一：生成主张 */}
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