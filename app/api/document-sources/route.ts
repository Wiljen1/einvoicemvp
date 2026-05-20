import { NextResponse } from "next/server";
import { listKnownDocumentSources } from "@/services/documentIndexRunService";

export const runtime = "nodejs";

export async function GET() {
  const sources = await listKnownDocumentSources();

  return NextResponse.json({
    ok: true,
    data: {
      sources
    }
  });
}
