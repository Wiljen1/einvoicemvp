import crypto from "node:crypto";
import {
  attachChatSessionSource,
  beginPersistedChatSession,
  findPossibleSimilarQuestion,
  findReusableAnswer,
  persistAssistantAnswer
} from "./answerReuseService";
import { buildChatPrompt } from "./chatPromptService";
import { getCachedChatAnswer, buildChatCacheKey, saveCachedChatAnswer } from "./chatCacheService";
import {
  checkCodexStatus,
  CodexOperatorCancelledError,
  executeCodexPrompt,
  stopCurrentCodexOperator
} from "./codexService";
import { fallbackMessage, loadGuardrails } from "./guardrailsService";
import { getActiveIndexStatus } from "./documentIndexRunService";
import {
  estimateIndexedOverallConfidence,
  searchIndexedDocuments
} from "./indexedDocumentSearchService";
import type { ChatAnswer, ChatSessionStatus } from "@/types/chat";

const sessions = getSessionStore();
const TERMINAL_STATUSES = new Set(["COMPLETED", "FAILED", "CANCELLED"]);
const noReadableDocumentsMessage =
  "No documents are indexed yet. Please run Scan / Update Document Index first.";

interface InternalChatSession extends ChatSessionStatus {
  question: string;
  forceFresh: boolean;
  cancelled: boolean;
  createdAt: number;
  updatedAt: number;
}

declare global {
  var __knowledgeAssistantChatSessions: Map<string, InternalChatSession> | undefined;
}

export function startChatSession(question: string, options?: { forceFresh?: boolean }): ChatSessionStatus {
  const sessionId = crypto.randomUUID();
  const session: InternalChatSession = {
    sessionId,
    question,
    forceFresh: options?.forceFresh || false,
    cancelled: false,
    status: "RUNNING",
    progress: 2,
    step: "Queued",
    answer: null,
    confidence: null,
    sources: [],
    error: null,
    updatedAt: Date.now(),
    createdAt: Date.now()
  };

  sessions.set(sessionId, session);
  beginPersistedChatSession(sessionId, question);
  void runChatPipeline(session);

  return toPublicStatus(session);
}

export function getChatSessionStatus(sessionId: string): ChatSessionStatus | null {
  const session = sessions.get(sessionId);
  return session ? toPublicStatus(session) : null;
}

export function cancelChatSession(sessionId: string): ChatSessionStatus | null {
  const session = sessions.get(sessionId);

  if (!session) {
    return null;
  }

  session.cancelled = true;
  session.status = "CANCELLED";
  session.step = "Request cancelled";
  session.error = "Request cancelled";
  session.updatedAt = Date.now();
  stopCurrentCodexOperator(sessionId);

  return toPublicStatus(session);
}

async function runChatPipeline(session: InternalChatSession): Promise<void> {
  const startedAt = Date.now();
  try {
    updateSession(session, 8, "Checking Codex");
    const codex = await checkCodexStatus();
    ensureNotCancelled(session);

    if (!codex.available) {
      throw new Error(codex.setupInstructions || "Codex is not available.");
    }

    updateSession(session, 20, "Checking document index");
    const indexStatus = await getActiveIndexStatus({ checkForUpdates: false });
    attachChatSessionSource(session.sessionId, indexStatus.source.id);
    ensureNotCancelled(session);

    if (indexStatus.index.activeDocuments === 0 || indexStatus.index.activeChunks === 0) {
      const answer: ChatAnswer = {
        answer: noReadableDocumentsMessage,
        confidence: 0,
        sources: [],
        engine: codex.executionMode === "placeholder" ? "codex-placeholder" : "codex",
        answerSource: "REFUSAL"
      };
      persistAssistantAnswer({
        sessionId: session.sessionId,
        sourceId: indexStatus.source.id,
        question: session.question,
        answer,
        responseTimeMs: Date.now() - startedAt,
        codexUsed: false,
        cacheHit: false,
        answerSource: "REFUSAL",
        indexStatus
      });
      completeSession(session, answer);
      return;
    }

    updateSession(session, 32, "Loading guardrails");
    const guardrails = await loadGuardrails();
    ensureNotCancelled(session);

    const reusableAnswer = findReusableAnswer({
      question: session.question,
      indexStatus,
      forceFresh: session.forceFresh
    });
    if (reusableAnswer) {
      persistAssistantAnswer({
        sessionId: session.sessionId,
        sourceId: indexStatus.source.id,
        question: session.question,
        answer: reusableAnswer.answer,
        responseTimeMs: Date.now() - startedAt,
        codexUsed: false,
        cacheHit: true,
        answerSource: "PREVIOUS_SIMILAR_QUESTION",
        reusedFromLogId: reusableAnswer.match.log.id,
        similarityScore: reusableAnswer.match.similarityScore,
        indexStatus
      });
      completeSession(session, reusableAnswer.answer, "Answered from previous similar question");
      return;
    }

    const possibleSimilar = findPossibleSimilarQuestion({
      question: session.question,
      indexStatus
    });

    updateSession(session, 45, "Searching indexed documents");
    const contextChunks = await searchIndexedDocuments(session.question, { limit: 5 });
    console.info(
      `[chat:${session.sessionId}] search completed chunks=${contextChunks.length} elapsedMs=${Date.now() - startedAt}`
    );
    ensureNotCancelled(session);

    if (contextChunks.length === 0) {
      const answer: ChatAnswer = {
        answer: fallbackMessage,
        confidence: 0,
        sources: [],
        engine: codex.executionMode === "placeholder" ? "codex-placeholder" : "codex",
        answerSource: "REFUSAL",
        warning: possibleSimilar
          ? buildPossibleSimilarWarning(possibleSimilar.similarityScore)
          : undefined
      };
      persistAssistantAnswer({
        sessionId: session.sessionId,
        sourceId: indexStatus.source.id,
        question: session.question,
        answer,
        responseTimeMs: Date.now() - startedAt,
        codexUsed: false,
        cacheHit: false,
        answerSource: "REFUSAL",
        indexStatus,
        retrievedChunks: contextChunks
      });
      completeSession(session, answer);
      return;
    }

    updateSession(session, 58, "Preparing prompt");
    const cacheKey = buildChatCacheKey({
      question: session.question,
      guardrails,
      contextChunks,
      folderIdentifier: [
        indexStatus.source.type,
        indexStatus.source.rootPath,
        indexStatus.index.lastIndexedAt || "not-indexed"
      ].join(":")
    });
    const cachedAnswer = await getCachedChatAnswer(cacheKey);
    ensureNotCancelled(session);

    if (cachedAnswer) {
      const cachedWithMetadata: ChatAnswer = {
        ...cachedAnswer,
        answerSource: "CACHE",
        warning:
          cachedAnswer.warning || possibleSimilar
            ? [cachedAnswer.warning, possibleSimilar ? buildPossibleSimilarWarning(possibleSimilar.similarityScore) : ""]
                .filter(Boolean)
                .join(" ")
            : undefined
      };
      persistAssistantAnswer({
        sessionId: session.sessionId,
        sourceId: indexStatus.source.id,
        question: session.question,
        answer: cachedWithMetadata,
        responseTimeMs: Date.now() - startedAt,
        codexUsed: false,
        cacheHit: true,
        answerSource: "CACHE",
        indexStatus,
        retrievedChunks: contextChunks
      });
      completeSession(session, cachedWithMetadata, "Loaded from cache");
      return;
    }

    const prompt = buildChatPrompt({
      question: session.question,
      guardrails,
      contextChunks
    });

    updateSession(session, 72, "Running local Codex");
    console.info(`[chat:${session.sessionId}] codex started chunks=${contextChunks.length}`);
    const codexResult = await executeCodexPrompt({
      prompt,
      question: session.question,
      contextChunks,
      guardrails,
      sessionId: session.sessionId
    });
    console.info(
      `[chat:${session.sessionId}] codex completed engine=${codexResult.engine} elapsedMs=${Date.now() - startedAt}`
    );
    ensureNotCancelled(session);

    updateSession(session, 90, "Reading response");
    const confidence = estimateIndexedOverallConfidence(contextChunks);
    const sources = contextChunks.map((chunk) => ({
      fileName: chunk.relativePath || chunk.fileName,
      relativePath: chunk.relativePath,
      snippet: chunk.snippet,
      webUrl: chunk.webUrl,
      pageCount: chunk.metadata?.pageCount
    }));
    const answer: ChatAnswer = {
      answer: codexResult.answer,
      confidence,
      sources,
      engine: codexResult.engine,
      fromCache: false,
      answerSource: "INDEXED_DOCUMENTS",
      warning: [
        buildIndexWarning(indexStatus.index.status, indexStatus.index.lastIndexedAt),
        possibleSimilar ? buildPossibleSimilarWarning(possibleSimilar.similarityScore) : ""
      ]
        .filter(Boolean)
        .join(" ") || undefined
    };

    await saveCachedChatAnswer(cacheKey, answer);
    persistAssistantAnswer({
      sessionId: session.sessionId,
      sourceId: indexStatus.source.id,
      question: session.question,
      answer,
      responseTimeMs: Date.now() - startedAt,
      codexUsed: codexResult.engine === "codex",
      cacheHit: false,
      answerSource: "INDEXED_DOCUMENTS",
      indexStatus,
      retrievedChunks: contextChunks
    });
    ensureNotCancelled(session);
    updateSession(session, 98, "Returning answer");
    completeSession(session, answer);
  } catch (error) {
    if (error instanceof CodexOperatorCancelledError || session.cancelled) {
      markCancelled(session);
      return;
    }

    markFailed(session, error instanceof Error ? error.message : "Unable to answer right now.");
  }
}

function updateSession(session: InternalChatSession, progress: number, step: string): void {
  ensureNotCancelled(session);
  session.status = "RUNNING";
  session.progress = progress;
  session.step = step;
  session.updatedAt = Date.now();
}

function completeSession(
  session: InternalChatSession,
  answer: ChatAnswer,
  step = "Completed"
): void {
  session.status = "COMPLETED";
  session.progress = 100;
  session.step = step;
  session.answer = answer.answer;
  session.confidence = answer.confidence;
  session.sources = answer.sources;
  session.error = null;
  session.engine = answer.engine;
  session.fromCache = answer.fromCache;
  session.answerSource = answer.answerSource;
  session.similarityScore = answer.similarityScore;
  session.reusedFromQuestionId = answer.reusedFromQuestionId;
  session.warning = answer.warning;
  session.updatedAt = Date.now();
}

function markFailed(session: InternalChatSession, error: string): void {
  if (TERMINAL_STATUSES.has(session.status)) {
    return;
  }

  session.status = "FAILED";
  session.step = "Error";
  session.error = error;
  session.updatedAt = Date.now();
}

function markCancelled(session: InternalChatSession): void {
  session.cancelled = true;
  session.status = "CANCELLED";
  session.step = "Request cancelled";
  session.error = "Request cancelled";
  session.updatedAt = Date.now();
}

function ensureNotCancelled(session: InternalChatSession): void {
  if (session.cancelled || session.status === "CANCELLED") {
    throw new CodexOperatorCancelledError();
  }
}

function toPublicStatus(session: InternalChatSession): ChatSessionStatus {
  return {
    sessionId: session.sessionId,
    status: session.status,
    progress: session.progress,
    step: session.step,
    answer: session.answer,
    confidence: session.confidence,
    sources: session.sources,
    error: session.error,
    engine: session.engine,
    fromCache: session.fromCache,
    answerSource: session.answerSource,
    similarityScore: session.similarityScore,
    reusedFromQuestionId: session.reusedFromQuestionId,
    warning: session.warning
  };
}

function getSessionStore(): Map<string, InternalChatSession> {
  if (!globalThis.__knowledgeAssistantChatSessions) {
    globalThis.__knowledgeAssistantChatSessions = new Map();
  }

  return globalThis.__knowledgeAssistantChatSessions;
}

function buildIndexWarning(status: "FRESH" | "STALE" | "EMPTY", lastIndexedAt: string | null): string | undefined {
  if (status !== "STALE") {
    return undefined;
  }

  return `The document index may be outdated. Last indexed: ${lastIndexedAt || "not indexed yet"}.`;
}

function buildPossibleSimilarWarning(similarityScore: number): string {
  return `A similar question was asked before (${Math.round(
    similarityScore * 100
  )}% similar), so this answer was refreshed from the current document index.`;
}
