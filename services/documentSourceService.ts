import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside, uploadedDocumentsDirectory } from "@/lib/paths";
import type { ApprovedDocument, DocumentIndexStatus } from "@/types/document";
import {
  getLocalApprovedDocuments,
  getLocalDocumentIndexStatus,
  getSupportedLocalDocumentExtensions,
  refreshLocalDocumentIndex
} from "./documentIndexService";

export async function getDocumentSourceStatus(): Promise<DocumentIndexStatus> {
  return getLocalDocumentIndexStatus({ force: true });
}

export async function listApprovedDocuments(options?: {
  forceRefresh?: boolean;
}): Promise<ApprovedDocument[]> {
  return getLocalApprovedDocuments({ force: options?.forceRefresh ?? true });
}

export async function refreshDocumentSourceIndex(): Promise<DocumentIndexStatus> {
  const index = await refreshLocalDocumentIndex();
  const { documents, ...status } = index;
  void documents;
  return status;
}

export async function saveUploadedDocument(file: File): Promise<void> {
  const extension = path.extname(file.name).toLowerCase();
  const supported = getSupportedLocalDocumentExtensions();

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
