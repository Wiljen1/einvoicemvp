import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  attachChatSessionSource,
  beginPersistedChatSession,
  findPossibleSimilarQuestion,
  findReusableAnswer,
  persistAssistantAnswer
} from "@/services/answerReuseService";
import { buildChatPrompt } from "@/services/chatPromptService";
import { detectCodexStatus, executeCodexPrompt } from "@/services/codexService";
import { getActiveIndexStatus } from "@/services/documentIndexRunService";
import {
  estimateIndexedOverallConfidence,
  searchIndexedDocuments
} from "@/services/indexedDocumentSearchService";
import { fallbackMessage, loadGuardrails } from "@/services/guardrailsService";
import type { ChatAnswer } from "@/types/chat";

export const runtime = "nodejs";

const chatRequestSchema = z.object({
  question: z.string().trim().min(1).max(600),
  forceFresh: z.boolean().optional().default(false)
});
const noReadableDocumentsMessage =
  "No documents are indexed yet. Please run Scan / Update Document Index first.";

export async function POST(request: Request) {
  const startedAt = Date.now();
  const sessionId = crypto.randomUUID();
  let question = "";
  let forceFresh = false;

  try {
    const body = chatRequestSchema.parse(await request.json());
    question = body.question;
    forceFresh = body.forceFresh;
    beginPersistedChatSession(sessionId, question);
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: "Please enter a question between 1 and 600 characters."
      },
      { status: 400 }
    );
  }

  const [guardrails, codex, indexStatus] = await Promise.all([
    loadGuardrails(),
    detectCodexStatus(),
    getActiveIndexStatus({ checkForUpdates: false })
  ]);
  attachChatSessionSource(sessionId, indexStatus.source.id);

  if (!codex.available) {
    return NextResponse.json(
      {
        ok: false,
        error: "Codex is not available."
      },
      { status: 503 }
    );
  }

  if (indexStatus.index.activeDocuments === 0 || indexStatus.index.activeChunks === 0) {
    const data: ChatAnswer = {
      answer: noReadableDocumentsMessage,
      confidence: 0,
      sources: [],
      engine: codex.executionMode === "placeholder" ? "codex-placeholder" : "codex",
      answerSource: "REFUSAL"
    };
    persistAssistantAnswer({
      sessionId,
      sourceId: indexStatus.source.id,
      question,
      answer: data,
      responseTimeMs: Date.now() - startedAt,
      codexUsed: false,
      cacheHit: false,
      answerSource: "REFUSAL",
      indexStatus
    });

    return NextResponse.json({
      ok: true,
      data
    });
  }

  const reusableAnswer = findReusableAnswer({ question, indexStatus, forceFresh });
  if (reusableAnswer) {
    persistAssistantAnswer({
      sessionId,
      sourceId: indexStatus.source.id,
      question,
      answer: reusableAnswer.answer,
      responseTimeMs: Date.now() - startedAt,
      codexUsed: false,
      cacheHit: true,
      answerSource: "PREVIOUS_SIMILAR_QUESTION",
      reusedFromLogId: reusableAnswer.match.log.id,
      similarityScore: reusableAnswer.match.similarityScore,
      indexStatus
    });

    return NextResponse.json({
      ok: true,
      data: reusableAnswer.answer
    });
  }

  const possibleSimilar = findPossibleSimilarQuestion({ question, indexStatus });
  const contextChunks = await searchIndexedDocuments(question, { limit: 5 });
  console.info(
    `[chat] search completed chunks=${contextChunks.length} elapsedMs=${Date.now() - startedAt}`
  );

  if (contextChunks.length === 0) {
    const data: ChatAnswer = {
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
      sessionId,
      sourceId: indexStatus.source.id,
      question,
      answer: data,
      responseTimeMs: Date.now() - startedAt,
      codexUsed: false,
      cacheHit: false,
      answerSource: "REFUSAL",
      indexStatus,
      retrievedChunks: contextChunks
    });

    return NextResponse.json({
      ok: true,
      data
    });
  }

  const prompt = buildChatPrompt({
    question,
    guardrails,
    contextChunks
  });
  console.info(`[chat] codex started chunks=${contextChunks.length}`);
  const codexResult = await executeCodexPrompt({
    prompt,
    question,
    contextChunks,
    guardrails
  });
  console.info(
    `[chat] codex completed engine=${codexResult.engine} elapsedMs=${Date.now() - startedAt}`
  );
  const confidence = estimateIndexedOverallConfidence(contextChunks);
  const sources = contextChunks.map((chunk) => ({
    fileName: chunk.relativePath || chunk.fileName,
    relativePath: chunk.relativePath,
    snippet: chunk.snippet,
    webUrl: chunk.webUrl,
    pageCount: chunk.metadata?.pageCount
  }));
  const data: ChatAnswer = {
    answer: codexResult.answer,
    confidence,
    sources,
    engine: codexResult.engine,
    answerSource: "INDEXED_DOCUMENTS",
    warning:
      [
        buildIndexWarning(indexStatus.index.status, indexStatus.index.lastIndexedAt),
        possibleSimilar ? buildPossibleSimilarWarning(possibleSimilar.similarityScore) : ""
      ]
        .filter(Boolean)
        .join(" ") || undefined
  };
  persistAssistantAnswer({
    sessionId,
    sourceId: indexStatus.source.id,
    question,
    answer: data,
    responseTimeMs: Date.now() - startedAt,
    codexUsed: codexResult.engine === "codex",
    cacheHit: false,
    answerSource: "INDEXED_DOCUMENTS",
    indexStatus,
    retrievedChunks: contextChunks
  });

  return NextResponse.json({
    ok: true,
    data
  });
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
