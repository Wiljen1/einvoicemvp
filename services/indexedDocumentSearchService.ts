import type { SearchResult } from "@/types/document";
import { getEmbeddingService } from "./embeddingService";
import { ensureActiveDocumentSource } from "./documentIndexRunService";
import { listSearchableChunks } from "./indexDatabaseService";

const MAX_QUERY_TERMS = 12;
const MIN_SCORE = 1;

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
  const queryTerms = tokenize(question).slice(0, MAX_QUERY_TERMS);
  const limit = options?.limit || 5;

  if (queryTerms.length === 0 || chunks.length === 0) {
    return [];
  }

  return chunks
    .map((chunk) => {
      const metadata = parseMetadata(chunk.metadataJson);
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

      return {
        chunkId: chunk.id,
        documentId: chunk.documentId,
        fileName: chunk.fileName,
        relativePath: chunk.relativePath,
        metadata,
        sourcePath: chunk.absolutePath,
        snippet: chunk.text,
        chunkIndex: chunk.chunkIndex,
        score,
        confidence: estimateConfidence(score, queryTerms.length)
      };
    })
    .filter((result) => result.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score || b.confidence - a.confidence)
    .slice(0, limit);
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

  return roundConfidence(Math.min(0.97, best + sourceBonus));
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
