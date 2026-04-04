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
  ClaimEvidence,
  ClaimWithEvidence,
  SectionClaimTable,
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
  initialSources = ["crossref", "scholar_serpapi", "scopus", "semantic_scholar", "openalex"],
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

  // 核心数据：后端 SectionClaimTable，贯穿 Step 1→2→3
  const [sectionClaimTable, setSectionClaimTable] = useState<SectionClaimTable | null>(null);
  const [renderedSections, setRenderedSections] = useState<Array<{
    section_id: string;
    section_title: string;
    text: string;
    citation_map: Record<string, unknown>;
  }>>([]);

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
      const sectionsToAssemble = renderedSections.length > 0
        ? renderedSections
        : finalRender
          ? [{ section_id: "1", section_title: framework?.title || "Literature Review", text: finalRender, citation_map: {} }]
          : [];

      const res = await fetch(`${API_BASE_URL}/api/reviews/phd/assemble`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          review_id: reviewId,
          title: framework?.title || topic || "Literature Review",
          rendered_sections: sectionsToAssemble,
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

      // 后端返回 ClaimEvidence[]，构建 SectionClaimTable
      const backendClaims: ClaimEvidence[] = data.claims || [];
      const table: SectionClaimTable = {
        section_id: "1",
        section_title: framework?.title || topic || "Literature Review",
        claims: backendClaims,
      };
      setSectionClaimTable(table);

      // 同时映射为前端展示用的简化 Claim
      setClaims(
        backendClaims.map((c: ClaimEvidence) => ({
          id: c.claim_id,
          text: c.text,
          topic: c.section_title || "",
          sub_topic: c.rag_query || "",
        })),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleStep2_AttachEvidence = async () => {
    if (!reviewId || !sectionClaimTable) {
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
          body: JSON.stringify({
            section_claim_table: sectionClaimTable,
            top_k: 5,
          }),
        },
      );

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || `Step 2 failed with status ${res.status}`);
      }

      const data = await res.json();
      // 更新 sectionClaimTable（现在 claims 里有 support_papers 了）
      const updatedTable: SectionClaimTable = data.section_claim_table;
      setSectionClaimTable(updatedTable);

      // 映射为前端展示用的 ClaimWithEvidence
      setClaimsWithEvidence(
        updatedTable.claims.map((c: ClaimEvidence) => ({
          id: c.claim_id,
          text: c.text,
          topic: c.section_title || updatedTable.section_title || "",
          sub_topic: c.rag_query || "",
          evidence: (c.support_papers || []).map((pid: number) => ({
            id: pid,
            title: `Paper #${pid}`,
          })),
          support_snippets: c.support_snippets || [],
        })),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleStep3_RenderSection = async () => {
    if (!reviewId || !sectionClaimTable) {
      setError(t("phd.errorNoReviewId"));
      return;
    }
    setLoading(true);
    setError(null);
    setStep(3);

    try {
      // 按 section 分组 claims（如果 framework 有多个 section）
      const sections = framework?.sections || [];
      const claimsBySectionId: Record<string, ClaimEvidence[]> = {};

      for (const claim of sectionClaimTable.claims) {
        const sid = claim.section_id || "1";
        if (!claimsBySectionId[sid]) claimsBySectionId[sid] = [];
        claimsBySectionId[sid].push(claim);
      }

      // 如果没有 section 分组信息，就整体作为一个 section 渲染
      const sectionKeys = Object.keys(claimsBySectionId);
      if (sectionKeys.length === 0) {
        sectionKeys.push("1");
        claimsBySectionId["1"] = sectionClaimTable.claims;
      }

      const allRendered: typeof renderedSections = [];
      const allTexts: string[] = [];
      let citationIdx = 1;
      let prevSummary = "";

      // 判断最后一个 section 是否是讨论/结论类
      const isDiscussionSection = (title: string) =>
        /讨论|总结|结论|展望|discussion|conclusion|future|summary/i.test(title);

      for (let i = 0; i < sectionKeys.length; i++) {
        const sid = sectionKeys[i];
        const sectionClaims = claimsBySectionId[sid] || [];
        if (sectionClaims.length === 0) continue;

        const sectionInfo = sections.find((s) => s.id === sid);
        const sectionTitle = sectionInfo?.title || sectionClaims[0]?.section_title || `Section ${i + 1}`;

        const miniTable: SectionClaimTable = {
          section_id: sid,
          section_title: sectionTitle,
          claims: sectionClaims,
        };

        // 构建上下文
        const isLast = i === sectionKeys.length - 1;
        const isDiscussion = isDiscussionSection(sectionTitle);

        // 讨论/结论章节：传全文摘要
        const allSectionsSummary = (isDiscussion || isLast) && allTexts.length > 0
          ? allRendered.map((r) => `【${r.section_title}】${r.text.slice(0, 300)}...`).join("\n\n")
          : undefined;

        const res = await fetch(
          `${API_BASE_URL}/api/reviews/phd/render-section`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              review_id: reviewId,
              section_claim_table: miniTable,
              language: "zh-CN",
              citation_start_index: citationIdx,
              previous_sections_summary: prevSummary || undefined,
              all_sections_summary: allSectionsSummary,
            }),
          },
        );

        if (!res.ok) {
          const errorText = await res.text();
          throw new Error(errorText || `Render section ${sid} failed: ${res.status}`);
        }

        const data = await res.json();
        const rendered = data.rendered_section;
        const sectionText = rendered.text || "";

        allRendered.push({
          section_id: sid,
          section_title: sectionTitle,
          text: sectionText,
          citation_map: rendered.citation_map || {},
        });
        allTexts.push(`## ${sectionTitle}\n\n${sectionText}`);

        // 更新上下文：取当前章节前 200 字作为下一章的前文摘要
        prevSummary += `【${sectionTitle}】${sectionText.slice(0, 200)}...\n`;

        // 累加 citation index
        const citationCount = Object.keys(rendered.citation_map || {}).length;
        citationIdx += citationCount;
      }

      setRenderedSections(allRendered);
      setFinalRender(allTexts.join("\n\n---\n\n"));
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
