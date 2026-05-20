import { NextResponse } from "next/server";
import { detectCodexStatus } from "@/services/codexService";
import { getDocumentSourceStatus } from "@/services/documentSourceService";

export const runtime = "nodejs";

export async function GET() {
  const [codex, documents] = await Promise.all([
    detectCodexStatus(),
    getDocumentSourceStatus()
  ]);

  return NextResponse.json({
    ok: true,
    data: {
      codex: {
        available: codex.available,
        message: codex.message,
        executionMode: codex.executionMode,
        binaryPath: codex.binaryPath,
        setupInstructions: codex.setupInstructions
      },
      documents
    }
  });
}
