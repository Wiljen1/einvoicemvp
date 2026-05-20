import { NextResponse } from "next/server";
import { detectCodexStatus } from "@/services/codexService";
import { getBearerToken } from "@/services/microsoftAuthService";
import { checkSharePointAccess, getDocumentSourceStatus } from "@/services/sharepointService";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const accessToken = getBearerToken(request);
  const [codex, sharepoint, documents] = await Promise.all([
    detectCodexStatus(),
    checkSharePointAccess(undefined, { accessToken }),
    getDocumentSourceStatus(undefined, { accessToken })
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
      sharepoint: {
        available: sharepoint.available,
        message: sharepoint.message,
        activeFolder: sharepoint.activeFolder,
        mode: sharepoint.mode
      },
      documents
    }
  });
}
