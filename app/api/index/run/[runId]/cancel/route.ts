import { NextResponse } from "next/server";
import { cancelIndexRun } from "@/services/documentIndexRunService";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ runId: string }>;
}

export async function POST(_request: Request, context: RouteContext) {
  const { runId } = await context.params;
  const run = cancelIndexRun(runId);

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
