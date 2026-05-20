import { NextResponse } from "next/server";
import { getLocalDocumentIndexStatus } from "@/services/documentIndexService";

export const runtime = "nodejs";

export async function GET() {
  const status = await getLocalDocumentIndexStatus();

  return NextResponse.json({
    ok: true,
    data: status
  });
}
