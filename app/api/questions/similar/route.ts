import { NextResponse } from "next/server";
import { z } from "zod";
import { getActiveIndexStatus } from "@/services/documentIndexRunService";
import { findSimilarQuestions, normalizeQuestion } from "@/services/questionSimilarityService";

export const runtime = "nodejs";

const requestSchema = z.object({
  question: z.string().trim().min(1).max(600)
});

export async function POST(request: Request) {
  try {
    const body = requestSchema.parse(await request.json());
    const indexStatus = await getActiveIndexStatus({ checkForUpdates: false });
    const matches = findSimilarQuestions(body.question, {
      sourceId: indexStatus.source.id,
      minScore: 0.75,
      limit: 25
    });

    return NextResponse.json({
      ok: true,
      data: {
        normalizedQuestion: normalizeQuestion(body.question),
        matches: matches.map((match) => ({
          id: match.log.id,
          question: match.log.question,
          answerPreview: match.previousAnswer.slice(0, 240),
          similarityScore: match.similarityScore,
          band: match.band,
          confidenceScore: match.previousConfidence,
          createdAt: match.createdAt,
          sources: match.previousSources
        }))
      }
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
