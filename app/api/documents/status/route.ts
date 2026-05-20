import { NextResponse } from "next/server";
import { getDocumentSourceStatus } from "@/services/documentSourceService";

export const runtime = "nodejs";

export async function GET() {
  const status = await getDocumentSourceStatus();

  return NextResponse.json({
    ok: true,
    data: status
  });
}
