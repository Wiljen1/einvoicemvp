import { NextResponse } from "next/server";
import { z } from "zod";
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
  question: z.string().trim().min(1).max(600)
});
const noReadableDocumentsMessage =
  "No documents are indexed yet. Please run Scan / Update Document Index first.";

export async function POST(request: Request) {
  const startedAt = Date.now();
  let question = "";

  try {
    const body = chatRequestSchema.parse(await request.json());
    question = body.question;
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
      engine: codex.executionMode === "placeholder" ? "codex-placeholder" : "codex"
    };

    return NextResponse.json({
      ok: true,
      data
    });
  }

  const contextChunks = await searchIndexedDocuments(question, { limit: 5 });
  console.info(
    `[chat] search completed chunks=${contextChunks.length} elapsedMs=${Date.now() - startedAt}`
  );

  if (contextChunks.length === 0) {
    const data: ChatAnswer = {
      answer: fallbackMessage,
      confidence: 0,
      sources: [],
      engine: codex.executionMode === "placeholder" ? "codex-placeholder" : "codex"
    };

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
    warning: buildIndexWarning(indexStatus.index.status, indexStatus.index.lastIndexedAt)
  };

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
