import { describe, expect, it } from "vitest";
import { buildChatPrompt } from "@/services/chatPromptService";
import { cleanupSearchResults } from "@/services/indexedDocumentSearchService";
import type { SearchResult } from "@/types/document";

const guardrails = {
  systemGuardrails: ["Answer only from document context."],
  checkboxDefaults: {
    keepAnswersShort: true,
    includeSources: true,
    includeConfidenceScore: true,
    sayWhenInformationIsMissing: true,
    useBusinessFriendlyLanguage: true
  },
  userGuardrails: ""
};

describe("chatPromptService", () => {
  it("adds country normalization and answer-format guidance for support questions", () => {
    const prompt = buildChatPrompt({
      question: "Which countries are supported for e-invoicing?",
      guardrails,
      contextChunks: [
        buildResult({
          snippet:
            "Supported Countries: Israel, Malaysia, Belgium, Spain Veri*Factu, US DBNA, Denmark PEPPOL, Ger...",
          relativePath: "Country Support.pdf"
        })
      ]
    });

    expect(prompt).toContain("COUNTRY / SUPPORT ANSWER FORMAT:");
    expect(prompt).toContain("COUNTRY / ENTITY NORMALIZATION NOTES:");
    expect(prompt).toContain("Spain - qualifier/source label: VeriFactu");
    expect(prompt).toContain("United States - qualifier/source label: DBNA");
    expect(prompt).toContain("Denmark - qualifier/source label: PEPPOL");
    expect(prompt).not.toContain('raw: "Spain Veri');
    expect(prompt).not.toContain('raw: "US DBNA');
    expect(prompt).toContain("Truncated or unclear entries not included as countries");
    expect(prompt).toContain("Do not present combined labels like \"Spain VeriFactu\" as a country");
    expect(prompt).toContain("Do not repeat raw combined labels");
  });

  it("includes structured source metadata in prompt context", () => {
    const prompt = buildChatPrompt({
      question: "What evidence is available?",
      guardrails,
      contextChunks: [
        buildResult({
          extension: ".pdf",
          indexedMode: "FULL_TEXT",
          pageNumber: 4,
          sourceQuality: "HIGH",
          evidenceDetail: "PDF text evidence from page 4.",
          snippet: "Evidence text."
        })
      ]
    });

    expect(prompt).toContain("Document: Country Support.pdf");
    expect(prompt).toContain("Extension: .pdf");
    expect(prompt).toContain("Extraction mode: FULL_TEXT");
    expect(prompt).toContain("Source quality: HIGH");
    expect(prompt).toContain("Page: 4");
    expect(prompt).toContain("Evidence note: PDF text evidence from page 4.");
  });
});

describe("search result cleanup", () => {
  it("deduplicates repeated chunks and deprioritizes low-quality metadata when better evidence exists", () => {
    const results = cleanupSearchResults(
      [
        buildResult({ snippet: "Country support says Spain VeriFactu.", score: 9, sourceQuality: "HIGH" }),
        buildResult({ snippet: "Country support says Spain VeriFactu.", score: 8, sourceQuality: "HIGH" }),
        buildResult({
          fileName: "demo.mp4",
          relativePath: "Videos/demo.mp4",
          extension: ".mp4",
          snippet: "Video asset: Spain VeriFactu overview",
          score: 20,
          sourceQuality: "LOW"
        })
      ],
      5
    );

    expect(results).toHaveLength(1);
    expect(results[0].relativePath).toBe("Country Support.pdf");
    expect(results[0].sourceQuality).toBe("HIGH");
  });
});

function buildResult(overrides: Partial<SearchResult>): SearchResult {
  return {
    chunkId: "chunk-1",
    documentId: "doc-1",
    fileName: "Country Support.pdf",
    relativePath: "Country Support.pdf",
    extension: ".pdf",
    indexedMode: "FULL_TEXT",
    metadata: {},
    sourcePath: "/documents/Country Support.pdf",
    snippet: "Country support says Spain VeriFactu.",
    chunkIndex: 0,
    score: 6,
    confidence: 0.8,
    sourceQuality: "HIGH",
    evidenceDetail: "PDF text evidence.",
    ...overrides
  };
}
