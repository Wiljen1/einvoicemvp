import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside, uploadedDocumentsDirectory } from "@/lib/paths";
import type { ApprovedDocument, DocumentIndexStatus } from "@/types/document";
import { getSupportedExtractorExtensions } from "./documentExtractors";
import { getDocumentIndexStatus, startIndexRun } from "./documentIndexRunService";
import { ensureActiveDocumentSource } from "./documentIndexRunService";
import { listSearchableChunks } from "./indexDatabaseService";

export async function getDocumentSourceStatus(): Promise<DocumentIndexStatus> {
  return getDocumentIndexStatus();
}

export async function listApprovedDocuments(): Promise<ApprovedDocument[]> {
  const source = await ensureActiveDocumentSource();
  const byDocument = new Map<string, ApprovedDocument>();

  for (const chunk of listSearchableChunks(source.id)) {
    const current = byDocument.get(chunk.documentId);
    const metadata = parseMetadata(chunk.metadataJson);

    if (current) {
      current.content = `${current.content}\n${chunk.text}`;
      current.searchableText = current.content;
    } else {
      byDocument.set(chunk.documentId, {
        id: chunk.documentId,
        fileName: chunk.fileName,
        relativePath: chunk.relativePath,
        absolutePath: chunk.absolutePath,
        extension: chunk.extension,
        content: chunk.text,
        searchableText: chunk.text,
        sourcePath: chunk.absolutePath,
        sourceType: source.type,
        indexedMode: chunk.indexedMode,
        metadata
      });
    }
  }

  return Array.from(byDocument.values());
}

function parseMetadata(value: string | null): ApprovedDocument["metadata"] {
  if (!value) {
    return {};
  }

  try {
    return JSON.parse(value) as ApprovedDocument["metadata"];
  } catch {
    return {};
  }
}

export async function refreshDocumentSourceIndex() {
  return startIndexRun();
}

export async function saveUploadedDocument(file: File): Promise<void> {
  const extension = path.extname(file.name).toLowerCase();
  const supported = getSupportedExtractorExtensions();

  if (!supported.includes(extension)) {
    throw new Error(`Unsupported file type (${extension || "unknown"}).`);
  }

  const uploadLimitBytes = getUploadLimitBytes(extension);
  if (file.size > uploadLimitBytes) {
    throw new Error(`File exceeds ${Math.round(uploadLimitBytes / 1024 / 1024)} MB upload limit.`);
  }

  await fs.mkdir(uploadedDocumentsDirectory, { recursive: true });
  const safeName = sanitizeUploadFileName(file.name);
  const uploadPath = resolveInside(uploadedDocumentsDirectory, safeName);
  const bytes = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(uploadPath, bytes, { mode: 0o600 });
}

function getUploadLimitBytes(extension: string): number {
  const envName =
    extension === ".mp4" ? "MAX_VIDEO_METADATA_FILE_SIZE_MB" : "MAX_TEXT_EXTRACTION_FILE_SIZE_MB";
  const fallback = extension === ".mp4" ? 500 : 100;
  const parsed = Number.parseInt(process.env[envName] || "", 10);
  const megabytes = Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  return megabytes * 1024 * 1024;
}

export async function deleteUploadedDocument(relativePath: string): Promise<void> {
  const safeRelativePath = relativePath.split(path.sep).join("/");
  const targetPath = resolveInside(uploadedDocumentsDirectory, safeRelativePath);
  await fs.rm(targetPath, { force: true });
}

function sanitizeUploadFileName(fileName: string): string {
  const baseName = path.basename(fileName).replace(/[^\w.\- ()]/g, "_").trim();

  if (!baseName || baseName === "." || baseName === "..") {
    throw new Error("Uploaded file name is invalid.");
  }

  return baseName;
}
