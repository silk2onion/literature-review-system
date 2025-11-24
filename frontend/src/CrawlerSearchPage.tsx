import { useState, useEffect } from "react";
import {
    Search,
    Play,
    Pause,
    RotateCcw,
    CheckCircle,
    AlertCircle,
    Loader,
    List,
    Plus
} from "lucide-react";
import type {
    CrawlJob,
    CrawlJobPayload,
    CrawlJobResponse,
    CrawlJobListResponse,
    JobStatusCode
} from "./types";

const API_BASE_URL = "http://localhost:5444";

const SOURCE_OPTIONS = [
    { value: "arxiv", label: "arXiv" },
    { value: "crossref", label: "CrossRef" },
    { value: "scholar_serpapi", label: "Google Scholar" },
    { value: "scopus", label: "Scopus" },
];

const STATUS_LABELS: Record<JobStatusCode, string> = {
    pending: '等待中',
    running: '进行中',
    completed: '已完成',
    failed: '失败',
    paused: '已暂停',
};

// Helper for status colors
const getStatusStyle = (status: JobStatusCode) => {
    switch (status) {
        case 'pending': return { color: '#6b7280', backgroundColor: '#f3f4f6' };
        case 'running': return { color: '#3b82f6', backgroundColor: '#eff6ff' };
        case 'completed': return { color: '#22c55e', backgroundColor: '#f0fdf4' };
        case 'failed': return { color: '#ef4444', backgroundColor: '#fef2f2' };
        case 'paused': return { color: '#eab308', backgroundColor: '#fefce8' };
        default: return { color: '#6b7280', backgroundColor: '#f3f4f6' };
    }
};

export default function CrawlerSearchPage() {
    const [activeTab, setActiveTab] = useState<"new" | "history">("new");

    // Search State
    const [keywords, setKeywords] = useState("");
    const [selectedSources, setSelectedSources] = useState<string[]>(["arxiv", "crossref"]);
    const [yearFrom, setYearFrom] = useState("");
    const [yearTo, setYearTo] = useState("");
    const [maxResults, setMaxResults] = useState(200);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitMessage, setSubmitMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

    // Jobs State
    const [jobs, setJobs] = useState<CrawlJob[]>([]);
    const [jobsLoading, setJobsLoading] = useState(false);
    const [jobsError, setJobsError] = useState<string | null>(null);
    const [actioningJobId, setActioningJobId] = useState<number | null>(null);

    // Fetch jobs when tab changes to history
    useEffect(() => {
        if (activeTab === "history") {
            fetchJobs();
        }
    }, [activeTab]);

    const fetchJobs = async () => {
        try {
            setJobsLoading(true);
            setJobsError(null);
            const res = await fetch(`${API_BASE_URL}/api/crawl/jobs?skip=0&limit=50`);
            if (!res.ok) throw new Error("Failed to fetch jobs");
            const data: CrawlJobListResponse = await res.json();
            setJobs(data.items || []);
        } catch (err) {
            setJobsError((err as Error).message);
        } finally {
            setJobsLoading(false);
        }
    };

    const handleSourceToggle = (source: string) => {
        setSelectedSources((prev) =>
            prev.includes(source) ? prev.filter((s) => s !== source) : [...prev, source]
        );
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!keywords.trim()) {
            setSubmitMessage({ type: "error", text: "请输入关键词" });
            return;
        }
        if (selectedSources.length === 0) {
            setSubmitMessage({ type: "error", text: "请至少选择一个数据源" });
            return;
        }

        try {
            setIsSubmitting(true);
            setSubmitMessage(null);

            const keywordList = keywords.split(/[,，]/).map((k) => k.trim()).filter(Boolean);

            const payload: CrawlJobPayload = {
                keywords: keywordList,
                sources: selectedSources,
                year_from: yearFrom ? Number(yearFrom) : null,
                year_to: yearTo ? Number(yearTo) : null,
                max_results: Number(maxResults),
                page_size: 50,
            };

            const resp = await fetch(`${API_BASE_URL}/api/crawl/jobs`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            if (!resp.ok) {
                const text = await resp.text();
                throw new Error(`创建任务失败: ${text}`);
            }

            const data: CrawlJobResponse = await resp.json();
            setSubmitMessage({
                type: "success",
                text: `任务已创建 (ID: ${data.id})`,
            });

            // Switch to history tab after short delay
            setTimeout(() => {
                setActiveTab("history");
                setKeywords("");
                setSubmitMessage(null);
            }, 1500);

        } catch (err) {
            setSubmitMessage({ type: "error", text: (err as Error).message });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleJobAction = async (jobId: number, action: 'run_once' | 'pause' | 'resume' | 'retry') => {
        if (action === 'retry' && !window.confirm('确定要重置该任务进度并重新开始吗？')) return;

        setActioningJobId(jobId);
        try {
            const res = await fetch(`${API_BASE_URL}/api/crawl/jobs/${jobId}/${action}`, { method: 'POST' });
            if (!res.ok) throw new Error("Action failed");
            await fetchJobs();
        } catch (err) {
            alert((err as Error).message);
        } finally {
            setActioningJobId(null);
        }
    };

    // Styles
    const containerStyle: React.CSSProperties = {
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#f9fafb',
    };

    const headerStyle: React.CSSProperties = {
        padding: '24px 32px',
        borderBottom: '1px solid #e5e7eb',
        backgroundColor: 'rgba(255, 255, 255, 0.8)',
        backdropFilter: 'blur(8px)',
        position: 'sticky',
        top: 0,
        zIndex: 10,
    };

    const tabContainerStyle: React.CSSProperties = {
        display: 'flex',
        padding: '4px',
        backgroundColor: '#f3f4f6',
        borderRadius: '8px',
        width: 'fit-content',
    };

    const getTabStyle = (isActive: boolean): React.CSSProperties => ({
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '6px 16px',
        borderRadius: '6px',
        fontSize: '14px',
        fontWeight: 500,
        cursor: 'pointer',
        border: 'none',
        backgroundColor: isActive ? '#ffffff' : 'transparent',
        color: isActive ? '#111827' : '#6b7280',
        boxShadow: isActive ? '0 1px 2px rgba(0, 0, 0, 0.05)' : 'none',
        transition: 'all 0.2s',
    });

    const contentStyle: React.CSSProperties = {
        flex: 1,
        overflow: 'auto',
        padding: '32px',
    };

    const cardStyle: React.CSSProperties = {
        backgroundColor: '#ffffff',
        borderRadius: '12px',
        border: '1px solid #e5e7eb',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
        maxWidth: '896px',
        margin: '0 auto',
        padding: activeTab === 'new' ? '32px' : '0',
        overflow: 'hidden',
    };

    const labelStyle: React.CSSProperties = {
        display: 'block',
        fontSize: '14px',
        fontWeight: 600,
        color: '#374151',
        marginBottom: '8px',
    };

    const inputStyle: React.CSSProperties = {
        width: '100%',
        padding: '10px 16px',
        borderRadius: '8px',
        border: '1px solid #e5e7eb',
        fontSize: '14px',
        outline: 'none',
        transition: 'border-color 0.2s',
    };

    const buttonStyle: React.CSSProperties = {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '10px 24px',
        backgroundColor: '#2563eb',
        color: '#ffffff',
        border: 'none',
        borderRadius: '8px',
        fontSize: '14px',
        fontWeight: 500,
        cursor: isSubmitting ? 'not-allowed' : 'pointer',
        opacity: isSubmitting ? 0.7 : 1,
    };

    return (
        <div style={containerStyle}>
            {/* Header */}
            <div style={headerStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
                    <div>
                        <h1 style={{ fontSize: '24px', fontWeight: 600, color: '#111827', margin: 0 }}>文献检索</h1>
                        <p style={{ fontSize: '14px', color: '#6b7280', marginTop: '4px' }}>创建新的检索任务或管理现有任务进度</p>
                    </div>
                </div>

                <div style={tabContainerStyle}>
                    <button onClick={() => setActiveTab("new")} style={getTabStyle(activeTab === "new")}>
                        <Plus size={16} />
                        新建任务
                    </button>
                    <button onClick={() => setActiveTab("history")} style={getTabStyle(activeTab === "history")}>
                        <List size={16} />
                        任务历史
                    </button>
                </div>
            </div>

            {/* Content */}
            <div style={contentStyle}>
                <div style={cardStyle}>
                    {activeTab === "new" ? (
                        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                            {/* Keywords */}
                            <div>
                                <label style={labelStyle}>
                                    关键词 <span style={{ fontWeight: 400, color: '#9ca3af' }}>(逗号分隔)</span>
                                </label>
                                <textarea
                                    value={keywords}
                                    onChange={(e) => setKeywords(e.target.value)}
                                    placeholder="例如: large language models, agent, planning..."
                                    style={{ ...inputStyle, minHeight: '100px', resize: 'vertical' }}
                                />
                            </div>

                            {/* Sources */}
                            <div>
                                <label style={labelStyle}>数据源</label>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                                    {SOURCE_OPTIONS.map((opt) => (
                                        <label
                                            key={opt.value}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '8px',
                                                padding: '8px 16px',
                                                borderRadius: '8px',
                                                border: `1px solid ${selectedSources.includes(opt.value) ? '#3b82f6' : '#e5e7eb'}`,
                                                backgroundColor: selectedSources.includes(opt.value) ? '#eff6ff' : '#ffffff',
                                                color: selectedSources.includes(opt.value) ? '#1d4ed8' : '#4b5563',
                                                cursor: 'pointer',
                                                fontSize: '14px',
                                                fontWeight: 500,
                                            }}
                                        >
                                            <input
                                                type="checkbox"
                                                style={{ display: 'none' }}
                                                checked={selectedSources.includes(opt.value)}
                                                onChange={() => handleSourceToggle(opt.value)}
                                            />
                                            {opt.label}
                                            {selectedSources.includes(opt.value) && <CheckCircle size={14} />}
                                        </label>
                                    ))}
                                </div>
                            </div>

                            {/* Settings Grid */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }}>
                                <div>
                                    <label style={labelStyle}>年份范围</label>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        <input
                                            type="number"
                                            value={yearFrom}
                                            onChange={(e) => setYearFrom(e.target.value)}
                                            placeholder="Starting"
                                            style={inputStyle}
                                        />
                                        <span style={{ color: '#9ca3af' }}>-</span>
                                        <input
                                            type="number"
                                            value={yearTo}
                                            onChange={(e) => setYearTo(e.target.value)}
                                            placeholder="Ending"
                                            style={inputStyle}
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label style={labelStyle}>最大抓取数量</label>
                                    <input
                                        type="number"
                                        value={maxResults}
                                        onChange={(e) => setMaxResults(Number(e.target.value))}
                                        min={1}
                                        max={5000}
                                        style={inputStyle}
                                    />
                                </div>
                            </div>

                            {/* Submit */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '16px' }}>
                                {submitMessage && (
                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        fontSize: '14px',
                                        color: submitMessage.type === 'success' ? '#16a34a' : '#dc2626'
                                    }}>
                                        {submitMessage.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
                                        {submitMessage.text}
                                    </div>
                                )}
                                <button type="submit" disabled={isSubmitting} style={{ ...buttonStyle, marginLeft: 'auto' }}>
                                    {isSubmitting ? (
                                        <>
                                            <Loader size={16} className="animate-spin" /> {/* Note: animate-spin won't work without CSS, but icon will show */}
                                            创建中...
                                        </>
                                    ) : (
                                        <>
                                            <Search size={16} />
                                            开始检索
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>
                    ) : (
                        // History Tab
                        <div style={{ width: '100%' }}>
                            {jobsLoading && jobs.length === 0 ? (
                                <div style={{ padding: '48px', display: 'flex', flexDirection: 'column', alignItems: 'center', color: '#9ca3af' }}>
                                    <Loader size={32} style={{ marginBottom: '16px' }} />
                                    <p>加载任务中...</p>
                                </div>
                            ) : jobs.length === 0 ? (
                                <div style={{ padding: '48px', display: 'flex', flexDirection: 'column', alignItems: 'center', color: '#9ca3af' }}>
                                    <List size={48} style={{ marginBottom: '16px', opacity: 0.2 }} />
                                    <p>暂无历史任务</p>
                                </div>
                            ) : (
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                                    <thead style={{ backgroundColor: '#f9fafb', color: '#6b7280', textAlign: 'left' }}>
                                        <tr>
                                            <th style={{ padding: '12px 24px', fontWeight: 500 }}>ID</th>
                                            <th style={{ padding: '12px 24px', fontWeight: 500 }}>关键词</th>
                                            <th style={{ padding: '12px 24px', fontWeight: 500 }}>状态</th>
                                            <th style={{ padding: '12px 24px', fontWeight: 500, textAlign: 'right' }}>进度</th>
                                            <th style={{ padding: '12px 24px', fontWeight: 500, textAlign: 'right' }}>操作</th>
                                        </tr>
                                    </thead>
                                    <tbody style={{ divideY: '1px solid #f3f4f6' }}>
                                        {jobs.map((job) => (
                                            <tr key={job.id} style={{ borderTop: '1px solid #f3f4f6' }}>
                                                <td style={{ padding: '16px 24px', color: '#6b7280' }}>#{job.id}</td>
                                                <td style={{ padding: '16px 24px', color: '#111827', fontWeight: 500 }}>
                                                    {job.keywords.join(", ")}
                                                    <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '4px', fontWeight: 400 }}>
                                                        {job.sources.join(", ")} • {new Date(job.created_at).toLocaleDateString()}
                                                    </div>
                                                </td>
                                                <td style={{ padding: '16px 24px' }}>
                                                    <span style={{
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        padding: '2px 10px',
                                                        borderRadius: '9999px',
                                                        fontSize: '12px',
                                                        fontWeight: 500,
                                                        ...getStatusStyle(job.status)
                                                    }}>
                                                        {STATUS_LABELS[job.status] || job.status}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '16px 24px', textAlign: 'right', color: '#4b5563' }}>
                                                    {job.fetched_count} / {job.max_results}
                                                </td>
                                                <td style={{ padding: '16px 24px', textAlign: 'right' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
                                                        {(job.status === 'pending' || job.status === 'running') && (
                                                            <>
                                                                <button
                                                                    onClick={() => handleJobAction(job.id, 'run_once')}
                                                                    disabled={actioningJobId === job.id}
                                                                    style={{ padding: '6px', color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer' }}
                                                                    title="执行一步"
                                                                >
                                                                    <Play size={16} />
                                                                </button>
                                                                <button
                                                                    onClick={() => handleJobAction(job.id, 'pause')}
                                                                    disabled={actioningJobId === job.id}
                                                                    style={{ padding: '6px', color: '#ca8a04', background: 'none', border: 'none', cursor: 'pointer' }}
                                                                    title="暂停"
                                                                >
                                                                    <Pause size={16} />
                                                                </button>
                                                            </>
                                                        )}
                                                        {job.status === 'paused' && (
                                                            <button
                                                                onClick={() => handleJobAction(job.id, 'resume')}
                                                                disabled={actioningJobId === job.id}
                                                                style={{ padding: '6px', color: '#16a34a', background: 'none', border: 'none', cursor: 'pointer' }}
                                                                title="恢复"
                                                            >
                                                                <Play size={16} />
                                                            </button>
                                                        )}
                                                        {(job.status === 'failed' || job.status === 'completed') && (
                                                            <button
                                                                onClick={() => handleJobAction(job.id, 'retry')}
                                                                disabled={actioningJobId === job.id}
                                                                style={{ padding: '6px', color: '#4b5563', background: 'none', border: 'none', cursor: 'pointer' }}
                                                                title="重试"
                                                            >
                                                                <RotateCcw size={16} />
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
