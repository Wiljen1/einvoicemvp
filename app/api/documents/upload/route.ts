import { NextResponse } from "next/server";
import {
  deleteUploadedDocument,
  refreshDocumentSourceIndex,
  saveUploadedDocument
} from "@/services/documentSourceService";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const files = formData.getAll("files").filter((item): item is File => item instanceof File);

    if (files.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "Choose at least one document to upload."
        },
        { status: 400 }
      );
    }

    for (const file of files) {
      await saveUploadedDocument(file);
    }

    const status = await refreshDocumentSourceIndex();

    return NextResponse.json({
      ok: true,
      data: status
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unable to upload documents."
      },
      { status: 400 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const body = (await request.json()) as { relativePath?: string };

    if (!body.relativePath) {
      return NextResponse.json(
        {
          ok: false,
          error: "Document path is required."
        },
        { status: 400 }
      );
    }

    await deleteUploadedDocument(body.relativePath);
    const status = await refreshDocumentSourceIndex();

    return NextResponse.json({
      ok: true,
      data: status
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unable to delete document."
      },
      { status: 400 }
    );
  }
}
