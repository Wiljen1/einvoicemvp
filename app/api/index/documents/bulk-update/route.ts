import { NextResponse } from "next/server";
import { z } from "zod";
import { bulkUpdateIndexedDocumentExclusions } from "@/services/indexDatabaseService";

export const runtime = "nodejs";

const bulkUpdateSchema = z.object({
  documentIds: z.array(z.string().trim().min(1)).min(1).max(500),
  excludedFromChat: z.boolean().optional(),
  excludedFromIndexing: z.boolean().optional(),
  exclusionReason: z.string().trim().max(500).nullable().optional()
});

export async function POST(request: Request) {
  try {
    const body = bulkUpdateSchema.parse(await request.json());
    const documents = bulkUpdateIndexedDocumentExclusions({
      documentIds: body.documentIds,
      excludedFromChat: body.excludedFromChat,
      excludedFromIndexing: body.excludedFromIndexing,
      exclusionReason: body.exclusionReason
    });

    return NextResponse.json({
      ok: true,
      data: {
        documents
      }
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unable to update document exclusions."
      },
      { status: 400 }
    );
  }
}
