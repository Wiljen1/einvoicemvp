import { NextResponse } from "next/server";
import { getActiveIndexStatus } from "@/services/documentIndexRunService";

export const runtime = "nodejs";

export async function GET() {
  const status = await getActiveIndexStatus();

  return NextResponse.json({
    ok: true,
    data: status
  });
}
