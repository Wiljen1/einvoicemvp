import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { dataDirectory, getIndexDatabasePath } from "@/lib/paths";
import type { ActiveDocumentSourceType, DocumentIndexedMode } from "@/types/document";

type QueryValue = string | number | null;

export type ExtractionStatus = "PENDING" | "INDEXED" | "PARTIAL" | "FAILED" | "SKIPPED";
export type ExtractionMode = "TEXT" | "OCR" | "METADATA_ONLY" | "MIXED";
export type IndexRunStatus = "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";

export interface DocumentSourceRecord {
  id: string;
  type: ActiveDocumentSourceType;
  displayName: string;
  rootPath: string;
  normalizedRootPath: string;
  sourceKey: string;
  enabled: number;
  createdAt: string;
  updatedAt: string;
  lastScannedAt: string | null;
}

export interface IndexedDocumentRecord {
  id: string;
  sourceId: string;
  fileName: string;
  relativePath: string;
  absolutePath: string;
  extension: string;
  sizeBytes: number;
  modifiedAt: string;
  checksum: string;
  extractionStatus: ExtractionStatus;
  extractionMode: ExtractionMode;
  indexedMode: DocumentIndexedMode;
  indexedAt: string | null;
  error: string | null;
  metadataJson: string | null;
  isMissing: number;
  excludedFromChat: number;
  excludedFromIndexing: number;
  exclusionReason: string | null;
  excludedAt: string | null;
  excludedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentChunkRecord {
  id: string;
  documentId: string;
  chunkIndex: number;
  text: string;
  pageNumber: number | null;
  slideNumber: number | null;
  sheetName: string | null;
  tokenEstimate: number | null;
  createdAt: string;
}

export interface IndexRunRecord {
  id: string;
  sourceId: string;
  status: IndexRunStatus;
  startedAt: string;
  completedAt: string | null;
  filesScanned: number;
  filesIndexed: number;
  filesUpdated: number;
  filesSkipped: number;
  filesFailed: number;
  ocrProcessed: number;
  error: string | null;
}

export interface SearchableChunkRecord extends DocumentChunkRecord {
  fileName: string;
  relativePath: string;
  absolutePath: string;
  extension: string;
  metadataJson: string | null;
  indexedMode: DocumentIndexedMode;
  excludedFromChat: number;
  excludedFromIndexing: number;
}

let database: DatabaseSync | null = null;

export function getIndexDatabase(): DatabaseSync {
  if (database) {
    return database;
  }

  const indexDatabasePath = getIndexDatabasePath();
  fs.mkdirSync(path.dirname(indexDatabasePath), { recursive: true });
  fs.mkdirSync(dataDirectory, { recursive: true });
  database = new DatabaseSync(indexDatabasePath);
  database.exec("PRAGMA foreign_keys = ON;");
  initializeSchema(database);
  return database;
}

export function validateIndexDatabaseConnection(): { connected: boolean; message: string } {
  try {
    getIndexDatabase().prepare("SELECT 1 AS ok").get();
    return {
      connected: true,
      message: "Local index database connected"
    };
  } catch (error) {
    return {
      connected: false,
      message: error instanceof Error ? error.message : "Local index database is unavailable"
    };
  }
}

export function resetIndexDatabaseForTests(): void {
  database?.close();
  database = null;

  if (process.env.NODE_ENV === "test" && process.env.INDEX_DATABASE_PATH) {
    try {
      fs.rmSync(getIndexDatabasePath(), { force: true });
    } catch {
      // Test cleanup is best-effort.
    }
  }
}

export function getOrCreateDocumentSource(input: {
  type: ActiveDocumentSourceType;
  displayName: string;
  rootPath: string;
}): DocumentSourceRecord {
  const db = getIndexDatabase();
  const now = new Date().toISOString();
  const normalizedRootPath = normalizeSourceRootPath(input.rootPath);
  const sourceKey = buildSourceKey(input.type, normalizedRootPath);
  const existing = db
    .prepare("SELECT * FROM DocumentSource WHERE sourceKey = ? LIMIT 1")
    .get(sourceKey) as DocumentSourceRecord | undefined;

  if (existing) {
    if (
      existing.displayName !== input.displayName ||
      existing.rootPath !== input.rootPath ||
      existing.normalizedRootPath !== normalizedRootPath ||
      existing.enabled !== 1
    ) {
      db.prepare(
        `UPDATE DocumentSource SET
          displayName = ?,
          rootPath = ?,
          normalizedRootPath = ?,
          sourceKey = ?,
          enabled = 1,
          updatedAt = ?
         WHERE id = ?`
      ).run(input.displayName, input.rootPath, normalizedRootPath, sourceKey, now, existing.id);
    }
    return getDocumentSourceById(existing.id) as DocumentSourceRecord;
  }

  const id = cryptoRandomId();
  db.prepare(
    `INSERT INTO DocumentSource
      (id, type, displayName, rootPath, normalizedRootPath, sourceKey, enabled, createdAt, updatedAt, lastScannedAt)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, NULL)`
  ).run(id, input.type, input.displayName, input.rootPath, normalizedRootPath, sourceKey, now, now);

  return getDocumentSourceById(id) as DocumentSourceRecord;
}

export function listDocumentSources(): DocumentSourceRecord[] {
  return getIndexDatabase()
    .prepare("SELECT * FROM DocumentSource ORDER BY updatedAt DESC, rootPath ASC")
    .all() as unknown as DocumentSourceRecord[];
}

export function deleteDocumentSource(sourceId: string): boolean {
  const result = getIndexDatabase().prepare("DELETE FROM DocumentSource WHERE id = ?").run(sourceId);
  return result.changes > 0;
}

export function getDocumentSourceById(id: string): DocumentSourceRecord | null {
  return (
    (getIndexDatabase().prepare("SELECT * FROM DocumentSource WHERE id = ?").get(id) as
      | DocumentSourceRecord
      | undefined) || null
  );
}

export function updateDocumentSourceScannedAt(sourceId: string, scannedAt: string): void {
  getIndexDatabase()
    .prepare("UPDATE DocumentSource SET lastScannedAt = ?, updatedAt = ? WHERE id = ?")
    .run(scannedAt, scannedAt, sourceId);
}

export function listDocumentsBySource(sourceId: string): IndexedDocumentRecord[] {
  return getIndexDatabase()
    .prepare("SELECT * FROM IndexedDocument WHERE sourceId = ? ORDER BY relativePath")
    .all(sourceId) as unknown as IndexedDocumentRecord[];
}

export function getDocumentByRelativePath(
  sourceId: string,
  relativePath: string
): IndexedDocumentRecord | null {
  return (
    (getIndexDatabase()
      .prepare("SELECT * FROM IndexedDocument WHERE sourceId = ? AND relativePath = ?")
      .get(sourceId, relativePath) as unknown as IndexedDocumentRecord | undefined) || null
  );
}

export function upsertIndexedDocument(input: {
  sourceId: string;
  fileName: string;
  relativePath: string;
  absolutePath: string;
  extension: string;
  sizeBytes: number;
  modifiedAt: string;
  checksum: string;
  extractionStatus: ExtractionStatus;
  extractionMode: ExtractionMode;
  indexedMode: DocumentIndexedMode;
  indexedAt: string | null;
  error: string | null;
  metadataJson: string | null;
  isMissing?: number;
}): IndexedDocumentRecord {
  const db = getIndexDatabase();
  const existing = getDocumentByRelativePath(input.sourceId, input.relativePath);
  const now = new Date().toISOString();
  const id = existing?.id || cryptoRandomId();

  if (existing) {
    db.prepare(
      `UPDATE IndexedDocument SET
        fileName = ?, absolutePath = ?, extension = ?, sizeBytes = ?, modifiedAt = ?,
        checksum = ?, extractionStatus = ?, extractionMode = ?, indexedMode = ?, indexedAt = ?,
        error = ?, metadataJson = ?, isMissing = ?, updatedAt = ?
       WHERE id = ?`
    ).run(
      input.fileName,
      input.absolutePath,
      input.extension,
      input.sizeBytes,
      input.modifiedAt,
      input.checksum,
      input.extractionStatus,
      input.extractionMode,
      input.indexedMode,
      input.indexedAt,
      input.error,
      input.metadataJson,
      input.isMissing || 0,
      now,
      id
    );
  } else {
    db.prepare(
      `INSERT INTO IndexedDocument
        (id, sourceId, fileName, relativePath, absolutePath, extension, sizeBytes, modifiedAt,
         checksum, extractionStatus, extractionMode, indexedMode, indexedAt, error, metadataJson,
         isMissing, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      input.sourceId,
      input.fileName,
      input.relativePath,
      input.absolutePath,
      input.extension,
      input.sizeBytes,
      input.modifiedAt,
      input.checksum,
      input.extractionStatus,
      input.extractionMode,
      input.indexedMode,
      input.indexedAt,
      input.error,
      input.metadataJson,
      input.isMissing || 0,
      now,
      now
    );
  }

  return getIndexDatabase()
    .prepare("SELECT * FROM IndexedDocument WHERE id = ?")
    .get(id) as unknown as IndexedDocumentRecord;
}

export function getDocumentById(documentId: string): IndexedDocumentRecord | null {
  return (
    (getIndexDatabase()
      .prepare("SELECT * FROM IndexedDocument WHERE id = ?")
      .get(documentId) as unknown as IndexedDocumentRecord | undefined) || null
  );
}

export function updateIndexedDocumentExclusion(input: {
  documentId: string;
  excludedFromChat?: boolean;
  excludedFromIndexing?: boolean;
  exclusionReason?: string | null;
  excludedBy?: string | null;
}): IndexedDocumentRecord {
  const existing = getDocumentById(input.documentId);

  if (!existing) {
    throw new Error("Indexed document was not found.");
  }

  const excludedFromChat =
    input.excludedFromChat === undefined ? existing.excludedFromChat === 1 : input.excludedFromChat;
  const excludedFromIndexing =
    input.excludedFromIndexing === undefined
      ? existing.excludedFromIndexing === 1
      : input.excludedFromIndexing;
  const anyExcluded = excludedFromChat || excludedFromIndexing;
  const now = new Date().toISOString();
  const reason =
    input.exclusionReason === undefined ? existing.exclusionReason : normalizeNullableText(input.exclusionReason);
  const excludedAt = anyExcluded ? existing.excludedAt || now : null;
  const excludedBy = anyExcluded ? input.excludedBy || existing.excludedBy || "local-user" : null;

  getIndexDatabase()
    .prepare(
      `UPDATE IndexedDocument SET
        excludedFromChat = ?,
        excludedFromIndexing = ?,
        exclusionReason = ?,
        excludedAt = ?,
        excludedBy = ?,
        updatedAt = ?
       WHERE id = ?`
    )
    .run(
      excludedFromChat ? 1 : 0,
      excludedFromIndexing ? 1 : 0,
      anyExcluded ? reason : null,
      excludedAt,
      excludedBy,
      now,
      input.documentId
    );

  return getDocumentById(input.documentId) as IndexedDocumentRecord;
}

export function bulkUpdateIndexedDocumentExclusions(input: {
  documentIds: string[];
  excludedFromChat?: boolean;
  excludedFromIndexing?: boolean;
  exclusionReason?: string | null;
  excludedBy?: string | null;
}): IndexedDocumentRecord[] {
  return input.documentIds.map((documentId) =>
    updateIndexedDocumentExclusion({
      documentId,
      excludedFromChat: input.excludedFromChat,
      excludedFromIndexing: input.excludedFromIndexing,
      exclusionReason: input.exclusionReason,
      excludedBy: input.excludedBy
    })
  );
}

export function markDocumentMissing(documentId: string): void {
  const now = new Date().toISOString();
  getIndexDatabase()
    .prepare(
      "UPDATE IndexedDocument SET isMissing = 1, extractionStatus = 'SKIPPED', error = 'File no longer exists.', updatedAt = ? WHERE id = ?"
    )
    .run(now, documentId);
  deleteChunksForDocument(documentId);
}

export function replaceDocumentChunks(
  documentId: string,
  chunks: Array<{
    chunkIndex: number;
    text: string;
    pageNumber?: number | null;
    slideNumber?: number | null;
    sheetName?: string | null;
    tokenEstimate?: number | null;
  }>
): void {
  const db = getIndexDatabase();
  deleteChunksForDocument(documentId);
  const now = new Date().toISOString();
  const insert = db.prepare(
    `INSERT INTO DocumentChunk
      (id, documentId, chunkIndex, text, pageNumber, slideNumber, sheetName, tokenEstimate, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  for (const chunk of chunks) {
    insert.run(
      cryptoRandomId(),
      documentId,
      chunk.chunkIndex,
      chunk.text,
      chunk.pageNumber ?? null,
      chunk.slideNumber ?? null,
      chunk.sheetName ?? null,
      chunk.tokenEstimate ?? null,
      now
    );
  }
}

export function deleteChunksForDocument(documentId: string): void {
  getIndexDatabase().prepare("DELETE FROM DocumentChunk WHERE documentId = ?").run(documentId);
}

export function createIndexRun(sourceId: string): IndexRunRecord {
  const now = new Date().toISOString();
  const id = cryptoRandomId();
  getIndexDatabase()
    .prepare(
      `INSERT INTO IndexRun
        (id, sourceId, status, startedAt, completedAt, filesScanned, filesIndexed, filesUpdated,
         filesSkipped, filesFailed, ocrProcessed, error)
       VALUES (?, ?, 'QUEUED', ?, NULL, 0, 0, 0, 0, 0, 0, NULL)`
    )
    .run(id, sourceId, now);
  return getIndexRun(id) as IndexRunRecord;
}

export function getIndexRun(id: string): IndexRunRecord | null {
  return (
    (getIndexDatabase().prepare("SELECT * FROM IndexRun WHERE id = ?").get(id) as
      | IndexRunRecord
      | undefined) || null
  );
}

export function updateIndexRun(
  id: string,
  fields: Partial<Omit<IndexRunRecord, "id" | "sourceId" | "startedAt">>
): IndexRunRecord {
  const entries = Object.entries(fields).filter(([, value]) => value !== undefined) as Array<
    [string, QueryValue]
  >;

  if (entries.length > 0) {
    const assignments = entries.map(([key]) => `${key} = ?`).join(", ");
    getIndexDatabase()
      .prepare(`UPDATE IndexRun SET ${assignments} WHERE id = ?`)
      .run(...entries.map(([, value]) => value), id);
  }

  return getIndexRun(id) as IndexRunRecord;
}

export function listSearchableChunks(sourceId: string): SearchableChunkRecord[] {
  return getIndexDatabase()
    .prepare(
      `SELECT
        c.*,
        d.fileName,
        d.relativePath,
        d.absolutePath,
        d.extension,
        d.metadataJson,
        d.indexedMode,
        d.excludedFromChat,
        d.excludedFromIndexing
       FROM DocumentChunk c
       JOIN IndexedDocument d ON d.id = c.documentId
       WHERE d.sourceId = ?
         AND d.isMissing = 0
         AND d.excludedFromChat = 0
         AND d.extractionStatus IN ('INDEXED', 'PARTIAL')
       ORDER BY d.relativePath, c.chunkIndex`
    )
    .all(sourceId) as unknown as SearchableChunkRecord[];
}

export function getIndexCounts(sourceId: string): {
  indexedDocuments: number;
  indexedChunks: number;
  activeDocuments: number;
  activeChunks: number;
  chatExcludedDocuments: number;
  indexExcludedDocuments: number;
  failedDocuments: number;
  skippedDocuments: number;
} {
  const db = getIndexDatabase();
  const docs = db
    .prepare(
      `SELECT
        SUM(CASE WHEN isMissing = 0 AND extractionStatus IN ('INDEXED', 'PARTIAL') THEN 1 ELSE 0 END) AS indexedDocuments,
        SUM(CASE WHEN isMissing = 0 AND extractionStatus IN ('INDEXED', 'PARTIAL') AND excludedFromChat = 0 THEN 1 ELSE 0 END) AS activeDocuments,
        SUM(CASE WHEN isMissing = 0 AND excludedFromChat = 1 THEN 1 ELSE 0 END) AS chatExcludedDocuments,
        SUM(CASE WHEN isMissing = 0 AND excludedFromIndexing = 1 THEN 1 ELSE 0 END) AS indexExcludedDocuments,
        SUM(CASE WHEN isMissing = 0 AND extractionStatus = 'FAILED' THEN 1 ELSE 0 END) AS failedDocuments,
        SUM(CASE WHEN isMissing = 0 AND extractionStatus = 'SKIPPED' THEN 1 ELSE 0 END) AS skippedDocuments
       FROM IndexedDocument
       WHERE sourceId = ?`
    )
    .get(sourceId) as {
    indexedDocuments: number | null;
    activeDocuments: number | null;
    chatExcludedDocuments: number | null;
    indexExcludedDocuments: number | null;
    failedDocuments: number | null;
    skippedDocuments: number | null;
  };
  const chunks = db
    .prepare(
      `SELECT COUNT(*) AS indexedChunks
       FROM DocumentChunk c
       JOIN IndexedDocument d ON d.id = c.documentId
      WHERE d.sourceId = ? AND d.isMissing = 0`
    )
    .get(sourceId) as { indexedChunks: number };
  const activeChunks = db
    .prepare(
      `SELECT COUNT(*) AS activeChunks
       FROM DocumentChunk c
       JOIN IndexedDocument d ON d.id = c.documentId
       WHERE d.sourceId = ? AND d.isMissing = 0 AND d.excludedFromChat = 0`
    )
    .get(sourceId) as { activeChunks: number };

  return {
    indexedDocuments: docs.indexedDocuments || 0,
    indexedChunks: chunks.indexedChunks || 0,
    activeDocuments: docs.activeDocuments || 0,
    activeChunks: activeChunks.activeChunks || 0,
    chatExcludedDocuments: docs.chatExcludedDocuments || 0,
    indexExcludedDocuments: docs.indexExcludedDocuments || 0,
    failedDocuments: docs.failedDocuments || 0,
    skippedDocuments: docs.skippedDocuments || 0
  };
}

function initializeSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS DocumentSource (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      displayName TEXT NOT NULL,
      rootPath TEXT NOT NULL,
      normalizedRootPath TEXT NOT NULL,
      sourceKey TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      lastScannedAt TEXT,
      UNIQUE(sourceKey),
      UNIQUE(type, rootPath)
    );

    CREATE TABLE IF NOT EXISTS IndexedDocument (
      id TEXT PRIMARY KEY,
      sourceId TEXT NOT NULL,
      fileName TEXT NOT NULL,
      relativePath TEXT NOT NULL,
      absolutePath TEXT NOT NULL,
      extension TEXT NOT NULL,
      sizeBytes INTEGER NOT NULL,
      modifiedAt TEXT NOT NULL,
      checksum TEXT NOT NULL,
      extractionStatus TEXT NOT NULL,
      extractionMode TEXT NOT NULL,
      indexedMode TEXT NOT NULL,
      indexedAt TEXT,
      error TEXT,
      metadataJson TEXT,
      isMissing INTEGER NOT NULL DEFAULT 0,
      excludedFromChat INTEGER NOT NULL DEFAULT 0,
      excludedFromIndexing INTEGER NOT NULL DEFAULT 0,
      exclusionReason TEXT,
      excludedAt TEXT,
      excludedBy TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY(sourceId) REFERENCES DocumentSource(id) ON DELETE CASCADE,
      UNIQUE(sourceId, relativePath)
    );

    CREATE TABLE IF NOT EXISTS DocumentChunk (
      id TEXT PRIMARY KEY,
      documentId TEXT NOT NULL,
      chunkIndex INTEGER NOT NULL,
      text TEXT NOT NULL,
      pageNumber INTEGER,
      slideNumber INTEGER,
      sheetName TEXT,
      tokenEstimate INTEGER,
      createdAt TEXT NOT NULL,
      FOREIGN KEY(documentId) REFERENCES IndexedDocument(id) ON DELETE CASCADE,
      UNIQUE(documentId, chunkIndex)
    );

    CREATE TABLE IF NOT EXISTS IndexRun (
      id TEXT PRIMARY KEY,
      sourceId TEXT NOT NULL,
      status TEXT NOT NULL,
      startedAt TEXT NOT NULL,
      completedAt TEXT,
      filesScanned INTEGER NOT NULL DEFAULT 0,
      filesIndexed INTEGER NOT NULL DEFAULT 0,
      filesUpdated INTEGER NOT NULL DEFAULT 0,
      filesSkipped INTEGER NOT NULL DEFAULT 0,
      filesFailed INTEGER NOT NULL DEFAULT 0,
      ocrProcessed INTEGER NOT NULL DEFAULT 0,
      error TEXT,
      FOREIGN KEY(sourceId) REFERENCES DocumentSource(id) ON DELETE CASCADE
    );
  `);
  ensureDocumentSourceIdentityColumns(db);
  ensureIndexedDocumentExclusionColumns(db);
}

function ensureDocumentSourceIdentityColumns(db: DatabaseSync): void {
  const existingColumns = new Set(
    (db.prepare("PRAGMA table_info(DocumentSource)").all() as Array<{ name: string }>).map(
      (column) => column.name
    )
  );

  const columns: Array<{ name: string; definition: string }> = [
    { name: "normalizedRootPath", definition: "TEXT" },
    { name: "sourceKey", definition: "TEXT" }
  ];

  for (const column of columns) {
    if (!existingColumns.has(column.name)) {
      db.exec(`ALTER TABLE DocumentSource ADD COLUMN ${column.name} ${column.definition};`);
    }
  }

  const sources = db.prepare("SELECT id, type, rootPath FROM DocumentSource").all() as Array<{
    id: string;
    type: ActiveDocumentSourceType;
    rootPath: string;
  }>;
  const update = db.prepare(
    "UPDATE DocumentSource SET normalizedRootPath = ?, sourceKey = ? WHERE id = ?"
  );

  for (const source of sources) {
    const normalizedRootPath = normalizeSourceRootPath(source.rootPath);
    update.run(normalizedRootPath, buildSourceKey(source.type, normalizedRootPath), source.id);
  }

  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_DocumentSource_sourceKey ON DocumentSource(sourceKey);");
}

function ensureIndexedDocumentExclusionColumns(db: DatabaseSync): void {
  const existingColumns = new Set(
    (db.prepare("PRAGMA table_info(IndexedDocument)").all() as Array<{ name: string }>).map(
      (column) => column.name
    )
  );

  const columns: Array<{ name: string; definition: string }> = [
    { name: "excludedFromChat", definition: "INTEGER NOT NULL DEFAULT 0" },
    { name: "excludedFromIndexing", definition: "INTEGER NOT NULL DEFAULT 0" },
    { name: "exclusionReason", definition: "TEXT" },
    { name: "excludedAt", definition: "TEXT" },
    { name: "excludedBy", definition: "TEXT" }
  ];

  for (const column of columns) {
    if (!existingColumns.has(column.name)) {
      db.exec(`ALTER TABLE IndexedDocument ADD COLUMN ${column.name} ${column.definition};`);
    }
  }
}

function normalizeNullableText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 500) : null;
}

function cryptoRandomId(): string {
  return crypto.randomUUID();
}

export function normalizeSourceRootPath(rootPath: string): string {
  const resolved = path.resolve(rootPath.trim());
  const normalized = path.normalize(resolved);
  return process.platform === "darwin" || process.platform === "win32"
    ? normalized.toLowerCase()
    : normalized;
}

export function buildSourceKey(type: ActiveDocumentSourceType, normalizedRootPath: string): string {
  return crypto.createHash("sha1").update(`${type}:${normalizedRootPath}`).digest("hex");
}
