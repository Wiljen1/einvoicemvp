import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { defaultDocumentsDirectory, getLocalDocumentsPath, resolveInside } from "@/lib/paths";
import type {
  ApprovedDocument,
  DocumentIndex,
  DocumentIndexStatus,
  DocumentSourceType,
  IndexedDocumentFile,
  SkippedDocumentFile
} from "@/types/document";
import {
  extractTextFromFile,
  getSupportedExtractorExtensions
} from "./documentExtractors";

const SKIPPED_DIRECTORIES = new Set(["node_modules", ".git", ".next", "dist", "build", "coverage"]);
const MAX_DOCUMENTS = 100;
const MAX_DOCUMENT_BYTES = 15_000_000;
const MAX_CONTENT_CHARS = 500_000;
const DEFAULT_MAX_DEPTH = 10;

declare global {
  var __eInvoiceDocumentIndex: DocumentIndex | undefined;
}

interface LocalIndexOptions {
  force?: boolean;
}

interface ScanContext {
  rootPath: string;
  recursive: boolean;
  maxDepth: number;
  documents: ApprovedDocument[];
  indexedFiles: IndexedDocumentFile[];
  skippedFiles: SkippedDocumentFile[];
  foundCount: number;
}

export function getSupportedLocalDocumentExtensions(): string[] {
  return getSupportedExtractorExtensions();
}

export function getLocalDocumentSourceType(): DocumentSourceType {
  return process.env.LOCAL_DOCUMENTS_PATH?.trim() ? "LOCAL_SYNCED_FOLDER" : "MOCK_FOLDER";
}

export function getLocalDocumentsRecursive(): boolean {
  return process.env.LOCAL_DOCUMENTS_RECURSIVE !== "false";
}

export function getLocalDocumentsMaxDepth(): number {
  const parsed = Number.parseInt(process.env.LOCAL_DOCUMENTS_MAX_DEPTH || "", 10);

  if (Number.isFinite(parsed)) {
    return Math.max(0, Math.min(parsed, 25));
  }

  return DEFAULT_MAX_DEPTH;
}

export async function getLocalDocumentIndexStatus(
  options?: LocalIndexOptions
): Promise<DocumentIndexStatus> {
  const index = await getLocalDocumentIndex(options);
  return toStatus(index);
}

export async function getLocalApprovedDocuments(
  options?: LocalIndexOptions
): Promise<ApprovedDocument[]> {
  const index = await getLocalDocumentIndex({ force: options?.force ?? true });
  return index.documents;
}

export async function refreshLocalDocumentIndex(): Promise<DocumentIndex> {
  const folderPath = getLocalDocumentsPath();
  const activeSource = getLocalDocumentSourceType();
  const recursive = getLocalDocumentsRecursive();
  const maxDepth = getLocalDocumentsMaxDepth();
  const indexedAt = new Date().toISOString();
  const context: ScanContext = {
    rootPath: folderPath,
    recursive,
    maxDepth,
    documents: [],
    indexedFiles: [],
    skippedFiles: [],
    foundCount: 0
  };
  let exists = false;

  await ensureDefaultDocumentsDirectory(folderPath);

  try {
    const stats = await fs.stat(folderPath);
    exists = stats.isDirectory();
  } catch {
    exists = false;
  }

  if (exists) {
    await scanDirectory(folderPath, 0, context);
  }

  const index = buildIndex({
    activeSource,
    folderPath,
    exists,
    recursive,
    maxDepth,
    indexedAt,
    documents: context.documents,
    indexedFiles: context.indexedFiles,
    skippedFiles: context.skippedFiles,
    message: buildIndexMessage(exists, context.indexedFiles.length)
  });
  saveIndex(index);
  logDocumentIndex(index, context.foundCount);
  return index;
}

export function resetDocumentIndexForTests(): void {
  globalThis.__eInvoiceDocumentIndex = undefined;
}

async function getLocalDocumentIndex(options?: LocalIndexOptions): Promise<DocumentIndex> {
  const current = globalThis.__eInvoiceDocumentIndex;
  const folderPath = getLocalDocumentsPath();

  if (!options?.force && current?.folderPath === folderPath) {
    return current;
  }

  return refreshLocalDocumentIndex();
}

async function scanDirectory(directoryPath: string, depth: number, context: ScanContext): Promise<void> {
  const entries = await fs.readdir(directoryPath, { withFileTypes: true });

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const absolutePath = resolveInside(
      context.rootPath,
      path.relative(context.rootPath, path.join(directoryPath, entry.name))
    );
    const relativePath = toRelativeDisplayPath(context.rootPath, absolutePath);
    context.foundCount += 1;

    if (entry.isSymbolicLink()) {
      pushSkipped(context, entry.name, absolutePath, relativePath, "Symbolic links are not allowed");
      continue;
    }

    if (entry.isDirectory()) {
      if (shouldSkipDirectory(entry.name)) {
        pushSkipped(context, entry.name, absolutePath, relativePath, "Hidden/system folders are not indexed");
        continue;
      }

      if (!context.recursive) {
        pushSkipped(context, entry.name, absolutePath, relativePath, "Recursive scanning is disabled");
        continue;
      }

      if (depth >= context.maxDepth) {
        pushSkipped(context, entry.name, absolutePath, relativePath, `Max folder depth ${context.maxDepth} reached`);
        continue;
      }

      await scanDirectory(absolutePath, depth + 1, context);
      continue;
    }

    if (!entry.isFile()) {
      pushSkipped(context, entry.name, absolutePath, relativePath, "Unsupported filesystem entry");
      continue;
    }

    if (isHiddenSystemFile(entry.name)) {
      pushSkipped(context, entry.name, absolutePath, relativePath, "Hidden/system files are not indexed");
      continue;
    }

    await indexFile(entry.name, absolutePath, relativePath, context);
  }
}

async function indexFile(
  fileName: string,
  absolutePath: string,
  relativePath: string,
  context: ScanContext
): Promise<void> {
  const stats = await fs.stat(absolutePath);
  const extension = path.extname(fileName).toLowerCase();

  if (stats.size > MAX_DOCUMENT_BYTES) {
    pushSkipped(
      context,
      fileName,
      absolutePath,
      relativePath,
      `File exceeds ${MAX_DOCUMENT_BYTES} byte MVP limit`
    );
    return;
  }

  if (context.documents.length >= MAX_DOCUMENTS) {
    pushSkipped(
      context,
      fileName,
      absolutePath,
      relativePath,
      `MVP indexes the first ${MAX_DOCUMENTS} readable files`
    );
    return;
  }

  const extracted = await extractTextFromFile(absolutePath);
  if ("skipped" in extracted) {
    pushSkipped(context, fileName, absolutePath, relativePath, extracted.reason);
    return;
  }

  const content = extracted.text.replace(/\s+/g, " ").trim();
  if (!content) {
    pushSkipped(context, fileName, absolutePath, relativePath, "File contains no readable text");
    return;
  }

  const id = buildDocumentId(relativePath);
  const lastModified = stats.mtime.toISOString();
  const metadata = {
    size: stats.size,
    lastModified,
    pageCount: extracted.metadata.pageCount
  };

  context.documents.push({
    id,
    fileName,
    relativePath,
    absolutePath,
    extension,
    content: content.slice(0, MAX_CONTENT_CHARS),
    sourcePath: absolutePath,
    sourceType: "LOCAL_FOLDER",
    metadata
  });
  context.indexedFiles.push({
    id,
    fileName,
    relativePath,
    absolutePath,
    extension,
    path: absolutePath,
    size: stats.size,
    lastModified,
    sourceType: "LOCAL_FOLDER",
    metadata
  });
}

async function ensureDefaultDocumentsDirectory(folderPath: string): Promise<void> {
  if (
    process.env.NODE_ENV !== "production" &&
    !process.env.LOCAL_DOCUMENTS_PATH?.trim() &&
    folderPath === defaultDocumentsDirectory
  ) {
    await fs.mkdir(folderPath, { recursive: true });
  }
}

function buildIndex(input: {
  activeSource: DocumentSourceType;
  folderPath: string;
  exists: boolean;
  recursive: boolean;
  maxDepth: number;
  indexedAt: string;
  documents: ApprovedDocument[];
  indexedFiles: IndexedDocumentFile[];
  skippedFiles: SkippedDocumentFile[];
  message: string;
}): DocumentIndex {
  return {
    activeSource: input.activeSource,
    folderPath: input.folderPath,
    exists: input.exists,
    available: input.exists,
    recursive: input.recursive,
    maxDepth: input.maxDepth,
    supportedExtensions: getSupportedLocalDocumentExtensions(),
    indexedFiles: input.indexedFiles,
    skippedFiles: input.skippedFiles,
    fileCount: input.indexedFiles.length,
    skippedFileCount: input.skippedFiles.length,
    indexedCount: input.indexedFiles.length,
    skippedCount: input.skippedFiles.length,
    lastIndexedAt: input.indexedAt,
    message: input.message,
    documents: input.documents
  };
}

function saveIndex(index: DocumentIndex): void {
  globalThis.__eInvoiceDocumentIndex = index;
}

function toStatus(index: DocumentIndex): DocumentIndexStatus {
  const { documents, ...status } = index;
  void documents;
  return status;
}

function buildIndexMessage(exists: boolean, indexedFiles: number): string {
  if (!exists) {
    return "Local documents folder was not found.";
  }

  if (indexedFiles > 0) {
    return "Local documents connected";
  }

  return "No readable documents found. Add .txt, .md, .json, .csv, or .pdf files to the folder above, then click Refresh Documents.";
}

function pushSkipped(
  context: ScanContext,
  fileName: string,
  absolutePath: string,
  relativePath: string,
  reason: string
): void {
  context.skippedFiles.push({
    fileName,
    relativePath,
    absolutePath,
    extension: path.extname(fileName).toLowerCase(),
    path: absolutePath,
    reason
  });
}

function shouldSkipDirectory(name: string): boolean {
  return SKIPPED_DIRECTORIES.has(name) || name.startsWith(".");
}

function isHiddenSystemFile(name: string): boolean {
  return name.startsWith(".");
}

function toRelativeDisplayPath(rootPath: string, absolutePath: string): string {
  return path.relative(rootPath, absolutePath).split(path.sep).join("/");
}

function buildDocumentId(relativePath: string): string {
  return crypto.createHash("sha1").update(relativePath).digest("hex").slice(0, 16);
}

function logDocumentIndex(index: DocumentIndex, foundCount: number): void {
  console.info(
    [
      "[documents]",
      `activeSource=${index.activeSource}`,
      `folderPath=${index.folderPath}`,
      `recursive=${index.recursive}`,
      `maxDepth=${index.maxDepth}`,
      `exists=${index.exists}`,
      `found=${foundCount}`,
      `indexed=${index.fileCount}`,
      `skipped=${index.skippedFileCount}`
    ].join(" ")
  );

  for (const skipped of index.skippedFiles.slice(0, 10)) {
    console.info(`[documents] skipped ${skipped.relativePath}: ${skipped.reason}`);
  }
}
