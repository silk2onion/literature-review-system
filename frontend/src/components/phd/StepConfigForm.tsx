import React from "react";

interface StepConfigFormProps {
  topic: string;
  onTopicChange: (value: string) => void;
  keywords: string;
  onKeywordsChange: (value: string) => void;
  sources: string[];
  onSourcesChange: (value: string[]) => void;
  yearFrom: string;
  onYearFromChange: (value: string) => void;
  yearTo: string;
  onYearToChange: (value: string) => void;
  paperLimit: string;
  onPaperLimitChange: (value: string) => void;
  sortBy: string;
  onSortByChange: (value: string) => void;
  groupId?: number;
}

const StepConfigForm: React.FC<StepConfigFormProps> = ({
  topic,
  onTopicChange,
  keywords,
  onKeywordsChange,
  sources,
  onSourcesChange,
  yearFrom,
  onYearFromChange,
  yearTo,
  onYearToChange,
  paperLimit,
  onPaperLimitChange,
  sortBy,
  onSortByChange,
  groupId,
}) => {
  return (
    <div
      style={{
        marginBottom: "24px",
        padding: "16px",
        backgroundColor: "#0f172a",
        borderRadius: "8px",
        border: "1px solid #1f2937",
      }}
    >
      <h3 style={{ marginTop: 0, marginBottom: "16px", fontSize: "16px" }}>
        管线配置
      </h3>

      {groupId ? (
        <div
          style={{
            padding: "12px",
            backgroundColor: "rgba(59, 130, 246, 0.1)",
            border: "1px solid rgba(59, 130, 246, 0.3)",
            borderRadius: "6px",
            marginBottom: "16px",
            color: "#93c5fd",
            fontSize: "14px",
          }}
        >
          <strong>已选择文献分组 (ID: {groupId})</strong>
          <p style={{ margin: "4px 0 0 0", fontSize: "13px", opacity: 0.9 }}>
            将直接使用该分组下的文献生成综述。您可以调整下方的"文献数量上限"和"排序策略"来控制上下文长度。
          </p>
        </div>
      ) : null}

      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <div
          style={{
            opacity: groupId ? 0.5 : 1,
            pointerEvents: groupId ? "none" : "auto",
          }}
        >
          <label
            style={{
              display: "block",
              fontSize: "13px",
              color: "#9ca3af",
              marginBottom: "4px",
            }}
          >
            Research Topic (Step 0)
          </label>
          <input
            value={topic}
            onChange={(e) => onTopicChange(e.target.value)}
            placeholder="e.g., Transit-Oriented Development and Cultural Heritage"
            style={{
              width: "100%",
              padding: "8px",
              borderRadius: "4px",
              border: "1px solid #334155",
              backgroundColor: "#1e293b",
              color: "#fff",
              boxSizing: "border-box",
            }}
          />
        </div>
        <div
          style={{
            opacity: groupId ? 0.5 : 1,
            pointerEvents: groupId ? "none" : "auto",
          }}
        >
          <label
            style={{
              display: "block",
              fontSize: "13px",
              color: "#9ca3af",
              marginBottom: "4px",
            }}
          >
            Keywords (comma-separated)
          </label>
          <input
            value={keywords}
            onChange={(e) => onKeywordsChange(e.target.value)}
            style={{
              width: "100%",
              padding: "8px",
              borderRadius: "4px",
              border: "1px solid #334155",
              backgroundColor: "#1e293b",
              color: "#fff",
              boxSizing: "border-box",
            }}
          />
        </div>

        <div
          style={{
            marginBottom: "16px",
            opacity: groupId ? 0.5 : 1,
            pointerEvents: groupId ? "none" : "auto",
          }}
        >
          <label
            style={{
              display: "block",
              fontSize: "13px",
              color: "#9ca3af",
              marginBottom: "4px",
            }}
          >
            数据源
          </label>
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
            {[
              "arxiv",
              "scholar_serpapi",
              "scopus",
              "semantic_scholar",
              "local_rag",
            ].map((src) => (
              <label
                key={src}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  color: "#fff",
                  fontSize: "13px",
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={sources.includes(src)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      onSourcesChange([...sources, src]);
                    } else {
                      onSourcesChange(sources.filter((s) => s !== src));
                    }
                  }}
                />
                {src === "local_rag" ? "本地 RAG (增强)" : src}
              </label>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
          <div
            style={{
              opacity: groupId ? 0.5 : 1,
              pointerEvents: groupId ? "none" : "auto",
            }}
          >
            <label
              style={{
                display: "block",
                fontSize: "13px",
                color: "#9ca3af",
                marginBottom: "4px",
              }}
            >
              起始年份
            </label>
            <input
              type="number"
              value={yearFrom}
              onChange={(e) => onYearFromChange(e.target.value)}
              placeholder="2015"
              style={{
                width: "100px",
                padding: "8px",
                borderRadius: "4px",
                border: "1px solid #334155",
                backgroundColor: "#1e293b",
                color: "#fff",
              }}
            />
          </div>
          <div
            style={{
              opacity: groupId ? 0.5 : 1,
              pointerEvents: groupId ? "none" : "auto",
            }}
          >
            <label
              style={{
                display: "block",
                fontSize: "13px",
                color: "#9ca3af",
                marginBottom: "4px",
              }}
            >
              结束年份
            </label>
            <input
              type="number"
              value={yearTo}
              onChange={(e) => onYearToChange(e.target.value)}
              placeholder="2025"
              style={{
                width: "100px",
                padding: "8px",
                borderRadius: "4px",
                border: "1px solid #334155",
                backgroundColor: "#1e293b",
                color: "#fff",
              }}
            />
          </div>
          <div>
            <label
              style={{
                display: "block",
                fontSize: "13px",
                color: "#9ca3af",
                marginBottom: "4px",
              }}
            >
              文献数量上限
            </label>
            <input
              type="number"
              value={paperLimit}
              onChange={(e) => onPaperLimitChange(e.target.value)}
              style={{
                width: "100px",
                padding: "8px",
                borderRadius: "4px",
                border: "1px solid #334155",
                backgroundColor: "#1e293b",
                color: "#fff",
              }}
            />
          </div>
          <div>
            <label
              style={{
                display: "block",
                fontSize: "13px",
                color: "#9ca3af",
                marginBottom: "4px",
              }}
            >
              排序策略
            </label>
            <select
              value={sortBy}
              onChange={(e) => onSortByChange(e.target.value)}
              style={{
                width: "140px",
                padding: "8px",
                borderRadius: "4px",
                border: "1px solid #334155",
                backgroundColor: "#1e293b",
                color: "#fff",
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
  );
};

export default StepConfigForm;
