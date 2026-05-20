import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as GET_ANALYTICS } from "@/app/api/admin/analytics/route";
import { DELETE as DELETE_QUESTIONS, GET as GET_QUESTIONS } from "@/app/api/admin/questions/route";
import {
  findReusableAnswer,
  persistAssistantAnswer
} from "@/services/answerReuseService";
import {
  getIndexCounts,
  getOrCreateDocumentSource,
  replaceDocumentChunks,
  resetIndexDatabaseForTests,
  updateDocumentSourceScannedAt,
  upsertIndexedDocument,
  type DocumentSourceRecord
} from "@/services/indexDatabaseService";
import type { IndexStatus } from "@/services/documentIndexRunService";

const originalEnv = { ...process.env };

describe("answer reuse and question history", () => {
  let tempRoot = "";
  let source: DocumentSourceRecord;
  let indexedAt = "";

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "knowledge-reuse-"));
    process.env = { ...originalEnv };
    process.env.INDEX_DATABASE_PATH = `${tempRoot}.sqlite`;
    process.env.LOG_CHAT_HISTORY = "true";
    resetIndexDatabaseForTests();
    source = getOrCreateDocumentSource({
      type: "LOCAL_FOLDER",
      displayName: "Local Folder",
      rootPath: tempRoot
    });
    indexedAt = new Date().toISOString();
    updateDocumentSourceScannedAt(source.id, indexedAt);
    const document = upsertIndexedDocument({
      sourceId: source.id,
      fileName: "policy.md",
      relativePath: "policy.md",
      absolutePath: path.join(tempRoot, "policy.md"),
      extension: ".md",
      sizeBytes: 42,
      modifiedAt: indexedAt,
      checksum: "checksum",
      extractionStatus: "INDEXED",
      extractionMode: "TEXT",
      indexedMode: "FULL_TEXT",
      indexedAt,
      error: null,
      metadataJson: "{}"
    });
    replaceDocumentChunks(document.id, [
      {
        chunkIndex: 0,
        text: "The approved setup process requires review."
      }
    ]);
  });

  afterEach(async () => {
    resetIndexDatabaseForTests();
    process.env = { ...originalEnv };
    await fs.rm(tempRoot, { recursive: true, force: true });
    await fs.rm(`${tempRoot}.sqlite`, { force: true });
  });

  it("saves Q&A logs and reuses a safe similar high-confidence answer", () => {
    const status = buildIndexStatus(source, indexedAt);
    const saved = persistAssistantAnswer({
      sourceId: source.id,
      question: "What is the setup process?",
      answer: {
        answer: "The setup process requires review.",
        confidence: 0.91,
        sources: [
          {
            fileName: "policy.md",
            relativePath: "policy.md",
            snippet: "The approved setup process requires review."
          }
        ],
        engine: "codex-placeholder",
        answerSource: "INDEXED_DOCUMENTS"
      },
      responseTimeMs: 120,
      codexUsed: true,
      cacheHit: false,
      answerSource: "INDEXED_DOCUMENTS",
      indexStatus: status
    });

    const reusable = findReusableAnswer({
      question: "What setup process should I follow?",
      indexStatus: status
    });

    expect(saved?.question).toBe("What is the setup process?");
    expect(reusable?.answer.answer).toContain("requires review");
    expect(reusable?.answer.answerSource).toBe("PREVIOUS_SIMILAR_QUESTION");
  });

  it("does not reuse when the source or index snapshot changed", () => {
    const status = buildIndexStatus(source, indexedAt);
    persistAssistantAnswer({
      sourceId: source.id,
      question: "What is the setup process?",
      answer: {
        answer: "The setup process requires review.",
        confidence: 0.91,
        sources: [{ fileName: "policy.md", relativePath: "policy.md", snippet: "review" }],
        engine: "codex-placeholder"
      },
      codexUsed: true,
      cacheHit: false,
      answerSource: "INDEXED_DOCUMENTS",
      indexStatus: status
    });
    const otherSource = getOrCreateDocumentSource({
      type: "LOCAL_FOLDER",
      displayName: "Other Folder",
      rootPath: path.join(tempRoot, "other")
    });
    const changedStatus = buildIndexStatus(source, new Date(Date.now() + 5000).toISOString());

    expect(
      findReusableAnswer({
        question: "What setup process should I follow?",
        indexStatus: buildIndexStatus(otherSource, indexedAt)
      })
    ).toBeNull();
    expect(
      findReusableAnswer({
        question: "What setup process should I follow?",
        indexStatus: changedStatus
      })
    ).toBeNull();
  });

  it("does not reuse low-confidence answers", () => {
    const status = buildIndexStatus(source, indexedAt);
    persistAssistantAnswer({
      sourceId: source.id,
      question: "What is the setup process?",
      answer: {
        answer: "Not enough information.",
        confidence: 0.2,
        sources: [{ fileName: "policy.md", relativePath: "policy.md", snippet: "review" }],
        engine: "codex-placeholder"
      },
      codexUsed: false,
      cacheHit: false,
      answerSource: "REFUSAL",
      indexStatus: status
    });

    expect(
      findReusableAnswer({
        question: "What setup process should I follow?",
        indexStatus: status
      })
    ).toBeNull();
  });

  it("lists admin question history, analytics, and clears history", async () => {
    const status = buildIndexStatus(source, indexedAt);
    persistAssistantAnswer({
      sourceId: source.id,
      question: "What is the setup process?",
      answer: {
        answer: "The setup process requires review.",
        confidence: 0.91,
        sources: [{ fileName: "policy.md", relativePath: "policy.md", snippet: "review" }],
        engine: "codex-placeholder"
      },
      responseTimeMs: 100,
      codexUsed: true,
      cacheHit: false,
      answerSource: "INDEXED_DOCUMENTS",
      indexStatus: status
    });

    const questionsPayload = await (await GET_QUESTIONS(new Request("http://localhost/api/admin/questions"))).json();
    const analyticsPayload = await (await GET_ANALYTICS()).json();
    const deletePayload = await (await DELETE_QUESTIONS()).json();

    expect(questionsPayload.data.questions).toHaveLength(1);
    expect(analyticsPayload.data.totalQuestions).toBe(1);
    expect(deletePayload.data.deleted).toBe(1);
  });
});

function buildIndexStatus(source: DocumentSourceRecord, lastIndexedAt: string): IndexStatus {
  const counts = getIndexCounts(source.id);

  return {
    source: {
      id: source.id,
      type: source.type,
      displayName: source.displayName,
      rootPath: source.rootPath,
      normalizedRootPath: source.normalizedRootPath,
      sourceKey: source.sourceKey,
      lastScannedAt: lastIndexedAt
    },
    activeSource: {
      id: source.id,
      type: source.type,
      displayName: source.displayName,
      rootPath: source.rootPath,
      normalizedRootPath: source.normalizedRootPath,
      sourceKey: source.sourceKey,
      lastScannedAt: lastIndexedAt
    },
    knownSources: [],
    index: {
      status: "FRESH",
      lastIndexedAt,
      indexedDocuments: counts.indexedDocuments,
      indexedChunks: counts.indexedChunks,
      activeDocuments: counts.activeDocuments,
      activeChunks: counts.activeChunks,
      needsUpdate: false,
      newFiles: 0,
      changedFiles: 0,
      deletedFiles: 0,
      chatExcludedDocuments: counts.chatExcludedDocuments,
      indexExcludedDocuments: counts.indexExcludedDocuments,
      failedDocuments: counts.failedDocuments,
      skippedDocuments: counts.skippedDocuments,
      ocrEnabled: true,
      startupValidation: {
        database: { connected: true, message: "OK" },
        ocrService: { loaded: true, enabled: true, message: "OK" },
        activeSource: {
          available: true,
          type: source.type,
          rootPath: source.rootPath,
          message: "OK"
        },
        extractors: { registered: [], supportedExtensions: [] },
        warnings: []
      },
      lastRun: null
    }
  };
}
