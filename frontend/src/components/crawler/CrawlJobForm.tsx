import {
  Search,
  CheckCircle,
  AlertCircle,
  Loader,
  ScanSearch,
} from "lucide-react";

const SOURCE_OPTIONS = [
  { value: "arxiv", label: "arXiv" },
  { value: "crossref", label: "CrossRef" },
  { value: "scholar_serpapi", label: "Google Scholar" },
  { value: "scopus", label: "Scopus" },
  { value: "semantic_scholar", label: "Semantic Scholar" },
  { value: "openalex", label: "OpenAlex" },
];

interface CrawlJobFormProps {
  keywords: string;
  setKeywords: (v: string) => void;
  selectedSources: string[];
  onSourceToggle: (source: string) => void;
  yearFrom: string;
  setYearFrom: (v: string) => void;
  yearTo: string;
  setYearTo: (v: string) => void;
  maxResults: number;
  setMaxResults: (v: number) => void;
  exhaustive: boolean;
  setExhaustive: (v: boolean) => void;
  isSubmitting: boolean;
  submitMessage: { type: "success" | "error"; text: string } | null;
  onSubmit: (e: React.FormEvent) => void;
}

export default function CrawlJobForm({
  keywords,
  setKeywords,
  selectedSources,
  onSourceToggle,
  yearFrom,
  setYearFrom,
  yearTo,
  setYearTo,
  maxResults,
  setMaxResults,
  exhaustive,
  setExhaustive,
  isSubmitting,
  submitMessage,
  onSubmit,
}: CrawlJobFormProps) {
  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: "14px",
    fontWeight: 600,
    color: "#374151",
    marginBottom: "8px",
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 16px",
    borderRadius: "8px",
    border: "1px solid #e5e7eb",
    fontSize: "14px",
    outline: "none",
    transition: "border-color 0.2s",
  };

  const buttonStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "10px 24px",
    backgroundColor: "#2563eb",
    color: "#ffffff",
    border: "none",
    borderRadius: "8px",
    fontSize: "14px",
    fontWeight: 500,
    cursor: isSubmitting ? "not-allowed" : "pointer",
    opacity: isSubmitting ? 0.7 : 1,
  };

  return (
    <form
      onSubmit={onSubmit}
      style={{ display: "flex", flexDirection: "column", gap: "24px" }}
    >
      {/* Keywords */}
      <div>
        <label style={labelStyle}>
          关键词{" "}
          <span style={{ fontWeight: 400, color: "#9ca3af" }}>
            (支持 OR / AND 布尔语法，逗号分隔多组)
          </span>
        </label>
        <textarea
          value={keywords}
          onChange={(e) => setKeywords(e.target.value)}
          placeholder={
            '例如: TOD OR "transit oriented development" AND qingdao'
          }
          style={{
            ...inputStyle,
            minHeight: "100px",
            resize: "vertical",
          }}
        />
        <div
          style={{
            marginTop: "8px",
            padding: "10px 14px",
            backgroundColor: "#f0f9ff",
            border: "1px solid #bae6fd",
            borderRadius: "6px",
            fontSize: "12px",
            color: "#0369a1",
            lineHeight: "1.6",
          }}
        >
          <strong>💡 布尔语法：</strong>
          <code
            style={{
              backgroundColor: "#e0f2fe",
              padding: "1px 4px",
              borderRadius: "3px",
            }}
          >
            OR
          </code>{" "}
          表示"或"（拆分为多次搜索合并），
          <code
            style={{
              backgroundColor: "#e0f2fe",
              padding: "1px 4px",
              borderRadius: "3px",
            }}
          >
            AND
          </code>{" "}
          表示"且"，
          <code
            style={{
              backgroundColor: "#e0f2fe",
              padding: "1px 4px",
              borderRadius: "3px",
            }}
          >
            "引号"
          </code>{" "}
          保持短语完整。
          <br />
          示例：
          <code
            style={{
              backgroundColor: "#e0f2fe",
              padding: "2px 6px",
              borderRadius: "3px",
            }}
          >
            TOD OR "transit oriented development" AND qingdao
          </code>
        </div>
      </div>

      {/* Sources */}
      <div>
        <label style={labelStyle}>数据源</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
          {SOURCE_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "8px 16px",
                borderRadius: "8px",
                border: `1px solid ${selectedSources.includes(opt.value) ? "#3b82f6" : "#e5e7eb"}`,
                backgroundColor: selectedSources.includes(opt.value)
                  ? "#eff6ff"
                  : "#ffffff",
                color: selectedSources.includes(opt.value)
                  ? "#1d4ed8"
                  : "#4b5563",
                cursor: "pointer",
                fontSize: "14px",
                fontWeight: 500,
              }}
            >
              <input
                type="checkbox"
                style={{ display: "none" }}
                checked={selectedSources.includes(opt.value)}
                onChange={() => onSourceToggle(opt.value)}
              />
              {opt.label}
              {selectedSources.includes(opt.value) && (
                <CheckCircle size={14} />
              )}
            </label>
          ))}
        </div>
      </div>

      {/* Exhaustive Mode Toggle */}
      <div>
        <label
          onClick={() => setExhaustive(!exhaustive)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            padding: "14px 18px",
            borderRadius: "10px",
            border: `2px solid ${exhaustive ? "#7c3aed" : "#e5e7eb"}`,
            backgroundColor: exhaustive ? "#f5f3ff" : "#ffffff",
            cursor: "pointer",
            transition: "all 0.2s",
          }}
        >
          <div
            style={{
              width: "40px",
              height: "22px",
              borderRadius: "11px",
              backgroundColor: exhaustive ? "#7c3aed" : "#d1d5db",
              position: "relative",
              transition: "background-color 0.2s",
              flexShrink: 0,
            }}
          >
            <div
              style={{
                width: "18px",
                height: "18px",
                borderRadius: "50%",
                backgroundColor: "#ffffff",
                position: "absolute",
                top: "2px",
                left: exhaustive ? "20px" : "2px",
                transition: "left 0.2s",
                boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
              }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontSize: "14px",
                fontWeight: 600,
                color: exhaustive ? "#5b21b6" : "#374151",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <ScanSearch size={16} />
              穷尽检索模式 (Scoping Review)
            </div>
            <div
              style={{
                fontSize: "12px",
                color: "#6b7280",
                marginTop: "2px",
              }}
            >
              忽略数量上限，检索数据源中所有匹配结果，适用于系统性文献综述
              (PRISMA)
            </div>
          </div>
        </label>
      </div>

      {/* Settings Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "32px",
        }}
      >
        <div>
          <label style={labelStyle}>年份范围</label>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
            }}
          >
            <input
              type="number"
              value={yearFrom}
              onChange={(e) => setYearFrom(e.target.value)}
              placeholder="Starting"
              style={inputStyle}
            />
            <span style={{ color: "#9ca3af" }}>-</span>
            <input
              type="number"
              value={yearTo}
              onChange={(e) => setYearTo(e.target.value)}
              placeholder="Ending"
              style={inputStyle}
            />
          </div>
        </div>

        <div
          style={{
            opacity: exhaustive ? 0.4 : 1,
            pointerEvents: exhaustive ? "none" : "auto",
          }}
        >
          <label style={labelStyle}>
            最大抓取数量
            {exhaustive && (
              <span
                style={{
                  fontWeight: 400,
                  color: "#7c3aed",
                  marginLeft: "8px",
                }}
              >
                （穷尽模式已启用）
              </span>
            )}
          </label>
          <input
            type="number"
            value={exhaustive ? "∞" : maxResults}
            onChange={(e) => setMaxResults(Number(e.target.value))}
            min={1}
            max={5000}
            style={inputStyle}
            disabled={exhaustive}
          />
        </div>
      </div>

      {/* Submit */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingTop: "16px",
        }}
      >
        {submitMessage && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              fontSize: "14px",
              color:
                submitMessage.type === "success"
                  ? "#16a34a"
                  : "#dc2626",
            }}
          >
            {submitMessage.type === "success" ? (
              <CheckCircle size={16} />
            ) : (
              <AlertCircle size={16} />
            )}
            {submitMessage.text}
          </div>
        )}
        <button
          type="submit"
          disabled={isSubmitting}
          style={{ ...buttonStyle, marginLeft: "auto" }}
        >
          {isSubmitting ? (
            <>
              <Loader size={16} className="animate-spin" />{" "}
              {/* Note: animate-spin won't work without CSS, but icon will show */}
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
  );
}
