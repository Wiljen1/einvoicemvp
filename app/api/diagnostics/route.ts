import fs from "node:fs/promises";
import { constants } from "node:fs";
import { NextResponse } from "next/server";
import { checkCodexStatus } from "@/services/codexService";
import {
  getExtractorRegistryStatus,
  getSupportedExtractorExtensions
} from "@/services/documentExtractors";
import {
  ensureActiveDocumentSource,
  getLocalDocumentsRecursive
} from "@/services/documentIndexRunService";
import { validateIndexDatabaseConnection } from "@/services/indexDatabaseService";
import { getOcrConfig } from "@/services/ocrService";

export const runtime = "nodejs";

export async function GET() {
  const database = validateIndexDatabaseConnection();
  const source = await ensureActiveDocumentSource();
  const sourceReadable = await isReadableDirectory(source.rootPath);
  const ocr = getOcrConfig();
  const registry = getExtractorRegistryStatus();
  const supportedExtensions = getSupportedExtractorExtensions();
  const codex = await checkCodexStatus({ timeoutMs: 3000 });

  const extractors = {
    pdf: hasExtractor(registry, "pdfExtractor", ".pdf"),
    pptx: hasExtractor(registry, "pptxExtractor", ".pptx"),
    xlsx: hasExtractor(registry, "xlsxExtractor", ".xlsx"),
    image:
      hasExtractor(registry, "imageExtractor", ".png") &&
      supportedExtensions.includes(".jpg") &&
      supportedExtensions.includes(".jpeg"),
    video: hasExtractor(registry, "videoMetadataExtractor", ".mp4"),
    url: hasExtractor(registry, "urlExtractor", ".url")
  };
  const ok =
    database.connected &&
    sourceReadable &&
    getLocalDocumentsRecursive() &&
    ocr.enabled &&
    Object.values(extractors).every(Boolean) &&
    codex.available;

  return NextResponse.json({
    ok,
    data: {
      database: database.connected ? "OK" : "FAILED",
      activeSource: sourceReadable ? "OK" : "FAILED",
      recursiveScanner: getLocalDocumentsRecursive() ? "OK" : "DISABLED",
      ocr: ocr.enabled ? "OK" : "DISABLED",
      extractors: Object.fromEntries(
        Object.entries(extractors).map(([name, available]) => [name, available ? "OK" : "FAILED"])
      ),
      codex: codex.available ? "OK" : "FAILED",
      details: {
        source: {
          id: source.id,
          type: source.type,
          rootPath: source.rootPath,
          sourceKey: source.sourceKey,
          readable: sourceReadable
        },
        database: database.message,
        ocrLanguage: ocr.language,
        supportedExtensions,
        registeredExtractors: registry.map((extractor) => extractor.name),
        codex: codex.message
      }
    }
  });
}

async function isReadableDirectory(folderPath: string): Promise<boolean> {
  try {
    const stats = await fs.stat(folderPath);
    if (!stats.isDirectory()) {
      return false;
    }

    await fs.access(folderPath, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

function hasExtractor(
  registry: Array<{ name: string; extensions: string[] }>,
  name: string,
  extension: string
): boolean {
  return registry.some((extractor) => extractor.name === name && extractor.extensions.includes(extension));
}
