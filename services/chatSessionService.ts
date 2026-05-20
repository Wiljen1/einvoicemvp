import crypto from "node:crypto";
import { buildChatPrompt } from "./chatPromptService";
import { getCachedChatAnswer, buildChatCacheKey, saveCachedChatAnswer } from "./chatCacheService";
import {
  checkCodexStatus,
  CodexOperatorCancelledError,
  executeCodexPrompt,
  stopCurrentCodexOperator
} from "./codexService";
import { estimateOverallConfidence, searchDocuments } from "./documentSearchService";
import { fallbackMessage, loadGuardrails } from "./guardrailsService";
import { getDocumentSourceStatus, listApprovedDocuments } from "./sharepointService";
import type { ChatAnswer, ChatSessionStatus } from "@/types/chat";

const sessions = getSessionStore();
const TERMINAL_STATUSES = new Set(["COMPLETED", "FAILED", "CANCELLED"]);

interface InternalChatSession extends ChatSessionStatus {
  question: string;
  cancelled: boolean;
  createdAt: number;
  updatedAt: number;
}

declare global {
  var __eInvoiceChatSessions: Map<string, InternalChatSession> | undefined;
}

export function startChatSession(question: string): ChatSessionStatus {
  const sessionId = crypto.randomUUID();
  const session: InternalChatSession = {
    sessionId,
    question,
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
  try {
    updateSession(session, 8, "Checking Codex");
    const codex = await checkCodexStatus();
    ensureNotCancelled(session);

    if (!codex.available) {
      throw new Error(codex.setupInstructions || "Codex is not available.");
    }

    updateSession(session, 20, "Checking SharePoint folder");
    const documentsStatus = await getDocumentSourceStatus();
    ensureNotCancelled(session);

    if (!documentsStatus.available) {
      throw new Error("No document source is currently available.");
    }

    updateSession(session, 32, "Loading guardrails");
    const guardrails = await loadGuardrails();
    ensureNotCancelled(session);

    updateSession(session, 45, "Searching documents");
    const documents = await listApprovedDocuments();
    const contextChunks = searchDocuments(session.question, documents, { limit: 5 });
    ensureNotCancelled(session);

    if (contextChunks.length === 0) {
      completeSession(session, {
        answer: fallbackMessage,
        confidence: 0,
        sources: [],
        engine: codex.executionMode === "placeholder" ? "codex-placeholder" : "codex"
      });
      return;
    }

    updateSession(session, 58, "Preparing prompt");
    const cacheKey = buildChatCacheKey({
      question: session.question,
      guardrails,
      contextChunks,
      folderIdentifier: documentsStatus.folderUrl || documentsStatus.folderPath
    });
    const cachedAnswer = await getCachedChatAnswer(cacheKey);
    ensureNotCancelled(session);

    if (cachedAnswer) {
      completeSession(session, cachedAnswer, "Loaded from cache");
      return;
    }

    const prompt = buildChatPrompt({
      question: session.question,
      guardrails,
      contextChunks
    });

    updateSession(session, 72, "Running local Codex");
    const codexResult = await executeCodexPrompt({
      prompt,
      question: session.question,
      contextChunks,
      guardrails,
      sessionId: session.sessionId
    });
    ensureNotCancelled(session);

    updateSession(session, 90, "Reading response");
    const confidence = estimateOverallConfidence(contextChunks);
    const sources = contextChunks.map((chunk) => ({
      fileName: chunk.fileName,
      snippet: chunk.snippet,
      webUrl: chunk.webUrl
    }));
    const answer: ChatAnswer = {
      answer: codexResult.answer,
      confidence,
      sources,
      engine: codexResult.engine,
      fromCache: false
    };

    await saveCachedChatAnswer(cacheKey, answer);
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
    fromCache: session.fromCache
  };
}

function getSessionStore(): Map<string, InternalChatSession> {
  if (!globalThis.__eInvoiceChatSessions) {
    globalThis.__eInvoiceChatSessions = new Map();
  }

  return globalThis.__eInvoiceChatSessions;
}
