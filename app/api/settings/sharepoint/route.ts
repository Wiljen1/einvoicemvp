import { NextResponse } from "next/server";
import {
  loadSharePointConfig,
  saveSharePointConfig,
  toPublicSharePointConfig,
  updateSharePointConnectionMetadata
} from "@/services/sharepointConfigService";
import { checkSharePointAccess, getDocumentSourceStatus } from "@/services/sharepointService";

export const runtime = "nodejs";

export async function GET() {
  const config = await loadSharePointConfig();
  const [status, documents] = await Promise.all([
    checkSharePointAccess(config),
    getDocumentSourceStatus(config)
  ]);

  return NextResponse.json({
    ok: true,
    data: {
      config: toPublicSharePointConfig(config),
      status,
      documents
    }
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    let config = await saveSharePointConfig(body);
    const status = await checkSharePointAccess(config);
    config = await updateSharePointConnectionMetadata({
      status: status.message
    });
    const documents = await getDocumentSourceStatus(config);

    return NextResponse.json({
      ok: true,
      data: {
        config: toPublicSharePointConfig(config),
        status,
        documents
      }
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unable to save SharePoint settings."
      },
      { status: 400 }
    );
  }
}
