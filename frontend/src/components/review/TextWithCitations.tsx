import type { PaperInfo } from "../../types/paper";
import CitationTooltip, { CITATION_REGEX } from "./CitationTooltip";

export default function TextWithCitations({
  text,
  paperMap,
  citationMap,
}: {
  text: string;
  paperMap: Record<number, PaperInfo>;
  citationMap: Record<string, number>;
}) {
  const parts: (string | { citation: string; paperId?: number })[] = [];
  let lastIndex = 0;
  CITATION_REGEX.lastIndex = 0;
  let match;
  while ((match = CITATION_REGEX.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    const fullMatch = match[0];
    const innerText = match[1];
    const paperId = citationMap[fullMatch] || citationMap[`(${innerText})`];
    parts.push({ citation: innerText, paperId });
    lastIndex = match.index + fullMatch.length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));

  return (
    <>
      {parts.map((part, idx) => {
        if (typeof part === "string") return <span key={idx}>{part}</span>;
        const info = part.paperId ? paperMap[part.paperId] : undefined;
        return (
          <CitationTooltip
            key={idx}
            citationText={part.citation}
            paperInfo={info}
          />
        );
      })}
    </>
  );
}
