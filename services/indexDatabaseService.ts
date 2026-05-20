import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { dataDirectory, getIndexDatabasePath } from "@/lib/paths";
import type { ActiveDocumentSourceType, DocumentIndexedMode } from "@/types/document";

type QueryValue = string | number | null;

const DEFAULT_CHAT_EXCLUDED_EXTENSIONS = new Set([".xlsx", ".xls", ".mp4", ".mov"]);
const DEFAULT_CHAT_EXCLUSION_MIGRATION_ID = "default-chat-exclusions-2026-05-20";
const DEFAULT_CHAT_EXCLUSION_REASON =
  "Excluded by default because this file type can add noisy metadata to chat answers.";

export type ExtractionStatus = "PENDING" | "INDEXED" | "PARTIAL" | "FAILED" | "SKIPPED";
export type ExtractionMode = "TEXT" | "OCR" | "METADATA_ONLY" | "MIXED";
export type IndexRunStatus = "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";
export type ChatMessageRole = "USER" | "ASSISTANT" | "SYSTEM";
export type ConfidenceLevel = "High" | "Medium" | "Low";

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

export interface ChatSessionRecord {
  id: string;
  title: string | null;
  sourceId: string | null;
  startedAt: string;
  updatedAt: string;
}

export interface ChatMessageRecord {
  id: string;
  sessionId: string;
  role: ChatMessageRole;
  content: string;
  createdAt: string;
}

export interface QuestionAnswerLogRecord {
  id: string;
  sessionId: string | null;
  sourceId: string | null;
  question: string;
  normalizedQuestion: string;
  questionHash: string;
  answer: string;
  confidenceScore: number | null;
  confidenceLevel: ConfidenceLevel | null;
  sourcesJson: string | null;
  retrievedChunkIdsJson: string | null;
  responseTimeMs: number | null;
  codexUsed: number;
  cacheHit: number;
  answerSource: string;
  reusedFromLogId: string | null;
  similarityScore: number | null;
  indexSnapshotAt: string | null;
  indexRunId: string | null;
  sourceLastIndexedAt: string | null;
  createdAt: string;
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
  const shouldExcludeFromChat = shouldDefaultExcludeFromChat(input.extension);

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
         isMissing, excludedFromChat, exclusionReason, excludedAt, excludedBy, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
      shouldExcludeFromChat ? 1 : 0,
      shouldExcludeFromChat ? DEFAULT_CHAT_EXCLUSION_REASON : null,
      shouldExcludeFromChat ? now : null,
      shouldExcludeFromChat ? "system-default" : null,
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

export function bulkUpdateIndexedDocumentChatExclusion(input: {
  sourceId?: string;
  documentIds?: string[];
  excludedFromChat: boolean;
  exclusionReason?: string | null;
  excludedBy?: string | null;
}): number {
  const now = new Date().toISOString();
  const excludedAt = input.excludedFromChat ? now : null;
  const excludedBy = input.excludedFromChat ? input.excludedBy || "local-user" : null;
  const reason = input.excludedFromChat ? normalizeNullableText(input.exclusionReason) : null;
  const conditions: string[] = ["isMissing = 0"];
  const values: QueryValue[] = [
    input.excludedFromChat ? 1 : 0,
    reason,
    excludedAt,
    excludedBy,
    now
  ];

  if (input.sourceId) {
    conditions.push("sourceId = ?");
    values.push(input.sourceId);
  }

  if (input.documentIds?.length) {
    conditions.push(`id IN (${input.documentIds.map(() => "?").join(", ")})`);
    values.push(...input.documentIds);
  }

  const result = getIndexDatabase()
    .prepare(
      `UPDATE IndexedDocument SET
        excludedFromChat = ?,
        exclusionReason = ?,
        excludedAt = ?,
        excludedBy = ?,
        updatedAt = ?
       WHERE ${conditions.join(" AND ")}`
    )
    .run(...values);

  return Number(result.changes);
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

export function createChatSession(input?: {
  id?: string;
  title?: string | null;
  sourceId?: string | null;
}): ChatSessionRecord {
  const id = input?.id || cryptoRandomId();
  const now = new Date().toISOString();
  getIndexDatabase()
    .prepare(
      `INSERT OR IGNORE INTO ChatSession
        (id, title, sourceId, startedAt, updatedAt)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(id, normalizeNullableText(input?.title)?.slice(0, 120) || null, input?.sourceId || null, now, now);

  return getChatSessionById(id) as ChatSessionRecord;
}

export function updateChatSessionSource(sessionId: string, sourceId: string | null): void {
  getIndexDatabase()
    .prepare("UPDATE ChatSession SET sourceId = ?, updatedAt = ? WHERE id = ?")
    .run(sourceId, new Date().toISOString(), sessionId);
}

export function getChatSessionById(sessionId: string): ChatSessionRecord | null {
  return (
    (getIndexDatabase().prepare("SELECT * FROM ChatSession WHERE id = ?").get(sessionId) as
      | ChatSessionRecord
      | undefined) || null
  );
}

export function addChatMessage(input: {
  sessionId: string;
  role: ChatMessageRole;
  content: string;
}): ChatMessageRecord {
  const id = cryptoRandomId();
  const now = new Date().toISOString();
  getIndexDatabase()
    .prepare(
      `INSERT INTO ChatMessage
        (id, sessionId, role, content, createdAt)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(id, input.sessionId, input.role, input.content, now);
  getIndexDatabase()
    .prepare("UPDATE ChatSession SET updatedAt = ? WHERE id = ?")
    .run(now, input.sessionId);

  return getIndexDatabase()
    .prepare("SELECT * FROM ChatMessage WHERE id = ?")
    .get(id) as unknown as ChatMessageRecord;
}

export function saveQuestionAnswerLog(input: {
  sessionId?: string | null;
  sourceId?: string | null;
  question: string;
  normalizedQuestion: string;
  questionHash: string;
  answer: string;
  confidenceScore?: number | null;
  confidenceLevel?: ConfidenceLevel | null;
  sourcesJson?: string | null;
  retrievedChunkIdsJson?: string | null;
  responseTimeMs?: number | null;
  codexUsed: boolean;
  cacheHit: boolean;
  answerSource: string;
  reusedFromLogId?: string | null;
  similarityScore?: number | null;
  indexSnapshotAt?: string | null;
  indexRunId?: string | null;
  sourceLastIndexedAt?: string | null;
}): QuestionAnswerLogRecord {
  const id = cryptoRandomId();
  const now = new Date().toISOString();
  getIndexDatabase()
    .prepare(
      `INSERT INTO QuestionAnswerLog
        (id, sessionId, sourceId, question, normalizedQuestion, questionHash, answer,
         confidenceScore, confidenceLevel, sourcesJson, retrievedChunkIdsJson, responseTimeMs,
         codexUsed, cacheHit, answerSource, reusedFromLogId, similarityScore, indexSnapshotAt,
         indexRunId, sourceLastIndexedAt, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      input.sessionId || null,
      input.sourceId || null,
      input.question,
      input.normalizedQuestion,
      input.questionHash,
      input.answer,
      input.confidenceScore ?? null,
      input.confidenceLevel ?? null,
      input.sourcesJson ?? null,
      input.retrievedChunkIdsJson ?? null,
      input.responseTimeMs ?? null,
      input.codexUsed ? 1 : 0,
      input.cacheHit ? 1 : 0,
      input.answerSource,
      input.reusedFromLogId || null,
      input.similarityScore ?? null,
      input.indexSnapshotAt || null,
      input.indexRunId || null,
      input.sourceLastIndexedAt || null,
      now
    );

  return getQuestionAnswerLogById(id) as QuestionAnswerLogRecord;
}

export function getQuestionAnswerLogById(id: string): QuestionAnswerLogRecord | null {
  return (
    (getIndexDatabase().prepare("SELECT * FROM QuestionAnswerLog WHERE id = ?").get(id) as
      | QuestionAnswerLogRecord
      | undefined) || null
  );
}

export function listQuestionAnswerLogs(options?: {
  sourceId?: string | null;
  search?: string;
  confidenceLevel?: ConfidenceLevel;
  cacheHit?: boolean;
  codexUsed?: boolean;
  fromDate?: string;
  toDate?: string;
  limit?: number;
}): QuestionAnswerLogRecord[] {
  const where: string[] = [];
  const values: QueryValue[] = [];

  if (options?.sourceId) {
    where.push("sourceId = ?");
    values.push(options.sourceId);
  }

  if (options?.search?.trim()) {
    where.push("(question LIKE ? OR answer LIKE ?)");
    const term = `%${options.search.trim()}%`;
    values.push(term, term);
  }

  if (options?.confidenceLevel) {
    where.push("confidenceLevel = ?");
    values.push(options.confidenceLevel);
  }

  if (options?.cacheHit !== undefined) {
    where.push("cacheHit = ?");
    values.push(options.cacheHit ? 1 : 0);
  }

  if (options?.codexUsed !== undefined) {
    where.push("codexUsed = ?");
    values.push(options.codexUsed ? 1 : 0);
  }

  if (options?.fromDate) {
    where.push("createdAt >= ?");
    values.push(options.fromDate);
  }

  if (options?.toDate) {
    where.push("createdAt <= ?");
    values.push(options.toDate);
  }

  const limit = Math.min(Math.max(options?.limit || 100, 1), 500);
  values.push(limit);

  return getIndexDatabase()
    .prepare(
      `SELECT * FROM QuestionAnswerLog
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY createdAt DESC
       LIMIT ?`
    )
    .all(...values) as unknown as QuestionAnswerLogRecord[];
}

export function listQuestionAnswerLogsForSimilarity(input: {
  sourceId: string;
  limit?: number;
}): QuestionAnswerLogRecord[] {
  const limit = Math.min(Math.max(input.limit || 250, 1), 1000);

  return getIndexDatabase()
    .prepare(
      `SELECT * FROM QuestionAnswerLog
       WHERE sourceId = ?
       ORDER BY createdAt DESC
       LIMIT ?`
    )
    .all(input.sourceId, limit) as unknown as QuestionAnswerLogRecord[];
}

export function deleteQuestionAnswerLogs(): number {
  const db = getIndexDatabase();
  const result = db.prepare("DELETE FROM QuestionAnswerLog").run();
  db.prepare("DELETE FROM ChatMessage").run();
  db.prepare("DELETE FROM ChatSession").run();
  return Number(result.changes);
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
    CREATE TABLE IF NOT EXISTS SchemaMigration (
      id TEXT PRIMARY KEY,
      appliedAt TEXT NOT NULL
    );

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

    CREATE TABLE IF NOT EXISTS ChatSession (
      id TEXT PRIMARY KEY,
      title TEXT,
      sourceId TEXT,
      startedAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY(sourceId) REFERENCES DocumentSource(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS ChatMessage (
      id TEXT PRIMARY KEY,
      sessionId TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      FOREIGN KEY(sessionId) REFERENCES ChatSession(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS QuestionAnswerLog (
      id TEXT PRIMARY KEY,
      sessionId TEXT,
      sourceId TEXT,
      question TEXT NOT NULL,
      normalizedQuestion TEXT NOT NULL,
      questionHash TEXT NOT NULL,
      answer TEXT NOT NULL,
      confidenceScore REAL,
      confidenceLevel TEXT,
      sourcesJson TEXT,
      retrievedChunkIdsJson TEXT,
      responseTimeMs INTEGER,
      codexUsed INTEGER NOT NULL DEFAULT 0,
      cacheHit INTEGER NOT NULL DEFAULT 0,
      answerSource TEXT NOT NULL DEFAULT 'INDEXED_DOCUMENTS',
      reusedFromLogId TEXT,
      similarityScore REAL,
      indexSnapshotAt TEXT,
      indexRunId TEXT,
      sourceLastIndexedAt TEXT,
      createdAt TEXT NOT NULL,
      FOREIGN KEY(sessionId) REFERENCES ChatSession(id) ON DELETE SET NULL,
      FOREIGN KEY(sourceId) REFERENCES DocumentSource(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_QuestionAnswerLog_source_created
      ON QuestionAnswerLog(sourceId, createdAt DESC);
    CREATE INDEX IF NOT EXISTS idx_QuestionAnswerLog_hash
      ON QuestionAnswerLog(questionHash);
  `);
  ensureDocumentSourceIdentityColumns(db);
  ensureIndexedDocumentExclusionColumns(db);
  ensureQuestionAnswerColumns(db);
  applyDefaultChatExclusionMigration(db);
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

function applyDefaultChatExclusionMigration(db: DatabaseSync): void {
  const existing = db
    .prepare("SELECT id FROM SchemaMigration WHERE id = ?")
    .get(DEFAULT_CHAT_EXCLUSION_MIGRATION_ID);

  if (existing) {
    return;
  }

  const now = new Date().toISOString();
  db.prepare(
    `UPDATE IndexedDocument SET
      excludedFromChat = 1,
      exclusionReason = COALESCE(exclusionReason, ?),
      excludedAt = COALESCE(excludedAt, ?),
      excludedBy = COALESCE(excludedBy, 'system-default'),
      updatedAt = ?
     WHERE lower(extension) IN (${Array.from(DEFAULT_CHAT_EXCLUDED_EXTENSIONS)
       .map(() => "?")
       .join(", ")})`
  ).run(DEFAULT_CHAT_EXCLUSION_REASON, now, now, ...Array.from(DEFAULT_CHAT_EXCLUDED_EXTENSIONS));

  db.prepare("INSERT INTO SchemaMigration (id, appliedAt) VALUES (?, ?)").run(
    DEFAULT_CHAT_EXCLUSION_MIGRATION_ID,
    now
  );
}

function shouldDefaultExcludeFromChat(extension: string): boolean {
  return DEFAULT_CHAT_EXCLUDED_EXTENSIONS.has(extension.toLowerCase());
}

function ensureQuestionAnswerColumns(db: DatabaseSync): void {
  const existingColumns = new Set(
    (db.prepare("PRAGMA table_info(QuestionAnswerLog)").all() as Array<{ name: string }>).map(
      (column) => column.name
    )
  );

  const columns: Array<{ name: string; definition: string }> = [
    { name: "answerSource", definition: "TEXT NOT NULL DEFAULT 'INDEXED_DOCUMENTS'" },
    { name: "reusedFromLogId", definition: "TEXT" },
    { name: "similarityScore", definition: "REAL" },
    { name: "indexSnapshotAt", definition: "TEXT" },
    { name: "indexRunId", definition: "TEXT" },
    { name: "sourceLastIndexedAt", definition: "TEXT" }
  ];

  for (const column of columns) {
    if (!existingColumns.has(column.name)) {
      db.exec(`ALTER TABLE QuestionAnswerLog ADD COLUMN ${column.name} ${column.definition};`);
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
