import { NextResponse } from "next/server";
import { deleteDocumentSource, getDocumentSourceById } from "@/services/indexDatabaseService";

export const runtime = "nodejs";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ sourceId: string }> }
) {
  const { sourceId } = await context.params;
  const source = getDocumentSourceById(sourceId);

  if (!source) {
    return NextResponse.json(
      {
        ok: false,
        error: "Document source was not found."
      },
      { status: 404 }
    );
  }

  deleteDocumentSource(sourceId);

  return NextResponse.json({
    ok: true,
    data: {
      deletedSourceId: sourceId
    }
  });
}
