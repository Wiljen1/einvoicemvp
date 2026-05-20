import { NextResponse } from "next/server";
import { z } from "zod";
import { startChatSession } from "@/services/chatSessionService";

export const runtime = "nodejs";

const chatRequestSchema = z.object({
  question: z.string().trim().min(1).max(600),
  forceFresh: z.boolean().optional().default(false)
});

export async function POST(request: Request) {
  try {
    const body = chatRequestSchema.parse(await request.json());
    const status = startChatSession(body.question, { forceFresh: body.forceFresh });

    return NextResponse.json({
      ok: true,
      data: status
    });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: "Please enter a question between 1 and 600 characters."
      },
      { status: 400 }
    );
  }
}
