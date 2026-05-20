import { NextResponse } from "next/server";
import { z } from "zod";
import {
  loadDocumentSourceConfig,
  saveDocumentSourceConfig
} from "@/services/documentSourceConfigService";
import { getDocumentSourceStatus } from "@/services/documentSourceService";
import { getDocumentSourceById } from "@/services/indexDatabaseService";

export const runtime = "nodejs";

const selectSourceSchema = z.object({
  sourceId: z.string().trim().min(1)
});

export async function POST(request: Request) {
  try {
    const body = selectSourceSchema.parse(await request.json());
    const source = getDocumentSourceById(body.sourceId);

    if (!source) {
      return NextResponse.json(
        {
          ok: false,
          error: "Document source was not found."
        },
        { status: 404 }
      );
    }

    const current = await loadDocumentSourceConfig();
    const config = await saveDocumentSourceConfig({
      ...current,
      mode: source.type,
      localFolderPath:
        source.type === "LOCAL_FOLDER" ? source.rootPath : current.localFolderPath,
      syncedFolderPath:
        source.type === "SYNCED_SHAREPOINT_FOLDER" ? source.rootPath : current.syncedFolderPath
    });
    const status = await getDocumentSourceStatus();

    return NextResponse.json({
      ok: true,
      data: {
        config,
        status,
        source
      }
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unable to select document source."
      },
      { status: 400 }
    );
  }
}
