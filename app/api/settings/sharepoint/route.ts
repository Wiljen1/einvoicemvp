import { NextResponse } from "next/server";
import {
  loadSharePointConfig,
  saveSharePointConfig,
  toPublicSharePointConfig,
  updateSharePointConnectionMetadata
} from "@/services/sharepointConfigService";
import { getBearerToken } from "@/services/microsoftAuthService";
import { checkSharePointAccess, getDocumentSourceStatus } from "@/services/sharepointService";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const config = await loadSharePointConfig();
  const accessToken = getBearerToken(request);
  const [status, documents] = await Promise.all([
    checkSharePointAccess(config, { accessToken }),
    getDocumentSourceStatus(config, { accessToken })
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
    const accessToken = getBearerToken(request);
    let config = await saveSharePointConfig(body);
    const status = await checkSharePointAccess(config, { accessToken });
    config = await updateSharePointConnectionMetadata({
      status: status.message
    });
    const documents = await getDocumentSourceStatus(config, { accessToken });

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
