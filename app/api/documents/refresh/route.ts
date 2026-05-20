import { NextResponse } from "next/server";
import { refreshLocalDocumentIndex } from "@/services/documentIndexService";

export const runtime = "nodejs";

export async function POST() {
  const status = await refreshLocalDocumentIndex();

  return NextResponse.json({
    ok: true,
    data: {
      activeSource: status.activeSource,
      folderPath: status.folderPath,
      exists: status.exists,
      available: status.available,
      recursive: status.recursive,
      maxDepth: status.maxDepth,
      supportedExtensions: status.supportedExtensions,
      indexedFiles: status.fileCount,
      skippedFiles: status.skippedFileCount,
      indexedFileDetails: status.indexedFiles,
      skippedFileDetails: status.skippedFiles,
      fileCount: status.fileCount,
      skippedFileCount: status.skippedFileCount,
      indexedCount: status.indexedCount,
      skippedCount: status.skippedCount,
      lastIndexedAt: status.lastIndexedAt,
      message: status.message
    }
  });
}
