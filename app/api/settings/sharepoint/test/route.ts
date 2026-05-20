import { NextResponse } from "next/server";
import {
  buildDraftSharePointConfig,
  loadSharePointConfig,
  toPublicSharePointConfig
} from "@/services/sharepointConfigService";
import { checkSharePointAccess } from "@/services/sharepointService";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const config = Object.keys(body || {}).length > 0
      ? await buildDraftSharePointConfig(body)
      : await loadSharePointConfig();
    const status = await checkSharePointAccess(config);

    return NextResponse.json({
      ok: true,
      data: {
        config: toPublicSharePointConfig(config),
        status
      }
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unable to test SharePoint settings."
      },
      { status: 400 }
    );
  }
}
