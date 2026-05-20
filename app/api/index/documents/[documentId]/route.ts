import { NextResponse } from "next/server";
import { z } from "zod";
import { updateIndexedDocumentExclusion } from "@/services/indexDatabaseService";

export const runtime = "nodejs";

const exclusionPatchSchema = z.object({
  excludedFromChat: z.boolean().optional(),
  excludedFromIndexing: z.boolean().optional(),
  exclusionReason: z.string().trim().max(500).nullable().optional()
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ documentId: string }> }
) {
  const { documentId } = await context.params;

  try {
    const body = exclusionPatchSchema.parse(await request.json());
    const document = updateIndexedDocumentExclusion({
      documentId,
      excludedFromChat: body.excludedFromChat,
      excludedFromIndexing: body.excludedFromIndexing,
      exclusionReason: body.exclusionReason
    });

    return NextResponse.json({
      ok: true,
      data: {
        document
      }
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unable to update document exclusion."
      },
      { status: 400 }
    );
  }
}
