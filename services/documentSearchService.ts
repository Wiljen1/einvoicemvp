import type { ApprovedDocument, SearchResult } from "@/types/document";

const CHUNK_SIZE = 900;
const CHUNK_OVERLAP = 120;
const MAX_QUERY_TERMS = 12;
const MIN_SCORE = 1;

export function searchDocuments(
  question: string,
  documents: ApprovedDocument[],
  options?: { limit?: number }
): SearchResult[] {
  const limit = options?.limit || 5;
  const queryTerms = tokenize(question).slice(0, MAX_QUERY_TERMS);

  if (queryTerms.length === 0 || documents.length === 0) {
    return [];
  }

  const chunks = documents.flatMap(chunkDocument);
  const scored = chunks
    .map((chunk) => {
      const haystack = `${chunk.relativePath || chunk.fileName} ${chunk.snippet}`.toLowerCase();
      const score = queryTerms.reduce((total, term) => {
        const exactMatches = countOccurrences(haystack, term);
        const stemMatches =
          term.length > 5 ? countOccurrences(haystack, term.slice(0, Math.max(4, term.length - 2))) : 0;

        return total + exactMatches * 3 + stemMatches;
      }, 0);

      return {
        ...chunk,
        score,
        confidence: estimateConfidence(score, queryTerms.length)
      };
    })
    .filter((result) => result.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score || b.confidence - a.confidence);

  return scored.slice(0, limit);
}

export function estimateOverallConfidence(results: SearchResult[]): number {
  if (results.length === 0) {
    return 0;
  }

  const best = results[0].confidence;
  const sourceBonus = Math.min(
    0.12,
    new Set(results.map((result) => result.relativePath || result.fileName)).size * 0.04
  );

  return roundConfidence(Math.min(0.97, best + sourceBonus));
}

function chunkDocument(document: ApprovedDocument): SearchResult[] {
  const normalized = document.content.replace(/\s+/g, " ").trim();
  const chunks: SearchResult[] = [];

  for (let start = 0; start < normalized.length; start += CHUNK_SIZE - CHUNK_OVERLAP) {
    const snippet = normalized.slice(start, start + CHUNK_SIZE).trim();
    if (!snippet) {
      continue;
    }

    chunks.push({
      fileName: document.fileName,
      relativePath: document.relativePath,
      metadata: document.metadata,
      sourcePath: document.sourcePath,
      webUrl: document.webUrl,
      snippet,
      chunkIndex: chunks.length,
      score: 0,
      confidence: 0
    });
  }

  return chunks;
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
