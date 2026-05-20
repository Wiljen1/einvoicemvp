import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { loadGuardrails, saveGuardrails } from "@/services/guardrailsService";

export const runtime = "nodejs";

export async function GET() {
  const guardrails = await loadGuardrails();

  return NextResponse.json({
    ok: true,
    data: guardrails
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const guardrails = await saveGuardrails(body);

    return NextResponse.json({
      ok: true,
      data: guardrails
    });
  } catch (error) {
    const message =
      error instanceof ZodError ? "Guardrails input is invalid." : "Unable to save guardrails.";

    return NextResponse.json(
      {
        ok: false,
        error: message
      },
      { status: 400 }
    );
  }
}
