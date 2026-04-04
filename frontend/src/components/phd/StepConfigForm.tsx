import React from "react";
import { useLocale } from "../../hooks/useLocale";

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
  const { t } = useLocale();

  return (
    <div
      style={{
        marginBottom: "24px",
        padding: "20px",
        backgroundColor: "#f8fafc",
        borderRadius: "12px",
        border: "1px solid #e2e8f0",
      }}
    >
      <h3 style={{ marginTop: 0, marginBottom: "16px", fontSize: "16px", color: "var(--text-primary)" }}>
        {t("phd.config")}
      </h3>

      {groupId ? (
        <div
          style={{
            padding: "12px",
            backgroundColor: "rgba(59, 130, 246, 0.06)",
            border: "1px solid rgba(59, 130, 246, 0.2)",
            borderRadius: "8px",
            marginBottom: "16px",
            color: "#1e40af",
            fontSize: "14px",
          }}
        >
          <strong>{t("phd.groupSelected")} (ID: {groupId})</strong>
          <p style={{ margin: "4px 0 0 0", fontSize: "13px", opacity: 0.9 }}>
            {t("phd.groupSelectedDesc")}
          </p>
        </div>
      ) : null}

      <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
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
              marginBottom: "6px",
            }}
          >
            {t("phd.researchTopic")}
          </label>
          <input
            value={topic}
            onChange={(e) => onTopicChange(e.target.value)}
            placeholder="e.g., Transit-Oriented Development and Cultural Heritage"
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: "8px",
              border: "1px solid #e2e8f0",
              backgroundColor: "#ffffff",
              color: "#1e293b",
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
              marginBottom: "6px",
            }}
          >
            {t("phd.keywords")}
          </label>
          <input
            value={keywords}
            onChange={(e) => onKeywordsChange(e.target.value)}
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: "8px",
              border: "1px solid #e2e8f0",
              backgroundColor: "#ffffff",
              color: "#1e293b",
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
              marginBottom: "6px",
            }}
          >
            {t("phd.dataSources")}
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
                  color: "#1e293b",
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
                {src === "local_rag" ? t("phd.localRag") : src}
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
                marginBottom: "6px",
              }}
            >
              {t("phd.yearFrom")}
            </label>
            <input
              type="number"
              value={yearFrom}
              onChange={(e) => onYearFromChange(e.target.value)}
              placeholder="2015"
              style={{
                width: "100px",
                padding: "10px 12px",
                borderRadius: "8px",
                border: "1px solid #e2e8f0",
                backgroundColor: "#ffffff",
                color: "#1e293b",
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
                marginBottom: "6px",
              }}
            >
              {t("phd.yearTo")}
            </label>
            <input
              type="number"
              value={yearTo}
              onChange={(e) => onYearToChange(e.target.value)}
              placeholder="2025"
              style={{
                width: "100px",
                padding: "10px 12px",
                borderRadius: "8px",
                border: "1px solid #e2e8f0",
                backgroundColor: "#ffffff",
                color: "#1e293b",
              }}
            />
          </div>
          <div>
            <label
              style={{
                display: "block",
                fontSize: "13px",
                color: "#9ca3af",
                marginBottom: "6px",
              }}
            >
              {t("phd.paperLimit")}
            </label>
            <input
              type="number"
              value={paperLimit}
              onChange={(e) => onPaperLimitChange(e.target.value)}
              style={{
                width: "100px",
                padding: "10px 12px",
                borderRadius: "8px",
                border: "1px solid #e2e8f0",
                backgroundColor: "#ffffff",
                color: "#1e293b",
              }}
            />
          </div>
          <div>
            <label
              style={{
                display: "block",
                fontSize: "13px",
                color: "#9ca3af",
                marginBottom: "6px",
              }}
            >
              {t("phd.sortStrategy")}
            </label>
            <select
              value={sortBy}
              onChange={(e) => onSortByChange(e.target.value)}
              style={{
                width: "140px",
                padding: "10px 12px",
                borderRadius: "8px",
                border: "1px solid #e2e8f0",
                backgroundColor: "#ffffff",
                color: "#1e293b",
              }}
            >
              <option value="year_desc">{t("phd.sortYearDesc")}</option>
              <option value="year_asc">{t("phd.sortYearAsc")}</option>
              <option value="citations_desc">{t("phd.sortCitationsDesc")}</option>
              <option value="random">{t("phd.sortRandom")}</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StepConfigForm;
