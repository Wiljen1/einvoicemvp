import { NextResponse } from "next/server";
import { getQuestionAnswerLogById } from "@/services/indexDatabaseService";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const log = getQuestionAnswerLogById(id);

  if (!log) {
    return NextResponse.json(
      {
        ok: false,
        error: "Question history entry was not found."
      },
      { status: 404 }
    );
  }

  return NextResponse.json({
    ok: true,
    data: {
      question: {
        ...log,
        codexUsed: log.codexUsed === 1,
        cacheHit: log.cacheHit === 1,
        sources: parseJson(log.sourcesJson, []),
        retrievedChunks: parseJson(log.retrievedChunkIdsJson, [])
      }
    }
  });
}

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
