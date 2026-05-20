import {
  listDocumentSources,
  listQuestionAnswerLogs,
  type QuestionAnswerLogRecord
} from "./indexDatabaseService";
import { normalizeQuestion, scoreQuestionSimilarity } from "./questionSimilarityService";

export interface AdminAnalytics {
  totalQuestions: number;
  questionsToday: number;
  questionsThisWeek: number;
  averageResponseTimeMs: number | null;
  cacheHitRate: number;
  confidenceDistribution: Record<"High" | "Medium" | "Low" | "Unknown", number>;
  mostAskedQuestions: Array<{ question: string; count: number }>;
  similarQuestionClusters: Array<{ label: string; count: number; questions: string[] }>;
  topReferencedDocuments: Array<{ source: string; count: number }>;
  unansweredOrLowConfidence: Array<{
    id: string;
    question: string;
    confidenceScore: number | null;
    createdAt: string;
  }>;
  questionsOverTime: Array<{ date: string; count: number }>;
}

export function getAdminAnalytics(): AdminAnalytics {
  const logs = listQuestionAnswerLogs({ limit: 500 });
  const now = Date.now();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const responseTimes = logs
    .map((log) => log.responseTimeMs)
    .filter((value): value is number => typeof value === "number");
  const cacheHits = logs.filter((log) => log.cacheHit === 1).length;

  return {
    totalQuestions: logs.length,
    questionsToday: logs.filter((log) => new Date(log.createdAt).getTime() >= todayStart.getTime()).length,
    questionsThisWeek: logs.filter((log) => new Date(log.createdAt).getTime() >= weekAgo).length,
    averageResponseTimeMs: responseTimes.length
      ? Math.round(responseTimes.reduce((total, value) => total + value, 0) / responseTimes.length)
      : null,
    cacheHitRate: logs.length ? Math.round((cacheHits / logs.length) * 100) / 100 : 0,
    confidenceDistribution: buildConfidenceDistribution(logs),
    mostAskedQuestions: buildMostAskedQuestions(logs),
    similarQuestionClusters: buildSimilarQuestionClusters(logs),
    topReferencedDocuments: buildTopReferencedDocuments(logs),
    unansweredOrLowConfidence: logs
      .filter((log) => (log.confidenceScore ?? 0) < 0.5)
      .slice(0, 25)
      .map((log) => ({
        id: log.id,
        question: log.question,
        confidenceScore: log.confidenceScore,
        createdAt: log.createdAt
      })),
    questionsOverTime: buildQuestionsOverTime(logs)
  };
}

export function getSourceDisplayName(sourceId: string | null): string {
  if (!sourceId) {
    return "No source";
  }

  return listDocumentSources().find((source) => source.id === sourceId)?.displayName || "Unknown source";
}

function buildConfidenceDistribution(
  logs: QuestionAnswerLogRecord[]
): Record<"High" | "Medium" | "Low" | "Unknown", number> {
  return logs.reduce(
    (counts, log) => {
      const level = log.confidenceLevel || "Unknown";
      counts[level] += 1;
      return counts;
    },
    { High: 0, Medium: 0, Low: 0, Unknown: 0 }
  );
}

function buildMostAskedQuestions(logs: QuestionAnswerLogRecord[]): Array<{ question: string; count: number }> {
  const counts = new Map<string, { question: string; count: number }>();

  for (const log of logs) {
    const key = log.normalizedQuestion || normalizeQuestion(log.question);
    const existing = counts.get(key);
    counts.set(key, {
      question: existing?.question || log.question,
      count: (existing?.count || 0) + 1
    });
  }

  return Array.from(counts.values())
    .sort((a, b) => b.count - a.count || a.question.localeCompare(b.question))
    .slice(0, 10);
}

function buildSimilarQuestionClusters(logs: QuestionAnswerLogRecord[]): Array<{
  label: string;
  count: number;
  questions: string[];
}> {
  const clusters: Array<{ label: string; normalized: string; questions: string[] }> = [];

  for (const log of [...logs].reverse()) {
    const normalized = log.normalizedQuestion || normalizeQuestion(log.question);
    const cluster = clusters.find(
      (candidate) => scoreQuestionSimilarity(normalized, candidate.normalized) >= 0.75
    );

    if (cluster) {
      if (!cluster.questions.includes(log.question)) {
        cluster.questions.push(log.question);
      }
    } else {
      clusters.push({
        label: log.question,
        normalized,
        questions: [log.question]
      });
    }
  }

  return clusters
    .map((cluster) => ({
      label: cluster.label,
      count: logs.filter(
        (log) => scoreQuestionSimilarity(log.normalizedQuestion || normalizeQuestion(log.question), cluster.normalized) >= 0.75
      ).length,
      questions: cluster.questions.slice(0, 6)
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

function buildTopReferencedDocuments(logs: QuestionAnswerLogRecord[]): Array<{ source: string; count: number }> {
  const counts = new Map<string, number>();

  for (const log of logs) {
    for (const source of parseSources(log.sourcesJson)) {
      const label = source.relativePath || source.fileName;
      if (label) {
        counts.set(label, (counts.get(label) || 0) + 1);
      }
    }
  }

  return Array.from(counts.entries())
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count || a.source.localeCompare(b.source))
    .slice(0, 10);
}

function buildQuestionsOverTime(logs: QuestionAnswerLogRecord[]): Array<{ date: string; count: number }> {
  const counts = new Map<string, number>();

  for (const log of logs) {
    const date = log.createdAt.slice(0, 10);
    counts.set(date, (counts.get(date) || 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-14);
}

function parseSources(value: string | null): Array<{ fileName: string; relativePath?: string }> {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as Array<{ fileName: string; relativePath?: string }>;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
