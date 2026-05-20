import { NextResponse } from "next/server";
import { z } from "zod";
import { buildChatPrompt } from "@/services/chatPromptService";
import { detectCodexStatus, executeCodexPrompt } from "@/services/codexService";
import {
  estimateOverallConfidence,
  searchDocuments
} from "@/services/documentSearchService";
import { loadGuardrails } from "@/services/guardrailsService";
import { checkSharePointAccess, listApprovedDocuments } from "@/services/sharepointService";
import type { ChatAnswer } from "@/types/chat";

const chatRequestSchema = z.object({
  question: z.string().trim().min(1).max(600)
});

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

  const [guardrails, codex, sharepoint] = await Promise.all([
    loadGuardrails(),
    detectCodexStatus(),
    checkSharePointAccess()
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

  if (!sharepoint.available) {
    return NextResponse.json(
      {
        ok: false,
        error: "SharePoint folder is not accessible."
      },
      { status: 503 }
    );
  }

  const documents = await listApprovedDocuments();
  const contextChunks = searchDocuments(question, documents, { limit: 5 });

  if (contextChunks.length === 0) {
    const data: ChatAnswer = {
      answer: guardrails.fallbackMessage,
      confidence: 0,
      sources: [],
      engine: codex.executionMode === "real" ? "codex" : "codex-placeholder"
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
    fileName: chunk.fileName,
    snippet: chunk.snippet,
    webUrl: chunk.webUrl
  }));
  const data: ChatAnswer = {
    answer: codexResult.answer,
    confidence,
    sources: guardrails.includeSources ? sources : [],
    engine: codexResult.engine
  };

  return NextResponse.json({
    ok: true,
    data
  });
}
