import { NextResponse } from "next/server";
import { getChatSessionStatus } from "@/services/chatSessionService";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{
    sessionId: string;
  }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const { sessionId } = await context.params;
  const status = getChatSessionStatus(sessionId);

  if (!status) {
    return NextResponse.json(
      {
        ok: false,
        error: "Chat session was not found."
      },
      { status: 404 }
    );
  }

  return NextResponse.json({
    ok: true,
    data: status
  });
}
