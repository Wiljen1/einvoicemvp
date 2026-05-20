import { NextResponse } from "next/server";
import {
  loadDocumentSourceConfig,
  saveDocumentSourceConfig
} from "@/services/documentSourceConfigService";
import { getDocumentSourceStatus } from "@/services/documentSourceService";

export const runtime = "nodejs";

export async function GET() {
  const [config, status] = await Promise.all([
    loadDocumentSourceConfig(),
    getDocumentSourceStatus()
  ]);

  return NextResponse.json({
    ok: true,
    data: {
      config,
      status
    }
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const config = await saveDocumentSourceConfig(body);
    const status = await getDocumentSourceStatus();

    return NextResponse.json({
      ok: true,
      data: {
        config,
        status
      }
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unable to save document settings."
      },
      { status: 400 }
    );
  }
}
