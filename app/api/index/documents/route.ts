import { NextResponse } from "next/server";
import { listIndexedDocumentsForActiveSource } from "@/services/documentIndexRunService";

export const runtime = "nodejs";

export async function GET() {
  const documents = await listIndexedDocumentsForActiveSource();

  return NextResponse.json({
    ok: true,
    data: {
      documents
    }
  });
}
