import { NextResponse } from "next/server";
import { refreshDocumentSourceIndex } from "@/services/documentSourceService";

export const runtime = "nodejs";

export async function POST() {
  const status = await refreshDocumentSourceIndex();

  return NextResponse.json({
    ok: true,
    data: status
  });
}
