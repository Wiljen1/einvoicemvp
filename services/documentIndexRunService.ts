import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside, uploadedDocumentsDirectory } from "@/lib/paths";
import type {
  ActiveDocumentSourceType,
  DocumentIndexStatus,
  IndexedDocumentFile,
  SkippedDocumentFile,
  StartupValidationStatus
} from "@/types/document";
import {
  extractTextFromFile,
  getRegisteredExtractorNames,
  getSupportedExtractorExtensions
} from "./documentExtractors";
import { getActiveDocumentSourceConfig } from "./documentSourceConfigService";
import {
  createIndexRun,
  getIndexCounts,
  getIndexRun,
  getOrCreateDocumentSource,
  listDocumentSources,
  listDocumentsBySource,
  markDocumentMissing,
  replaceDocumentChunks,
  updateDocumentSourceScannedAt,
  updateIndexRun,
  upsertIndexedDocument,
  validateIndexDatabaseConnection,
  type DocumentSourceRecord,
  type ExtractionMode,
  type IndexRunRecord
} from "./indexDatabaseService";
import { getOcrConfig, isLocalOcrEnabled } from "./ocrService";

const SKIPPED_DIRECTORIES = new Set(["node_modules", ".git", ".next", "dist", "build", "coverage"]);
const CHUNK_SIZE = 900;
const CHUNK_OVERLAP = 120;
const DEFAULT_MAX_DEPTH = 10;

declare global {
  var __knowledgeAssistantIndexRuns: Map<string, IndexRunProgress> | undefined;
  var __knowledgeAssistantStartupIndexTriggered: boolean | undefined;
}

interface ScannedFile {
  fileName: string;
  relativePath: string;
  absolutePath: string;
  extension: string;
  sizeBytes: number;
  modifiedAt: string;
}

interface ScanContext {
  rootPath: string;
  recursive: boolean;
  maxDepth: number;
  files: ScannedFile[];
  skippedFiles: SkippedDocumentFile[];
}

export interface IndexRunProgress extends IndexRunRecord {
  progress: number;
  currentFile: string | null;
  currentAction: string;
  cancelled: boolean;
}

export interface IndexStatus {
  source: {
    id: string;
    type: ActiveDocumentSourceType;
    displayName: string;
    rootPath: string;
    normalizedRootPath: string;
    sourceKey: string;
    lastScannedAt: string | null;
  };
  activeSource: {
    id: string;
    type: ActiveDocumentSourceType;
    displayName: string;
    rootPath: string;
    normalizedRootPath: string;
    sourceKey: string;
    lastScannedAt: string | null;
  };
  knownSources: KnownDocumentSourceStatus[];
  index: {
    status: "FRESH" | "STALE" | "EMPTY";
    lastIndexedAt: string | null;
    indexedDocuments: number;
    indexedChunks: number;
    activeDocuments: number;
    activeChunks: number;
    needsUpdate: boolean;
    newFiles: number;
    changedFiles: number;
    deletedFiles: number;
    chatExcludedDocuments: number;
    indexExcludedDocuments: number;
    failedDocuments: number;
    skippedDocuments: number;
    ocrEnabled: boolean;
    startupValidation: StartupValidationStatus;
    lastRun: IndexRunProgress | null;
  };
}

export interface KnownDocumentSourceStatus {
  id: string;
  type: ActiveDocumentSourceType;
  displayName: string;
  rootPath: string;
  normalizedRootPath: string;
  sourceKey: string;
  lastScannedAt: string | null;
  indexedDocuments: number;
  activeDocuments: number;
  excludedFromChat: number;
  excludedFromIndexing: number;
  needsUpdate: boolean;
  newFiles: number;
  changedFiles: number;
  deletedFiles: number;
  exists: boolean;
}

export async function getActiveIndexStatus(options?: { checkForUpdates?: boolean }): Promise<IndexStatus> {
  const source = await ensureActiveDocumentSource();
  const counts = getIndexCounts(source.id);
  const documents = listDocumentsBySource(source.id);
  const changes = options?.checkForUpdates === false ? emptyChanges() : await detectSourceChanges(source);
  const needsUpdate = changes.newFiles > 0 || changes.changedFiles > 0 || changes.deletedFiles > 0;
  const isEmpty = counts.indexedDocuments === 0;
  const lastRun = getLatestInMemoryRun(source.id);
  const validation = await buildStartupValidation(source);
  const activeSource = toPublicSource(source);
  const knownSources = await listKnownDocumentSources();

  maybeAutoStartIndex(source, needsUpdate, isEmpty);

  return {
    source: activeSource,
    activeSource,
    knownSources,
    index: {
      status: isEmpty ? "EMPTY" : needsUpdate ? "STALE" : "FRESH",
      lastIndexedAt: source.lastScannedAt || latestIndexedAt(documents),
      indexedDocuments: counts.indexedDocuments,
      indexedChunks: counts.indexedChunks,
      activeDocuments: counts.activeDocuments,
      activeChunks: counts.activeChunks,
      needsUpdate,
      newFiles: changes.newFiles,
      changedFiles: changes.changedFiles,
      deletedFiles: changes.deletedFiles,
      chatExcludedDocuments: counts.chatExcludedDocuments,
      indexExcludedDocuments: counts.indexExcludedDocuments,
      failedDocuments: counts.failedDocuments,
      skippedDocuments: counts.skippedDocuments,
      ocrEnabled: isLocalOcrEnabled(),
      startupValidation: validation,
      lastRun
    }
  };
}

export async function listKnownDocumentSources(): Promise<KnownDocumentSourceStatus[]> {
  const sources = listDocumentSources();
  const statuses = await Promise.all(
    sources.map(async (source) => {
      const counts = getIndexCounts(source.id);
      const changes = await detectSourceChanges(source);

      return {
        id: source.id,
        type: source.type,
        displayName: source.displayName,
        rootPath: source.rootPath,
        normalizedRootPath: source.normalizedRootPath,
        sourceKey: source.sourceKey,
        lastScannedAt: source.lastScannedAt,
        indexedDocuments: counts.indexedDocuments,
        activeDocuments: counts.activeDocuments,
        excludedFromChat: counts.chatExcludedDocuments,
        excludedFromIndexing: counts.indexExcludedDocuments,
        needsUpdate: changes.newFiles > 0 || changes.changedFiles > 0 || changes.deletedFiles > 0,
        newFiles: changes.newFiles,
        changedFiles: changes.changedFiles,
        deletedFiles: changes.deletedFiles,
        exists: await directoryExists(source.rootPath)
      };
    })
  );

  return statuses;
}

export async function getDocumentIndexStatus(): Promise<DocumentIndexStatus> {
  const source = await ensureActiveDocumentSource();
  const counts = getIndexCounts(source.id);
  const documents = listDocumentsBySource(source.id);
  const changes = await detectSourceChanges(source);
  const indexedFiles = documents
    .filter((document) => document.isMissing === 0 && ["INDEXED", "PARTIAL"].includes(document.extractionStatus))
    .map((document) => toIndexedFile(document, source.type));
  const skippedFiles = documents
    .filter((document) => document.isMissing === 0 && document.extractionStatus === "SKIPPED")
    .map(toSkippedFile);
  const failedFiles = documents
    .filter((document) => document.isMissing === 0 && document.extractionStatus === "FAILED")
    .map(toSkippedFile);
  const ocrFailedFiles = indexedFiles
    .filter((file) => file.metadata.ocrAttempted && !file.metadata.ocrProcessed)
    .map((file) => ({
      fileName: file.fileName,
      relativePath: file.relativePath,
      extension: file.extension,
      reason: file.metadata.ocrFailureReason || "OCR did not produce readable text."
    }));

  return {
    activeSource: source.type,
    displayName: source.displayName,
    folderPath: source.rootPath,
    folderUrl: null,
    exists: await directoryExists(source.rootPath),
    available: counts.indexedDocuments > 0 || (await directoryExists(source.rootPath)),
    recursive: getLocalDocumentsRecursive(),
    maxDepth: getLocalDocumentsMaxDepth(),
    supportedExtensions: getSupportedExtractorExtensions(),
    indexedFiles,
    skippedFiles: [...skippedFiles, ...failedFiles],
    fileCount: indexedFiles.length,
    activeFileCount: indexedFiles.filter((file) => !file.excludedFromChat).length,
    chatExcludedFileCount: indexedFiles.filter((file) => file.excludedFromChat).length,
    indexExcludedFileCount: indexedFiles.filter((file) => file.excludedFromIndexing).length,
    skippedFileCount: skippedFiles.length + failedFiles.length,
    failedFileCount: failedFiles.length,
    indexedCount: indexedFiles.length,
    skippedCount: skippedFiles.length,
    ocrEnabled: isLocalOcrEnabled(),
    ocrProcessedCount: indexedFiles.filter((file) => file.metadata.ocrProcessed).length,
    ocrFailedFiles,
    startupValidation: await buildStartupValidation(source),
    lastIndexedAt: source.lastScannedAt || "",
    message:
      counts.indexedDocuments === 0
        ? "No documents are indexed yet. Please run Scan / Update Document Index first."
        : changes.newFiles || changes.changedFiles || changes.deletedFiles
          ? "Document updates detected. Reindex recommended."
          : "Document index ready"
  };
}

export async function startIndexRun(): Promise<IndexRunProgress> {
  const source = await ensureActiveDocumentSource();
  await ensureIndexableDirectory(source.rootPath, source.type);

  if (!(await directoryExists(source.rootPath))) {
    throw new Error("No active document source configured. Please select a local or synced SharePoint folder first.");
  }

  const run = createIndexRun(source.id);
  const progress = toProgress(run, 0, null, "Queued");
  getRunStore().set(run.id, progress);
  void executeIndexRun(source, progress);
  return progress;
}

export function getIndexRunProgress(runId: string): IndexRunProgress | null {
  return getRunStore().get(runId) || (getIndexRun(runId) ? toProgress(getIndexRun(runId) as IndexRunRecord) : null);
}

export function cancelIndexRun(runId: string): IndexRunProgress | null {
  const progress = getRunStore().get(runId);

  if (progress) {
    progress.cancelled = true;
    progress.status = "CANCELLED";
    progress.currentAction = "Index run cancelled";
    progress.completedAt = new Date().toISOString();
    updateIndexRun(runId, {
      status: "CANCELLED",
      completedAt: progress.completedAt,
      filesScanned: progress.filesScanned,
      filesIndexed: progress.filesIndexed,
      filesUpdated: progress.filesUpdated,
      filesSkipped: progress.filesSkipped,
      filesFailed: progress.filesFailed,
      ocrProcessed: progress.ocrProcessed,
      error: "Index run cancelled"
    });
    return progress;
  }

  const run = getIndexRun(runId);
  if (!run) {
    return null;
  }

  return toProgress(updateIndexRun(runId, {
    status: "CANCELLED",
    completedAt: new Date().toISOString(),
    error: "Index run cancelled"
  }));
}

export async function listIndexedDocumentsForActiveSource(): Promise<IndexedDocumentFile[]> {
  const source = await ensureActiveDocumentSource();
  return listDocumentsBySource(source.id)
    .filter((document) => document.isMissing === 0 && ["INDEXED", "PARTIAL"].includes(document.extractionStatus))
    .map((document) => toIndexedFile(document, source.type));
}

async function executeIndexRun(source: DocumentSourceRecord, progress: IndexRunProgress): Promise<void> {
  try {
    updateProgress(progress, { status: "RUNNING", currentAction: "Scanning document source", progress: 2 });
    const scan = await scanDocumentSource(source.rootPath);
    const scannedRelativePaths = new Set(scan.files.map((file) => file.relativePath));
    const existingDocuments = listDocumentsBySource(source.id);
    const existingByPath = new Map(existingDocuments.map((document) => [document.relativePath, document]));
    const totalWork = Math.max(1, scan.files.length + existingDocuments.length);
    let processed = 0;

    for (const skipped of scan.skippedFiles) {
      progress.filesSkipped += 1;
      processed += 1;
      updateProgress(progress, {
        currentFile: skipped.relativePath,
        currentAction: skipped.reason,
        progress: percent(processed, totalWork)
      });
    }

    for (const existing of existingDocuments) {
      if (progress.cancelled) {
        throw new IndexRunCancelledError();
      }

      if (!scannedRelativePaths.has(existing.relativePath) && existing.isMissing === 0) {
        markDocumentMissing(existing.id);
        progress.filesUpdated += 1;
      }
    }

    for (const file of scan.files) {
      if (progress.cancelled) {
        throw new IndexRunCancelledError();
      }

      progress.filesScanned += 1;
      processed += 1;
      updateProgress(progress, {
        currentFile: file.relativePath,
        currentAction: "Checking file changes",
        progress: percent(processed, totalWork)
      });

      const existing = existingByPath.get(file.relativePath);
      if (existing?.excludedFromIndexing === 1) {
        progress.filesSkipped += 1;
        updateProgress(progress, {
          currentFile: file.relativePath,
          currentAction: "Skipped because the document is excluded from future indexing",
          progress: percent(processed, totalWork)
        });
        updateRunCounts(progress);
        continue;
      }

      const unchanged =
        existing &&
        existing.isMissing === 0 &&
        existing.sizeBytes === file.sizeBytes &&
        existing.modifiedAt === file.modifiedAt;

      if (unchanged && !shouldReprocessExistingDocument(existing, file)) {
        progress.filesSkipped += 1;
        updateRunCounts(progress);
        continue;
      }

      const checksum = await checksumFile(file.absolutePath);
      if (
        existing &&
        existing.checksum === checksum &&
        existing.isMissing === 0 &&
        !shouldReprocessExistingDocument(existing, file)
      ) {
        progress.filesSkipped += 1;
        updateRunCounts(progress);
        continue;
      }

      await indexFile(source.id, file, checksum, progress, Boolean(existing));
      updateRunCounts(progress);
    }

    const completedAt = new Date().toISOString();
    updateDocumentSourceScannedAt(source.id, completedAt);
    updateProgress(progress, {
      status: "COMPLETED",
      completedAt,
      progress: 100,
      currentFile: null,
      currentAction: "Completed"
    });
    updateRunCounts(progress);
    getRunStore().delete(progress.id);
  } catch (error) {
    const completedAt = new Date().toISOString();
    const status = error instanceof IndexRunCancelledError ? "CANCELLED" : "FAILED";
    const message = error instanceof Error ? error.message : "Unable to update document index.";
    updateProgress(progress, {
      status,
      completedAt,
      currentAction: status === "CANCELLED" ? "Index run cancelled" : "Index run failed",
      error: message
    });
    updateRunCounts(progress);
    getRunStore().delete(progress.id);
  }
}

async function indexFile(
  sourceId: string,
  file: ScannedFile,
  checksum: string,
  progress: IndexRunProgress,
  isUpdate: boolean
): Promise<void> {
  updateProgress(progress, {
    currentFile: file.relativePath,
    currentAction: shouldOcrLikely(file.extension) ? `Extracting/OCR: ${file.fileName}` : `Extracting: ${file.fileName}`
  });

  try {
    const extracted = await extractTextFromFile({
      filePath: file.absolutePath,
      fileName: file.fileName,
      relativePath: file.relativePath,
      size: file.sizeBytes
    });

    if ("skipped" in extracted) {
      upsertIndexedDocument({
        ...file,
        sourceId,
        checksum,
        extractionStatus: "SKIPPED",
        extractionMode: "METADATA_ONLY",
        indexedMode: "PARTIAL_METADATA",
        indexedAt: new Date().toISOString(),
        error: extracted.reason,
        metadataJson: JSON.stringify({ reason: extracted.reason })
      });
      progress.filesSkipped += 1;
      return;
    }

    const text = extracted.text.replace(/\s+/g, " ").trim();
    const metadata = {
      ...extracted.metadata,
      size: file.sizeBytes,
      lastModified: file.modifiedAt
    };
    const document = upsertIndexedDocument({
      ...file,
      sourceId,
      checksum,
      extractionStatus: extracted.indexedMode === "PARTIAL_METADATA" ? "PARTIAL" : "INDEXED",
      extractionMode: toExtractionMode(extracted.indexedMode),
      indexedMode: extracted.indexedMode,
      indexedAt: new Date().toISOString(),
      error: null,
      metadataJson: JSON.stringify(metadata)
    });

    replaceDocumentChunks(document.id, chunkText(text));
    if (isUpdate) {
      progress.filesUpdated += 1;
    } else {
      progress.filesIndexed += 1;
    }
    if (extracted.metadata.ocrProcessed) {
      progress.ocrProcessed += 1;
    }
  } catch (error) {
    upsertIndexedDocument({
      ...file,
      sourceId,
      checksum,
      extractionStatus: "FAILED",
      extractionMode: "METADATA_ONLY",
      indexedMode: "PARTIAL_METADATA",
      indexedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : "Extraction failed.",
      metadataJson: JSON.stringify({ error: error instanceof Error ? error.message : "Extraction failed." })
    });
    progress.filesFailed += 1;
  }
}

async function scanDocumentSource(rootPath: string): Promise<ScanContext> {
  const context: ScanContext = {
    rootPath,
    recursive: getLocalDocumentsRecursive(),
    maxDepth: getLocalDocumentsMaxDepth(),
    files: [],
    skippedFiles: []
  };

  await ensureIndexableDirectory(rootPath);
  if (await directoryExists(rootPath)) {
    await scanDirectory(rootPath, 0, context);
  }

  return context;
}

async function scanDirectory(directoryPath: string, depth: number, context: ScanContext): Promise<void> {
  const entries = await fs.readdir(directoryPath, { withFileTypes: true });

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const absolutePath = resolveInside(
      context.rootPath,
      path.relative(context.rootPath, path.join(directoryPath, entry.name))
    );
    const relativePath = toRelativeDisplayPath(context.rootPath, absolutePath);

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

    const stats = await fs.stat(absolutePath);
    context.files.push({
      fileName: entry.name,
      relativePath,
      absolutePath,
      extension: path.extname(entry.name).toLowerCase(),
      sizeBytes: stats.size,
      modifiedAt: stats.mtime.toISOString()
    });
  }
}

async function detectSourceChanges(source: DocumentSourceRecord): Promise<{
  newFiles: number;
  changedFiles: number;
  deletedFiles: number;
}> {
  if (!(await directoryExists(source.rootPath))) {
    return emptyChanges();
  }

  const scan = await scanDocumentSource(source.rootPath);
  const currentByPath = new Map(scan.files.map((file) => [file.relativePath, file]));
  const existing = listDocumentsBySource(source.id).filter((document) => document.isMissing === 0);
  const existingByPath = new Map(existing.map((document) => [document.relativePath, document]));
  let newFiles = 0;
  let changedFiles = 0;
  let deletedFiles = 0;

  for (const file of scan.files) {
    const prior = existingByPath.get(file.relativePath);
    if (!prior) {
      newFiles += 1;
    } else if (prior.sizeBytes !== file.sizeBytes || prior.modifiedAt !== file.modifiedAt) {
      changedFiles += 1;
    }
  }

  for (const document of existing) {
    if (!currentByPath.has(document.relativePath)) {
      deletedFiles += 1;
    }
  }

  return { newFiles, changedFiles, deletedFiles };
}

export async function ensureActiveDocumentSource(): Promise<DocumentSourceRecord> {
  const source = await getActiveDocumentSourceConfig();
  return getOrCreateDocumentSource({
    type: source.mode,
    displayName: source.displayName,
    rootPath: source.folderPath
  });
}

function toPublicSource(source: DocumentSourceRecord): IndexStatus["source"] {
  return {
    id: source.id,
    type: source.type,
    displayName: source.displayName,
    rootPath: source.rootPath,
    normalizedRootPath: source.normalizedRootPath,
    sourceKey: source.sourceKey,
    lastScannedAt: source.lastScannedAt
  };
}

async function ensureIndexableDirectory(
  folderPath: string,
  activeSource?: ActiveDocumentSourceType
): Promise<void> {
  if (
    process.env.NODE_ENV !== "production" &&
    (folderPath === uploadedDocumentsDirectory || activeSource === "MANUAL_UPLOAD")
  ) {
    await fs.mkdir(folderPath, { recursive: true });
  }
}

function getRunStore(): Map<string, IndexRunProgress> {
  if (!globalThis.__knowledgeAssistantIndexRuns) {
    globalThis.__knowledgeAssistantIndexRuns = new Map();
  }

  return globalThis.__knowledgeAssistantIndexRuns;
}

function updateProgress(progress: IndexRunProgress, patch: Partial<IndexRunProgress>): void {
  Object.assign(progress, patch);
  updateRunCounts(progress);
}

function updateRunCounts(progress: IndexRunProgress): void {
  updateIndexRun(progress.id, {
    status: progress.status,
    completedAt: progress.completedAt,
    filesScanned: progress.filesScanned,
    filesIndexed: progress.filesIndexed,
    filesUpdated: progress.filesUpdated,
    filesSkipped: progress.filesSkipped,
    filesFailed: progress.filesFailed,
    ocrProcessed: progress.ocrProcessed,
    error: progress.error
  });
}

function toProgress(
  run: IndexRunRecord,
  progress = run.status === "COMPLETED" ? 100 : 0,
  currentFile: string | null = null,
  currentAction: string = run.status
): IndexRunProgress {
  return {
    ...run,
    progress,
    currentFile,
    currentAction,
    cancelled: run.status === "CANCELLED"
  };
}

function latestIndexedAt(documents: Array<{ indexedAt: string | null }>): string | null {
  return documents
    .map((document) => document.indexedAt)
    .filter(Boolean)
    .sort()
    .at(-1) || null;
}

function getLatestInMemoryRun(sourceId: string): IndexRunProgress | null {
  return (
    Array.from(getRunStore().values())
      .filter((run) => run.sourceId === sourceId)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0] || null
  );
}

function maybeAutoStartIndex(source: DocumentSourceRecord, needsUpdate: boolean, isEmpty: boolean): void {
  if (process.env.AUTO_INDEX_ON_STARTUP !== "true" || globalThis.__knowledgeAssistantStartupIndexTriggered) {
    return;
  }

  if (!needsUpdate && !isEmpty) {
    return;
  }

  globalThis.__knowledgeAssistantStartupIndexTriggered = true;
  const running = Array.from(getRunStore().values()).some(
    (run) => run.sourceId === source.id && ["QUEUED", "RUNNING"].includes(run.status)
  );

  if (!running) {
    void startIndexRun();
  }
}

function toIndexedFile(
  document: import("./indexDatabaseService").IndexedDocumentRecord,
  sourceType: ActiveDocumentSourceType
): IndexedDocumentFile {
  const metadata = parseMetadata(document.metadataJson);
  return {
    id: document.id,
    fileName: document.fileName,
    relativePath: document.relativePath,
    absolutePath: document.absolutePath,
    extension: document.extension,
    path: document.absolutePath,
    size: document.sizeBytes,
    lastModified: document.modifiedAt,
    sourceType,
    indexedMode: document.indexedMode,
    excludedFromChat: document.excludedFromChat === 1,
    excludedFromIndexing: document.excludedFromIndexing === 1,
    exclusionReason: document.exclusionReason,
    excludedAt: document.excludedAt,
    excludedBy: document.excludedBy,
    metadata: {
      size: document.sizeBytes,
      lastModified: document.modifiedAt,
      ...metadata
    }
  };
}

function toSkippedFile(document: import("./indexDatabaseService").IndexedDocumentRecord): SkippedDocumentFile {
  return {
    fileName: document.fileName,
    relativePath: document.relativePath,
    absolutePath: document.absolutePath,
    extension: document.extension,
    path: document.absolutePath,
    reason: document.error || "File was not indexed."
  };
}

function parseMetadata(value: string | null): Record<string, never> | Record<string, unknown> {
  if (!value) {
    return {};
  }

  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function chunkText(text: string): Array<{ chunkIndex: number; text: string; tokenEstimate: number }> {
  const normalized = text.replace(/\s+/g, " ").trim();
  const chunks: Array<{ chunkIndex: number; text: string; tokenEstimate: number }> = [];

  for (let start = 0; start < normalized.length; start += CHUNK_SIZE - CHUNK_OVERLAP) {
    const snippet = normalized.slice(start, start + CHUNK_SIZE).trim();
    if (snippet) {
      chunks.push({
        chunkIndex: chunks.length,
        text: snippet,
        tokenEstimate: Math.ceil(snippet.length / 4)
      });
    }
  }

  return chunks;
}

function toExtractionMode(indexedMode: string): ExtractionMode {
  if (indexedMode === "OCR_TEXT") {
    return "OCR";
  }

  if (indexedMode === "PARTIAL_METADATA") {
    return "METADATA_ONLY";
  }

  if (indexedMode === "TRANSCRIPT_LINKED") {
    return "MIXED";
  }

  return "TEXT";
}

async function checksumFile(filePath: string): Promise<string> {
  const hash = crypto.createHash("sha1");
  hash.update(await fs.readFile(filePath));
  return hash.digest("hex");
}

function shouldOcrLikely(extension: string): boolean {
  return isLocalOcrEnabled() && [".pdf", ".png", ".jpg", ".jpeg"].includes(extension);
}

function shouldReprocessExistingDocument(
  document: import("./indexDatabaseService").IndexedDocumentRecord,
  file: ScannedFile
): boolean {
  const supportedExtensions = getSupportedExtractorExtensions();

  if (!supportedExtensions.includes(file.extension)) {
    return false;
  }

  if (document.extractionStatus === "SKIPPED" && document.error?.includes("Unsupported file type")) {
    return true;
  }

  if (!shouldOcrLikely(file.extension)) {
    return false;
  }

  const metadata = parseMetadata(document.metadataJson);
  return document.indexedMode === "PARTIAL_METADATA" && metadata["ocrAttempted"] === false;
}

export function getLocalDocumentsRecursive(): boolean {
  return process.env.LOCAL_DOCUMENTS_RECURSIVE !== "false";
}

export function getLocalDocumentsMaxDepth(): number {
  const parsed = Number.parseInt(process.env.LOCAL_DOCUMENTS_MAX_DEPTH || "", 10);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(parsed, 25)) : DEFAULT_MAX_DEPTH;
}

async function directoryExists(folderPath: string): Promise<boolean> {
  try {
    const stats = await fs.stat(folderPath);
    return stats.isDirectory();
  } catch {
    return false;
  }
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
  return name.startsWith(".") || name.startsWith("~$");
}

function toRelativeDisplayPath(rootPath: string, absolutePath: string): string {
  return path.relative(rootPath, absolutePath).split(path.sep).join("/");
}

function percent(processed: number, total: number): number {
  return Math.min(98, Math.max(2, Math.round((processed / Math.max(1, total)) * 100)));
}

function emptyChanges(): { newFiles: number; changedFiles: number; deletedFiles: number } {
  return {
    newFiles: 0,
    changedFiles: 0,
    deletedFiles: 0
  };
}

async function buildStartupValidation(source: DocumentSourceRecord): Promise<StartupValidationStatus> {
  const ocrConfig = getOcrConfig();
  const sourceExists = await directoryExists(source.rootPath);
  const warnings: string[] = [];

  if (!ocrConfig.enabled) {
    warnings.push("OCR service is disabled. Scanned documents may not be searchable.");
  }

  if (!sourceExists) {
    warnings.push("Active document source folder is not accessible.");
  }

  const database = validateIndexDatabaseConnection();
  if (!database.connected) {
    warnings.push("Local index database is not available.");
  }

  return {
    database,
    ocrService: {
      loaded: true,
      enabled: ocrConfig.enabled,
      message: ocrConfig.enabled
        ? `OCR service enabled (${ocrConfig.language})`
        : "OCR service is disabled. Scanned documents may not be searchable."
    },
    activeSource: {
      available: sourceExists,
      type: source.type,
      rootPath: source.rootPath,
      message: sourceExists ? "Active document source accessible" : "Active document source is not accessible"
    },
    extractors: {
      registered: getRegisteredExtractorNames(),
      supportedExtensions: getSupportedExtractorExtensions()
    },
    warnings
  };
}

class IndexRunCancelledError extends Error {
  constructor() {
    super("Index run cancelled");
  }
}
