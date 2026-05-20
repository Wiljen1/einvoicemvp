import { NextResponse } from "next/server";
import { getIndexRunProgress } from "@/services/documentIndexRunService";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ runId: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const { runId } = await context.params;
  const run = getIndexRunProgress(runId);

  if (!run) {
    return NextResponse.json(
      {
        ok: false,
        error: "Index run not found."
      },
      { status: 404 }
    );
  }

  return NextResponse.json({
    ok: true,
    data: run
  });
}
