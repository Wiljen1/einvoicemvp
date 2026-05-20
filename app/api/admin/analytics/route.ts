import { NextResponse } from "next/server";
import { getAdminAnalytics } from "@/services/adminAnalyticsService";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    ok: true,
    data: getAdminAnalytics()
  });
}
