import React, { useState, useEffect, useMemo } from "react";
import { API_BASE_URL } from "../api/config";
import { useLocale } from "../hooks/useLocale";

/** Parse comma-separated keywords string into array */
function parseKeywords(raw: string): string[] {
  return raw.split(/[,，]/).map((k) => k.trim()).filter((k) => k);
}
import {
  PipelineHeader,
  StepConfigForm,
  FrameworkPreview,
  SearchResultsPanel,
  AsyncPipelineStep,
  ManualSteps,
  AssembleStep,
} from "../components/phd";
import type {
  Claim,
  ClaimWithEvidence,
  Framework,
  AutoSearchResult,
  AssembleStats,
} from "../components/phd";

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
  initialSources = ["arxiv", "crossref", "scholar_serpapi", "scopus", "semantic_scholar", "openalex"],
  initialPaperIds = [],
  initialGroupId,
  onExit,
}) => {
  const { t } = useLocale();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Configuration State — persist to sessionStorage
  const [keywords, setKeywords] = useState<string>(
    () => sessionStorage.getItem("phd_keywords") || initialKeywords.join(", "),
  );
  const [yearFrom, setYearFrom] = useState<string>(
    () => sessionStorage.getItem("phd_yearFrom") || initialYearFrom?.toString() || "",
  );
  const [yearTo, setYearTo] = useState<string>(
    () => sessionStorage.getItem("phd_yearTo") || initialYearTo?.toString() || "",
  );
  const [paperLimit, setPaperLimit] = useState<string>(
    () => sessionStorage.getItem("phd_paperLimit") || initialPaperLimit.toString(),
  );
  const [sortBy, setSortBy] = useState<string>(
    () => sessionStorage.getItem("phd_sortBy") || "year_desc",
  );
  const [sources, setSources] = useState<string[]>(() => {
    const cached = sessionStorage.getItem("phd_sources");
    return cached ? JSON.parse(cached) : initialSources;
  });
  const [paperIds, setPaperIds] = useState<number[]>(initialPaperIds);
  const groupId = initialGroupId;

  // Sync paperIds when parent selection changes
  useEffect(() => {
    setPaperIds(initialPaperIds);
  }, [initialPaperIds]);

  const [claims, setClaims] = useState<Claim[]>([]);
  const [claimsWithEvidence, setClaimsWithEvidence] = useState<
    ClaimWithEvidence[]
  >([]);
  const [finalRender, setFinalRender] = useState<string>("");

  const [reviewId, setReviewId] = useState<number | null>(null);
  const [exportLoading, setExportLoading] = useState(false);

  // Step 0: Framework generation
  const [topic, setTopic] = useState(
    () => sessionStorage.getItem("phd_topic") || "",
  );
  const [framework, setFramework] = useState<Framework | null>(null);
  const [frameworkLoading, setFrameworkLoading] = useState(false);
  const [frameworkConfirmed, setFrameworkConfirmed] = useState(false);

  // Step 0.5: Auto-search state
  const [papersPerSection, setPapersPerSection] = useState(20);
  const [autoSearchLoading, setAutoSearchLoading] = useState(false);
  const [autoSearchResults, setAutoSearchResults] = useState<AutoSearchResult[]>([]);
  const autoSearchDone = autoSearchResults.length > 0;

  // Step 4: Assemble state
  const [assembleLoading, setAssembleLoading] = useState(false);
  const [fullReviewMarkdown, setFullReviewMarkdown] = useState("");
  const [citationStyle, setCitationStyle] = useState("harvard");
  const [assembleStats, setAssembleStats] = useState<AssembleStats | null>(null);

  // Persist config to sessionStorage
  useEffect(() => {
    sessionStorage.setItem("phd_topic", topic);
    sessionStorage.setItem("phd_keywords", keywords);
    sessionStorage.setItem("phd_yearFrom", yearFrom);
    sessionStorage.setItem("phd_yearTo", yearTo);
    sessionStorage.setItem("phd_paperLimit", paperLimit);
    sessionStorage.setItem("phd_sortBy", sortBy);
    sessionStorage.setItem("phd_sources", JSON.stringify(sources));
  }, [topic, keywords, yearFrom, yearTo, paperLimit, sortBy, sources]);

  const handleStep0_GenerateFramework = async () => {
    setFrameworkLoading(true);
    setError(null);
    setFramework(null);
    setFrameworkConfirmed(false);

    try {
      const kws = parseKeywords(keywords);
      const res = await fetch(
        `${API_BASE_URL}/api/reviews/generate-framework`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            topic,
            keywords: kws.length > 0 ? kws : [topic],
            language: "zh-CN",
          }),
        },
      );

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(
          errorText || `Framework generation failed: ${res.status}`,
        );
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
      setError(t("phd.errorNoFramework"));
      return;
    }
    setAutoSearchLoading(true);
    setError(null);
    setAutoSearchResults([]);

    try {
      const res = await fetch(`${API_BASE_URL}/api/reviews/phd/auto-search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAutoSearchLoading(false);
    }
  };

  const handleStep4_Assemble = async () => {
    if (!finalRender && !reviewId) {
      setError(t("phd.errorCompleteRenderFirst"));
      return;
    }
    setAssembleLoading(true);
    setError(null);

    try {
      const renderedSections = finalRender
        ? [
            {
              section_id: "1",
              section_title: framework?.title || "Literature Review",
              text: finalRender,
              citation_map: {},
            },
          ]
        : [];

      const res = await fetch(`${API_BASE_URL}/api/reviews/phd/assemble`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          review_id: reviewId,
          title: framework?.title || topic || "Literature Review",
          rendered_sections: renderedSections,
          citation_style: citationStyle,
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || `Assembly failed: ${res.status}`);
      }

      const data = await res.json();
      setFullReviewMarkdown(data.full_markdown || "");
      setAssembleStats({
        cited: data.total_cited_papers || 0,
        sections: data.total_sections || 0,
      });
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
        keywords: keywords
          .split(/[,，]/)
          .map((k) => k.trim())
          .filter((k) => k),
        data_sources: sources,
        paper_limit: parseInt(paperLimit) || 20,
        year_start: yearFrom ? parseInt(yearFrom) : undefined,
        year_end: yearTo ? parseInt(yearTo) : undefined,
        sort_by: sortBy,
      };

      if (paperIds.length > 0) {
        body.paper_ids = paperIds;
      } else if (groupId) {
        body.group_id = groupId;
      }

      const res = await fetch(`${API_BASE_URL}/api/reviews/phd/init`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
      setError(t("phd.errorNoReviewId"));
      return;
    }
    setLoading(true);
    setError(null);
    setStep(2);

    try {
      const res = await fetch(
        `${API_BASE_URL}/api/reviews/phd/attach-evidence`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ review_id: reviewId }),
        },
      );

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
      setError(t("phd.errorNoReviewId"));
      return;
    }
    setLoading(true);
    setError(null);
    setStep(3);

    try {
      const res = await fetch(
        `${API_BASE_URL}/api/reviews/phd/render-section`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            review_id: reviewId,
            section_key: "introduction",
          }),
        },
      );

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || `Step 3 failed with status ${res.status}`);
      }

      const data = await res.json();
      setFinalRender(data.rendered_section.content);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleExportMarkdown = async () => {
    if (!reviewId) {
      setError(t("phd.errorNoExportableReview"));
      return;
    }
    setExportLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `${API_BASE_URL}/api/reviews/${reviewId}/export`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            format: "markdown",
            include_references: true,
          }),
        },
      );

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || `Export failed: ${res.status}`);
      }

      const data = await res.json();
      const markdown: string = data.markdown;
      const blob = new Blob([markdown], {
        type: "text/markdown;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
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

  const parsedKeywords = useMemo(() => parseKeywords(keywords), [keywords]);

  return (
    <div className="phd-pipeline-page">
      <PipelineHeader reviewId={reviewId} />

      {error && (
        <div className="error-text" style={{ marginBottom: "20px" }}>
          {t("phd.errorLabel")}{error}
        </div>
      )}

      <StepConfigForm
        topic={topic}
        onTopicChange={setTopic}
        keywords={keywords}
        onKeywordsChange={setKeywords}
        sources={sources}
        onSourcesChange={setSources}
        yearFrom={yearFrom}
        onYearFromChange={setYearFrom}
        yearTo={yearTo}
        onYearToChange={setYearTo}
        paperLimit={paperLimit}
        onPaperLimitChange={setPaperLimit}
        sortBy={sortBy}
        onSortByChange={setSortBy}
        groupId={groupId}
      />

      <div className="pipeline-steps-container">
        <FrameworkPreview
          framework={framework}
          frameworkLoading={frameworkLoading}
          frameworkConfirmed={frameworkConfirmed}
          topicEmpty={!topic.trim()}
          onGenerate={handleStep0_GenerateFramework}
          onConfirm={() => setFrameworkConfirmed(true)}
        />

        <SearchResultsPanel
          frameworkConfirmed={frameworkConfirmed}
          papersPerSection={papersPerSection}
          onPapersPerSectionChange={setPapersPerSection}
          autoSearchLoading={autoSearchLoading}
          autoSearchDone={autoSearchDone}
          autoSearchResults={autoSearchResults}
          onAutoSearch={handleStep05_AutoSearch}
        />

        <AsyncPipelineStep
          topic={topic}
          keywords={parsedKeywords}
          papersPerSection={papersPerSection}
          sources={sources}
          citationStyle={citationStyle}
        />

        <ManualSteps
          loading={loading}
          step={step}
          claims={claims}
          claimsWithEvidence={claimsWithEvidence}
          finalRender={finalRender}
          exportLoading={exportLoading}
          onGenerateClaims={handleStep1_GenerateClaims}
          onAttachEvidence={handleStep2_AttachEvidence}
          onRenderSection={handleStep3_RenderSection}
          onExportMarkdown={handleExportMarkdown}
        />
      </div>

      {/* Step 4: Assemble - outside pipeline-steps-container, same as original */}
      <AssembleStep
        citationStyle={citationStyle}
        onCitationStyleChange={setCitationStyle}
        assembleLoading={assembleLoading}
        finalRender={finalRender}
        reviewId={reviewId}
        assembleStats={assembleStats}
        fullReviewMarkdown={fullReviewMarkdown}
        onAssemble={handleStep4_Assemble}
      />

    </div>
  );
};

export default PhdPipelinePage;
