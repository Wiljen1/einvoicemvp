import type { SearchResult, SourceQuality } from "@/types/document";
import { getEmbeddingService } from "./embeddingService";
import { isCountrySupportQuestion } from "./entityNormalizationService";
import { ensureActiveDocumentSource } from "./documentIndexRunService";
import {
  getIndexCounts,
  listSearchableChunks,
  type SearchableChunkRecord
} from "./indexDatabaseService";

const MAX_QUERY_TERMS = 12;
const MIN_SCORE = 1;
const MAX_SNIPPET_CHARS = 1800;
const LOW_QUALITY_EXTENSIONS = new Set([".mp4", ".mov"]);
const MEDIUM_QUALITY_EXTENSIONS = new Set([".xlsx", ".xls", ".png", ".jpg", ".jpeg"]);

export async function searchIndexedDocuments(
  question: string,
  options?: { limit?: number }
): Promise<SearchResult[]> {
  const embeddingService = getEmbeddingService();
  if (embeddingService.enabled) {
    return embeddingService.search({ question, documents: [], limit: options?.limit });
  }

  const source = await ensureActiveDocumentSource();
  const chunks = listSearchableChunks(source.id);
  const counts = getIndexCounts(source.id);
  const queryTerms = expandQueryTerms(question, tokenize(question)).slice(0, MAX_QUERY_TERMS);
  const limit = options?.limit || 5;

  if (queryTerms.length === 0 || chunks.length === 0) {
    console.info(
      `[search] activeDocuments=${counts.activeDocuments} excludedDocuments=${counts.chatExcludedDocuments} retrieved=0`
    );
    return [];
  }

  const scoredResults = chunks
    .map((chunk) => {
      const metadata = parseMetadata(chunk.metadataJson);
      const sourceQuality = getSourceQuality(chunk, metadata);
      const qualityWeight = getSourceQualityWeight(sourceQuality);
      const haystack = [
        chunk.fileName,
        chunk.relativePath,
        chunk.extension,
        metadata ? JSON.stringify(metadata) : "",
        chunk.text
      ]
        .join(" ")
        .toLowerCase();
      const score = queryTerms.reduce((total, term) => {
        const exactMatches = countOccurrences(haystack, term);
        const stemMatches =
          term.length > 5 ? countOccurrences(haystack, term.slice(0, Math.max(4, term.length - 2))) : 0;

        return total + exactMatches * 3 + stemMatches;
      }, 0);
      const weightedScore = Math.round(score * qualityWeight * 100) / 100;

      return {
        chunkId: chunk.id,
        documentId: chunk.documentId,
        fileName: chunk.fileName,
        relativePath: chunk.relativePath,
        extension: chunk.extension,
        indexedMode: chunk.indexedMode,
        pageNumber: chunk.pageNumber,
        slideNumber: chunk.slideNumber,
        sheetName: chunk.sheetName,
        metadata,
        sourcePath: chunk.absolutePath,
        snippet: cleanupSnippet(chunk.text),
        chunkIndex: chunk.chunkIndex,
        sourceQuality,
        evidenceDetail: buildEvidenceDetail(chunk, sourceQuality),
        score: weightedScore,
        confidence: estimateConfidence(weightedScore, queryTerms.length)
      };
    })
    .filter((result) => result.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score || b.confidence - a.confidence);
  const results = cleanupSearchResults(scoredResults, limit);

  console.info(
    `[search] activeDocuments=${counts.activeDocuments} excludedDocuments=${counts.chatExcludedDocuments} retrieved=${results.length} top=${results
      .map((result) => `${result.relativePath || result.fileName}:${result.score}:${result.sourceQuality}`)
      .join(", ")}`
  );

  return results;
}

export function estimateIndexedOverallConfidence(results: SearchResult[]): number {
  if (results.length === 0) {
    return 0;
  }

  const best = results[0].confidence;
  const sourceBonus = Math.min(
    0.12,
    new Set(results.map((result) => result.relativePath || result.fileName)).size * 0.04
  );
  const qualityCap = getOverallQualityCap(results);

  return roundConfidence(Math.min(qualityCap, best + sourceBonus));
}

export function cleanupSearchResults(results: SearchResult[], limit: number): SearchResult[] {
  const deduped: SearchResult[] = [];
  const seenSnippets = new Set<string>();

  for (const result of results) {
    const snippetKey = normalizeSnippetKey(result.snippet);
    if (snippetKey && seenSnippets.has(snippetKey)) {
      continue;
    }
    if (snippetKey) {
      seenSnippets.add(snippetKey);
    }

    const adjacent = deduped.find(
      (existing) =>
        existing.documentId &&
        existing.documentId === result.documentId &&
        Math.abs(existing.chunkIndex - result.chunkIndex) === 1 &&
        existing.snippet.length < MAX_SNIPPET_CHARS
    );

    if (adjacent) {
      adjacent.snippet = mergeAdjacentSnippets(adjacent.snippet, result.snippet);
      adjacent.score = Math.max(adjacent.score, result.score);
      adjacent.confidence = Math.max(adjacent.confidence, result.confidence);
      adjacent.sourceQuality = pickHigherQuality(adjacent.sourceQuality, result.sourceQuality);
      continue;
    }

    deduped.push(result);
  }

  const strongerEvidence = deduped.filter((result) => result.sourceQuality !== "LOW");
  const pool = strongerEvidence.length > 0 ? strongerEvidence : deduped;

  return pool.slice(0, limit);
}

export function getSourceQuality(
  chunk: Pick<
    SearchableChunkRecord,
    "extension" | "extractionMode" | "indexedMode" | "metadataJson" | "text"
  >,
  parsedMetadata?: Record<string, unknown>
): SourceQuality {
  const extension = chunk.extension.toLowerCase();
  const metadata = parsedMetadata || parseMetadata(chunk.metadataJson);
  const text = chunk.text.trim();

  if (
    LOW_QUALITY_EXTENSIONS.has(extension) ||
    chunk.extractionMode === "METADATA_ONLY" ||
    chunk.indexedMode === "PARTIAL_METADATA" ||
    isFilenameOnlyMetadata(text)
  ) {
    return "LOW";
  }

  if (
    MEDIUM_QUALITY_EXTENSIONS.has(extension) ||
    chunk.extractionMode === "OCR" ||
    chunk.indexedMode === "OCR_TEXT" ||
    metadata.ocrProcessed === true
  ) {
    return "MEDIUM";
  }

  return "HIGH";
}

function expandQueryTerms(question: string, terms: string[]): string[] {
  if (!isCountrySupportQuestion(question)) {
    return terms;
  }

  return Array.from(
    new Set([...terms, "supported", "countries", "capabilities", "model", "qualifier"])
  );
}

function tokenize(value: string): string[] {
  const stopWords = new Set([
    "about",
    "after",
    "also",
    "and",
    "are",
    "can",
    "for",
    "from",
    "how",
    "into",
    "that",
    "the",
    "this",
    "what",
    "when",
    "where",
    "which",
    "with",
    "should"
  ]);

  return Array.from(
    new Set(
      value
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, " ")
        .split(/\s+/)
        .map((term) => term.trim())
        .filter((term) => term.length > 2 && !stopWords.has(term))
    )
  );
}

function countOccurrences(value: string, term: string): number {
  if (!term) {
    return 0;
  }

  return value.split(term).length - 1;
}

function estimateConfidence(score: number, termCount: number): number {
  const normalized = Math.min(1, score / Math.max(3, termCount * 3));
  return roundConfidence(0.25 + normalized * 0.68);
}

function roundConfidence(value: number): number {
  return Math.round(value * 100) / 100;
}

function parseMetadata(value: string | null): Record<string, unknown> {
  if (!value) {
    return {};
  }

  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function cleanupSnippet(text: string): string {
  return text
    .replace(/\u0000/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeSnippetKey(snippet: string): string {
  return snippet.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 700);
}

function mergeAdjacentSnippets(first: string, second: string): string {
  const merged = `${first.trim()}\n\n[Adjacent context]\n${second.trim()}`;
  return merged.slice(0, MAX_SNIPPET_CHARS);
}

function pickHigherQuality(
  first: SourceQuality | undefined,
  second: SourceQuality | undefined
): SourceQuality {
  const ranked: SourceQuality[] = ["LOW", "MEDIUM", "HIGH"];
  const firstRank = ranked.indexOf(first || "LOW");
  const secondRank = ranked.indexOf(second || "LOW");
  return ranked[Math.max(firstRank, secondRank)];
}

function getSourceQualityWeight(sourceQuality: SourceQuality): number {
  if (sourceQuality === "HIGH") return 1;
  if (sourceQuality === "MEDIUM") return 0.72;
  return 0.35;
}

function getOverallQualityCap(results: SearchResult[]): number {
  if (results.every((result) => result.sourceQuality === "LOW")) {
    return 0.45;
  }

  if (results.every((result) => result.sourceQuality !== "HIGH")) {
    return 0.75;
  }

  return 0.97;
}

function buildEvidenceDetail(
  chunk: SearchableChunkRecord,
  sourceQuality: SourceQuality
): string {
  const extension = chunk.extension.toLowerCase();

  if (extension === ".xlsx" || extension === ".xls") {
    return `Table-derived evidence${chunk.sheetName ? ` from sheet ${chunk.sheetName}` : ""}; verify row context.`;
  }

  if (extension === ".pptx") {
    return `Slide text evidence${chunk.slideNumber ? ` from slide ${chunk.slideNumber}` : ""}.`;
  }

  if (extension === ".pdf") {
    return `PDF text evidence${chunk.pageNumber ? ` from page ${chunk.pageNumber}` : ""}.`;
  }

  if (extension === ".png" || extension === ".jpg" || extension === ".jpeg") {
    return sourceQuality === "MEDIUM"
      ? "Image OCR evidence; verify OCR wording if used for customer-facing guidance."
      : "Image metadata evidence only.";
  }

  if (extension === ".mp4" || extension === ".mov") {
    return "Video metadata evidence only.";
  }

  return sourceQuality === "HIGH" ? "Full text evidence." : "Metadata-derived evidence.";
}

function isFilenameOnlyMetadata(text: string): boolean {
  const normalized = text.toLowerCase();
  return (
    text.length < 180 &&
    (normalized.startsWith("video asset:") ||
      normalized.startsWith("image asset:") ||
      normalized.startsWith("reference link:"))
  );
}
