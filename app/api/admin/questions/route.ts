import { NextResponse } from "next/server";
import { deleteQuestionAnswerLogs, listQuestionAnswerLogs } from "@/services/indexDatabaseService";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const logs = listQuestionAnswerLogs({
    search: url.searchParams.get("search") || undefined,
    sourceId: url.searchParams.get("sourceId") || undefined,
    confidenceLevel: parseConfidenceLevel(url.searchParams.get("confidenceLevel")),
    cacheHit: parseBoolean(url.searchParams.get("cacheHit")),
    codexUsed: parseBoolean(url.searchParams.get("codexUsed")),
    fromDate: url.searchParams.get("fromDate") || undefined,
    toDate: url.searchParams.get("toDate") || undefined,
    limit: Number(url.searchParams.get("limit") || 100)
  });

  return NextResponse.json({
    ok: true,
    data: {
      questions: logs.map((log) => ({
        ...log,
        codexUsed: log.codexUsed === 1,
        cacheHit: log.cacheHit === 1,
        sources: parseJson(log.sourcesJson, []),
        retrievedChunks: parseJson(log.retrievedChunkIdsJson, [])
      }))
    }
  });
}

export async function DELETE() {
  const deleted = deleteQuestionAnswerLogs();

  return NextResponse.json({
    ok: true,
    data: {
      deleted
    }
  });
}

function parseBoolean(value: string | null): boolean | undefined {
  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return undefined;
}

function parseConfidenceLevel(value: string | null): "High" | "Medium" | "Low" | undefined {
  return value === "High" || value === "Medium" || value === "Low" ? value : undefined;
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
