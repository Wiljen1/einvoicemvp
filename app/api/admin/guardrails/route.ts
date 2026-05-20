import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { buildGuardrailsPrompt, loadGuardrails, saveGuardrails } from "@/services/guardrailsService";

export const runtime = "nodejs";

export async function GET() {
  const guardrails = await loadGuardrails();

  return NextResponse.json({
    ok: true,
    data: {
      ...guardrails,
      promptPreview: buildGuardrailsPrompt(guardrails)
    }
  });
}

export async function POST(request: Request) {
  try {
    const guardrails = await saveGuardrails(await request.json());

    return NextResponse.json({
      ok: true,
      data: {
        ...guardrails,
        promptPreview: buildGuardrailsPrompt(guardrails)
      }
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof ZodError ? "Guardrails input is invalid." : "Unable to save guardrails."
      },
      { status: 400 }
    );
  }
}
