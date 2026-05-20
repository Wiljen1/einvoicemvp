import { NextResponse } from "next/server";
import { buildGuardrailsPrompt, resetUserGuardrails } from "@/services/guardrailsService";

export const runtime = "nodejs";

export async function POST() {
  const guardrails = await resetUserGuardrails();

  return NextResponse.json({
    ok: true,
    data: {
      ...guardrails,
      promptPreview: buildGuardrailsPrompt(guardrails)
    }
  });
}
