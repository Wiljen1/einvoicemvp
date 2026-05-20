import { NextResponse } from "next/server";
import { startIndexRun } from "@/services/documentIndexRunService";

export const runtime = "nodejs";

export async function POST() {
  try {
    const run = await startIndexRun();

    return NextResponse.json({
      ok: true,
      data: run
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unable to start document indexing."
      },
      { status: 400 }
    );
  }
}
