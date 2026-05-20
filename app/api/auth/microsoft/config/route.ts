import { NextResponse } from "next/server";
import { getMicrosoftAuthConfig } from "@/services/microsoftAuthService";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const config = await getMicrosoftAuthConfig(origin);

  return NextResponse.json({
    ok: true,
    data: config
  });
}
