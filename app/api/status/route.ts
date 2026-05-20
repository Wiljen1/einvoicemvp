import { NextResponse } from "next/server";
import { detectCodexStatus } from "@/services/codexService";
import { checkSharePointAccess } from "@/services/sharepointService";

export async function GET() {
  const [codex, sharepoint] = await Promise.all([
    detectCodexStatus(),
    checkSharePointAccess()
  ]);

  return NextResponse.json({
    ok: true,
    data: {
      codex: {
        available: codex.available,
        message: codex.message,
        executionMode: codex.executionMode
      },
      sharepoint: {
        available: sharepoint.available,
        message: sharepoint.message,
        activeFolder: sharepoint.activeFolder,
        mode: sharepoint.mode
      }
    }
  });
}
