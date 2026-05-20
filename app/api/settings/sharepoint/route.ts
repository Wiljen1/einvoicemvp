import { NextResponse } from "next/server";
import { loadSharePointConfig, saveSharePointConfig, toPublicSharePointConfig } from "@/services/sharepointConfigService";
import { checkSharePointAccess } from "@/services/sharepointService";

export async function GET() {
  const config = await loadSharePointConfig();
  const status = await checkSharePointAccess(config);

  return NextResponse.json({
    ok: true,
    data: {
      config: toPublicSharePointConfig(config),
      status
    }
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const config = await saveSharePointConfig(body);
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
        error: error instanceof Error ? error.message : "Unable to save SharePoint settings."
      },
      { status: 400 }
    );
  }
}
