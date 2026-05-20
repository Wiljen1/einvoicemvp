import type { ChatAnswer } from "@/types/chat";
import type { SearchResult, SourceReference } from "@/types/document";
import type { IndexStatus } from "./documentIndexRunService";
import {
  addChatMessage,
  createChatSession,
  listDocumentsBySource,
  saveQuestionAnswerLog,
  updateChatSessionSource,
  type ConfidenceLevel,
  type QuestionAnswerLogRecord
} from "./indexDatabaseService";
import {
  findSimilarQuestions,
  hashNormalizedQuestion,
  normalizeQuestion,
  type SimilarQuestionMatch
} from "./questionSimilarityService";

export interface ReusableAnswer {
  answer: ChatAnswer;
  match: SimilarQuestionMatch;
}

export interface QuestionAnswerLogInput {
  sessionId?: string | null;
  sourceId?: string | null;
  question: string;
  answer: ChatAnswer;
  responseTimeMs?: number | null;
  codexUsed: boolean;
  cacheHit: boolean;
  answerSource: "INDEXED_DOCUMENTS" | "PREVIOUS_SIMILAR_QUESTION" | "CACHE" | "REFUSAL";
  reusedFromLogId?: string | null;
  similarityScore?: number | null;
  indexStatus?: IndexStatus | null;
  retrievedChunks?: SearchResult[];
}

export function isChatHistoryLoggingEnabled(): boolean {
  return process.env.LOG_CHAT_HISTORY !== "false";
}

export function beginPersistedChatSession(sessionId: string, question: string): void {
  if (!isChatHistoryLoggingEnabled()) {
    return;
  }

  createChatSession({
    id: sessionId,
    title: question.slice(0, 120)
  });
  addChatMessage({
    sessionId,
    role: "USER",
    content: question
  });
}

export function attachChatSessionSource(sessionId: string, sourceId: string | null): void {
  if (!isChatHistoryLoggingEnabled()) {
    return;
  }

  updateChatSessionSource(sessionId, sourceId);
}

export function findReusableAnswer(input: {
  question: string;
  indexStatus: IndexStatus;
  forceFresh?: boolean;
}): ReusableAnswer | null {
  if (!isChatHistoryLoggingEnabled() || input.forceFresh) {
    return null;
  }

  const matches = findSimilarQuestions(input.question, {
    sourceId: input.indexStatus.source.id,
    minScore: 0.9,
    limit: 250
  });
  const reusable = matches.find((match) => isSafeToReuse(match, input.indexStatus));

  if (!reusable) {
    return null;
  }

  return {
    match: reusable,
    answer: {
      answer: reusable.previousAnswer,
      confidence: reusable.previousConfidence ?? 0,
      sources: reusable.previousSources,
      engine: "codex",
      fromCache: true,
      answerSource: "PREVIOUS_SIMILAR_QUESTION",
      similarityScore: reusable.similarityScore,
      reusedFromQuestionId: reusable.log.id,
      warning: `Answered from a previous similar question (${Math.round(
        reusable.similarityScore * 100
      )}% similar).`
    }
  };
}

export function findPossibleSimilarQuestion(input: {
  question: string;
  indexStatus: IndexStatus;
}): SimilarQuestionMatch | null {
  if (!isChatHistoryLoggingEnabled()) {
    return null;
  }

  return (
    findSimilarQuestions(input.question, {
      sourceId: input.indexStatus.source.id,
      minScore: 0.75,
      limit: 250
    }).find((match) => match.similarityScore < 0.9 && isSafeToReuse(match, input.indexStatus)) || null
  );
}

export function persistAssistantAnswer(input: QuestionAnswerLogInput): QuestionAnswerLogRecord | null {
  if (!isChatHistoryLoggingEnabled()) {
    return null;
  }

  if (input.sessionId) {
    addChatMessage({
      sessionId: input.sessionId,
      role: "ASSISTANT",
      content: input.answer.answer
    });
  }

  const normalizedQuestion = normalizeQuestion(input.question);
  return saveQuestionAnswerLog({
    sessionId: input.sessionId || null,
    sourceId: input.sourceId || input.indexStatus?.source.id || null,
    question: input.question,
    normalizedQuestion,
    questionHash: hashNormalizedQuestion(normalizedQuestion),
    answer: input.answer.answer,
    confidenceScore: input.answer.confidence,
    confidenceLevel: getConfidenceLevel(input.answer.confidence),
    sourcesJson: JSON.stringify(input.answer.sources || []),
    retrievedChunkIdsJson: JSON.stringify(
      (input.retrievedChunks || []).map((chunk) => ({
        chunkId: chunk.chunkId,
        documentId: chunk.documentId,
        relativePath: chunk.relativePath
      }))
    ),
    responseTimeMs: input.responseTimeMs ?? null,
    codexUsed: input.codexUsed,
    cacheHit: input.cacheHit,
    answerSource: input.answerSource,
    reusedFromLogId: input.reusedFromLogId || null,
    similarityScore: input.similarityScore ?? null,
    indexSnapshotAt: input.indexStatus?.index.lastIndexedAt || null,
    indexRunId: input.indexStatus?.index.lastRun?.id || null,
    sourceLastIndexedAt: input.indexStatus?.source.lastScannedAt || input.indexStatus?.index.lastIndexedAt || null
  });
}

function isSafeToReuse(match: SimilarQuestionMatch, indexStatus: IndexStatus): boolean {
  if (match.log.sourceId !== indexStatus.source.id) {
    return false;
  }

  if ((match.log.confidenceLevel || getConfidenceLevel(match.log.confidenceScore || 0)) === "Low") {
    return false;
  }

  const currentIndexedAt = indexStatus.source.lastScannedAt || indexStatus.index.lastIndexedAt;
  if (!match.log.sourceLastIndexedAt || !currentIndexedAt || currentIndexedAt > match.log.sourceLastIndexedAt) {
    return false;
  }

  return sourcesStillActive(indexStatus.source.id, match.previousSources);
}

function sourcesStillActive(sourceId: string, sources: SourceReference[]): boolean {
  if (sources.length === 0) {
    return false;
  }

  const activeDocuments = new Map(
    listDocumentsBySource(sourceId)
      .filter(
        (document) =>
          document.isMissing === 0 &&
          document.excludedFromChat === 0 &&
          ["INDEXED", "PARTIAL"].includes(document.extractionStatus)
      )
      .map((document) => [document.relativePath || document.fileName, document])
  );

  return sources.every((source) => activeDocuments.has(source.relativePath || source.fileName));
}

function getConfidenceLevel(confidence: number): ConfidenceLevel {
  if (confidence >= 0.75) {
    return "High";
  }

  if (confidence >= 0.5) {
    return "Medium";
  }

  return "Low";
}
