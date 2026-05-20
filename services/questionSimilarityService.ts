import crypto from "node:crypto";
import {
  listQuestionAnswerLogsForSimilarity,
  type QuestionAnswerLogRecord
} from "./indexDatabaseService";
import type { SourceReference } from "@/types/document";

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "can",
  "do",
  "does",
  "for",
  "from",
  "how",
  "i",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "should",
  "that",
  "the",
  "to",
  "what",
  "when",
  "where",
  "which",
  "with"
]);

export type SimilarityBand = "EXACT" | "HIGH" | "POSSIBLE";

export interface SimilarQuestionMatch {
  log: QuestionAnswerLogRecord;
  similarityScore: number;
  band: SimilarityBand;
  previousAnswer: string;
  previousSources: SourceReference[];
  previousConfidence: number | null;
  createdAt: string;
}

export function normalizeQuestion(question: string): string {
  return question
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function hashNormalizedQuestion(normalizedQuestion: string): string {
  return crypto.createHash("sha256").update(normalizedQuestion).digest("hex");
}

export function findSimilarQuestions(
  question: string,
  options: {
    sourceId: string;
    limit?: number;
    minScore?: number;
  }
): SimilarQuestionMatch[] {
  const normalizedQuestion = normalizeQuestion(question);
  const priorLogs = listQuestionAnswerLogsForSimilarity({
    sourceId: options.sourceId,
    limit: options.limit
  });
  const minScore = options.minScore ?? 0.75;

  return priorLogs
    .map((log) => {
      const similarityScore = scoreQuestionSimilarity(
        normalizedQuestion,
        log.normalizedQuestion || normalizeQuestion(log.question)
      );

      return {
        log,
        similarityScore,
        band: getSimilarityBand(similarityScore),
        previousAnswer: log.answer,
        previousSources: parseSources(log.sourcesJson),
        previousConfidence: log.confidenceScore,
        createdAt: log.createdAt
      };
    })
    .filter((match): match is SimilarQuestionMatch => Boolean(match.band) && match.similarityScore >= minScore)
    .sort((a, b) => b.similarityScore - a.similarityScore || b.createdAt.localeCompare(a.createdAt));
}

export function scoreQuestionSimilarity(left: string, right: string): number {
  if (!left || !right) {
    return 0;
  }

  if (left === right) {
    return 1;
  }

  const leftTokens = tokenize(left);
  const rightTokens = tokenize(right);
  const tokenScore = jaccardSimilarity(leftTokens, rightTokens);
  const tokenContainmentScore = tokenContainment(leftTokens, rightTokens);
  const bigramScore = diceCoefficient(toBigrams(left), toBigrams(right));
  const containmentScore =
    left.includes(right) || right.includes(left)
      ? Math.min(left.length, right.length) / Math.max(left.length, right.length)
      : 0;

  return roundScore(
    Math.max(tokenScore * 0.68 + bigramScore * 0.32, tokenContainmentScore, containmentScore * 0.9)
  );
}

function getSimilarityBand(score: number): SimilarityBand | null {
  if (score === 1) {
    return "EXACT";
  }

  if (score >= 0.9) {
    return "HIGH";
  }

  if (score >= 0.75) {
    return "POSSIBLE";
  }

  return null;
}

function tokenize(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/\s+/)
        .map((token) => token.trim())
        .filter((token) => token.length > 1 && !STOP_WORDS.has(token))
    )
  );
}

function jaccardSimilarity(left: string[], right: string[]): number {
  if (left.length === 0 || right.length === 0) {
    return 0;
  }

  const rightSet = new Set(right);
  const intersection = left.filter((token) => rightSet.has(token)).length;
  const union = new Set([...left, ...right]).size;
  return union === 0 ? 0 : intersection / union;
}

function tokenContainment(left: string[], right: string[]): number {
  const shorter = left.length <= right.length ? left : right;
  const longer = left.length <= right.length ? right : left;

  if (shorter.length < 2) {
    return 0;
  }

  const longerSet = new Set(longer);
  const contained = shorter.filter((token) => longerSet.has(token)).length;

  return contained === shorter.length ? 0.92 : contained / shorter.length;
}

function toBigrams(value: string): string[] {
  const compact = value.replace(/\s+/g, " ");
  if (compact.length < 2) {
    return compact ? [compact] : [];
  }

  const bigrams: string[] = [];
  for (let index = 0; index < compact.length - 1; index += 1) {
    bigrams.push(compact.slice(index, index + 2));
  }

  return bigrams;
}

function diceCoefficient(left: string[], right: string[]): number {
  if (left.length === 0 || right.length === 0) {
    return 0;
  }

  const rightCounts = new Map<string, number>();
  for (const item of right) {
    rightCounts.set(item, (rightCounts.get(item) || 0) + 1);
  }

  let overlap = 0;
  for (const item of left) {
    const count = rightCounts.get(item) || 0;
    if (count > 0) {
      overlap += 1;
      rightCounts.set(item, count - 1);
    }
  }

  return (2 * overlap) / (left.length + right.length);
}

function parseSources(value: string | null): SourceReference[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as SourceReference[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function roundScore(value: number): number {
  return Math.round(Math.max(0, Math.min(1, value)) * 100) / 100;
}
