import { NextResponse } from "next/server";
import { z } from "zod";
import { buildChatPrompt } from "@/services/chatPromptService";
import { detectCodexStatus, executeCodexPrompt } from "@/services/codexService";
import {
  estimateOverallConfidence,
  searchDocuments
} from "@/services/documentSearchService";
import { fallbackMessage, loadGuardrails } from "@/services/guardrailsService";
import { getDocumentSourceStatus, listApprovedDocuments } from "@/services/documentSourceService";
import type { ChatAnswer } from "@/types/chat";

export const runtime = "nodejs";

const chatRequestSchema = z.object({
  question: z.string().trim().min(1).max(600)
});
const noReadableDocumentsMessage =
  "No readable documents are currently indexed. Please add documents or refresh the document index.";

export async function POST(request: Request) {
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

  const [guardrails, codex, documentsStatus] = await Promise.all([
    loadGuardrails(),
    detectCodexStatus(),
    getDocumentSourceStatus()
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

  if (!documentsStatus.available) {
    return NextResponse.json(
      {
        ok: false,
        error: documentsStatus.message || "No document source is currently available."
      },
      { status: 503 }
    );
  }

  let documents = await listApprovedDocuments();
  if (documents.length === 0) {
    documents = await listApprovedDocuments({ forceRefresh: true });
  }

  if (documents.length === 0) {
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

  const contextChunks = searchDocuments(question, documents, { limit: 5 });

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
  const codexResult = await executeCodexPrompt({
    prompt,
    question,
    contextChunks,
    guardrails
  });
  const confidence = estimateOverallConfidence(contextChunks);
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
    engine: codexResult.engine
  };

  return NextResponse.json({
    ok: true,
    data
  });
}
