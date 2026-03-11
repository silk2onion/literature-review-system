import { useEffect, useState } from "react";
import { 
  FileText, 
  Trash2, 
  ExternalLink, 
  Download, 
  Calendar, 
  BookOpen,
  ArrowLeft
} from "lucide-react";
import ReactMarkdown from "react-markdown";

const API_BASE_URL = "http://localhost:5444";

interface Review {
  id: number;
  title: string;
  status: string;
  paper_count: number;
  created_at: string;
  analysis_json?: any;
  content?: string;
  framework?: string;
}

export default function ReviewListPage() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedReview, setSelectedReview] = useState<Review | null>(null);
  const [exporting, setExporting] = useState<number | null>(null);

  const fetchReviews = async () => {
    try {
      setLoading(true);
      const resp = await fetch(`${API_BASE_URL}/api/reviews/`);
      if (!resp.ok) throw new Error("Failed to fetch reviews");
      const data = await resp.json();
      setReviews(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReviews();
  }, []);

  const handleDelete = async (id: number) => {
    if (!confirm("确定要永久删除这份文献综述吗？")) return;
    try {
      const resp = await fetch(`${API_BASE_URL}/api/reviews/${id}`, {
        method: "DELETE",
      });
      if (resp.ok) {
        setReviews(reviews.filter((r) => r.id !== id));
        if (selectedReview?.id === id) setSelectedReview(null);
      }
    } catch (err) {
      alert("删除失败");
    }
  };

  const handleExport = async (review: Review, format: "markdown" | "docx" | "pdf") => {
    setExporting(review.id);
    try {
      const resp = await fetch(`${API_BASE_URL}/api/reviews/${review.id}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format, include_references: true }),
      });
      if (!resp.ok) throw new Error("Export failed");

      const blob = await resp.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Review_${review.id}_${new Date().toISOString().split('T')[0]}.${format === 'markdown' ? 'md' : format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error(err);
      alert("导出失败");
    } finally {
      setExporting(null);
    }
  };

  if (selectedReview) {
    return (
      <div className="page-container" style={{ padding: "20px 40px", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
          <button onClick={() => setSelectedReview(null)} className="icon-button" style={{ background: "rgba(255,255,255,0.05)" }}>
            <ArrowLeft size={20} />
          </button>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: 24, margin: 0, color: "#e2e8f0" }}>{selectedReview.title}</h1>
            <p style={{ color: "#94a3b8", margin: "4px 0 0 0" }}>Review #{selectedReview.id} • {new Date(selectedReview.created_at).toLocaleString()}</p>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button 
              className="action-button secondary" 
              onClick={() => handleExport(selectedReview, 'markdown')}
              disabled={exporting === selectedReview.id}
            >
              <Download size={14} style={{ marginRight: 6 }} />
              {exporting === selectedReview.id ? "导出中..." : "导出 MD"}
            </button>
          </div>
        </div>

        <div className="result-card" style={{ padding: 32, background: "rgba(15, 23, 42, 0.4)", borderRadius: 12 }}>
          <div className="markdown-body">
            <ReactMarkdown>
              {selectedReview.content || selectedReview.analysis_json?.markdown || selectedReview.framework || "# 无内容可显示"}
            </ReactMarkdown>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container" style={{ padding: "24px 32px", overflowY: "auto" }}>
      <header className="page-header" style={{ marginBottom: 32 }}>
        <div className="page-title">
          <h1 style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <FileText className="purple" />
            文献综述书架
          </h1>
          <p>查看并下载所有已生成的深度综述与编排结果</p>
        </div>
      </header>

      {loading ? (
        <div className="loading-state">正在查找您的研究成果...</div>
      ) : error ? (
        <div className="error-message">❌ 加载库失败: {error}</div>
      ) : reviews.length === 0 ? (
        <div style={{ textAlign: "center", padding: "80px 0", color: "#64748b" }}>
          <BookOpen size={48} style={{ opacity: 0.3, marginBottom: 16 }} />
          <p>您的书架目前空空如也。</p>
          <p style={{ fontSize: 13 }}>快去使用“一键综述生成”或“科研管线”开启您的第一个大作吧！</p>
        </div>
      ) : (
        <div className="review-list" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {reviews.map((review) => (
            <div 
              key={review.id} 
              className="review-item-card"
              style={{
                background: "rgba(30, 41, 59, 0.5)",
                borderRadius: 12,
                padding: "20px 24px",
                border: "1px solid rgba(148, 163, 184, 0.1)",
                display: "flex",
                alignItems: "center",
                transition: "all 0.2s",
                gap: 20
              }}
            >
              <div style={{ 
                width: 44, 
                height: 44, 
                background: "rgba(139, 92, 246, 0.1)", 
                borderRadius: 10, 
                display: "flex", 
                alignItems: "center", 
                justifyContent: "center",
                color: "#a78bfa"
              }}>
                <FileText size={22} />
              </div>

              <div style={{ flex: 1 }}>
                <h3 style={{ margin: "0 0 6px 0", color: "#f1f5f9", fontSize: 16 }}>{review.title}</h3>
                <div style={{ display: "flex", gap: 16, color: "#94a3b8", fontSize: 12 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <Calendar size={13} />
                    {new Date(review.created_at).toLocaleDateString()}
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <BookOpen size={13} />
                    引用 {review.paper_count} 篇文献
                  </span>
                  <span style={{ color: review.status === 'completed' ? '#22c55e' : '#eab308' }}>
                    ● {review.status.toUpperCase()}
                  </span>
                </div>
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <button 
                  onClick={() => setSelectedReview(review)}
                  title="查看详情"
                  className="icon-button"
                  style={{ background: "rgba(255,255,255,0.05)" }}
                >
                  <ExternalLink size={16} />
                </button>
                <button 
                  onClick={() => handleExport(review, 'markdown')}
                  title="导出 Markdown"
                  className="icon-button"
                  style={{ background: "rgba(255,255,255,0.05)" }}
                  disabled={exporting === review.id}
                >
                  <Download size={16} />
                </button>
                <button 
                  onClick={() => handleDelete(review.id)}
                  title="删除"
                  className="icon-button"
                  style={{ background: "rgba(239, 68, 68, 0.1)", color: "#fca5a5" }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
