import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getActiveIndexStatus,
  getIndexRunProgress,
  startIndexRun
} from "@/services/documentIndexRunService";
import { buildChatPrompt } from "@/services/chatPromptService";
import { searchIndexedDocuments } from "@/services/indexedDocumentSearchService";
import {
  bulkUpdateIndexedDocumentExclusions,
  listDocumentSources,
  listDocumentsBySource,
  listSearchableChunks,
  resetIndexDatabaseForTests,
  updateIndexedDocumentExclusion
} from "@/services/indexDatabaseService";

vi.mock("pdf-parse", () => ({
  PDFParse: class {
    static setWorker() {
      return "";
    }

    private readonly rawText: string;

    constructor(input: { data: Uint8Array }) {
      this.rawText = Buffer.from(input.data).toString("utf8");
    }

    async getText() {
      return {
        text: this.rawText.includes("SCANNED_PDF") ? "" : this.rawText,
        total: 2
      };
    }

    async destroy() {
      return undefined;
    }
  }
}));

vi.mock("node:child_process", async () => {
  const fsSync = await import("node:fs");

  return {
    execFile: vi.fn((
      command: string,
      args: string[],
      callback: (error: Error | null, stdout: string, stderr: string) => void
    ) => {
      if (command === "pdftoppm") {
        const prefix = args[args.length - 1];
        fsSync.writeFileSync(`${prefix}-1.png`, "mock rendered PDF page");
        callback(null, "", "");
        return {};
      }

      callback(new Error(`Unexpected command: ${command}`), "", "");
      return {};
    })
  };
});

vi.mock("tesseract.js", () => ({
  recognize: vi.fn(async (filePath: string) => ({
    data: {
      text: filePath.includes("blank") ? "" : "OCR extracted e-invoicing qualification text"
    }
  }))
}));

describe("documentIndexRunService", () => {
  let tempRoot = "";

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "einvoice-index-run-"));
    vi.stubEnv("DOCUMENT_SOURCE_DISABLE_LOCAL_CONFIG", "true");
    vi.stubEnv("DOCUMENT_SOURCE_MODE", "LOCAL_FOLDER");
    vi.stubEnv("LOCAL_DOCUMENTS_PATH", tempRoot);
    vi.stubEnv("INDEX_DATABASE_PATH", `${tempRoot}.sqlite`);
    vi.stubEnv("ENABLE_LOCAL_OCR", "false");
    vi.stubEnv("AUTO_INDEX_ON_STARTUP", "false");
    resetIndexDatabaseForTests();
  });

  afterEach(async () => {
    resetIndexDatabaseForTests();
    vi.unstubAllEnvs();
    await fs.rm(tempRoot, { recursive: true, force: true });
    await fs.rm(`${tempRoot}.sqlite`, { force: true });
  });

  it("stores source root, indexed document metadata, and chunks in SQLite", async () => {
    await fs.writeFile(path.join(tempRoot, "policy.md"), "Belgium e-invoicing requires approval.");

    const run = await runIndexToCompletion();
    const status = await getActiveIndexStatus({ checkForUpdates: false });
    const documents = listDocumentsBySource(status.source.id);
    const chunks = listSearchableChunks(status.source.id);

    expect(run.filesIndexed).toBe(1);
    expect(status.source.rootPath).toBe(tempRoot);
    expect(status.index.indexedDocuments).toBe(1);
    expect(status.index.indexedChunks).toBe(1);
    expect(documents[0]).toEqual(
      expect.objectContaining({
        relativePath: "policy.md",
        sourceId: status.source.id,
        extractionStatus: "INDEXED",
        extractionMode: "TEXT",
        isMissing: 0
      })
    );
    expect(documents[0].checksum).toHaveLength(40);
    expect(chunks[0].text).toContain("Belgium e-invoicing");
  });

  it("reuses the same DocumentSource for the same normalized folder path", async () => {
    await fs.writeFile(path.join(tempRoot, "policy.md"), "Normalized source identity content.");

    await runIndexToCompletion();
    const firstStatus = await getActiveIndexStatus({ checkForUpdates: false });
    vi.stubEnv("LOCAL_DOCUMENTS_PATH", path.join(tempRoot, "."));
    const secondStatus = await getActiveIndexStatus({ checkForUpdates: false });

    expect(secondStatus.source.id).toBe(firstStatus.source.id);
    expect(secondStatus.source.sourceKey).toBe(firstStatus.source.sourceKey);
    expect(listDocumentSources()).toHaveLength(1);
  });

  it("switching folders reloads previous source state and preserves chat exclusions", async () => {
    const folderA = path.join(tempRoot, "Folder A");
    const folderB = path.join(tempRoot, "Folder B");
    await fs.mkdir(folderA, { recursive: true });
    await fs.mkdir(folderB, { recursive: true });
    await fs.writeFile(path.join(folderA, "alpha.md"), "Alpha source should stay excluded.");
    await fs.writeFile(path.join(folderB, "beta.md"), "Beta source remains searchable.");

    vi.stubEnv("LOCAL_DOCUMENTS_PATH", folderA);
    await runIndexToCompletion();
    const folderAStatus = await getActiveIndexStatus({ checkForUpdates: false });
    const alpha = listDocumentsBySource(folderAStatus.source.id)[0];
    updateIndexedDocumentExclusion({
      documentId: alpha.id,
      excludedFromChat: true,
      exclusionReason: "Noisy alpha source"
    });

    vi.stubEnv("LOCAL_DOCUMENTS_PATH", folderB);
    await runIndexToCompletion();
    const folderBStatus = await getActiveIndexStatus({ checkForUpdates: false });
    const betaResults = await searchIndexedDocuments("Beta searchable");

    vi.stubEnv("LOCAL_DOCUMENTS_PATH", folderA);
    const returnedStatus = await getActiveIndexStatus({ checkForUpdates: false });
    const alphaResults = await searchIndexedDocuments("Alpha excluded");
    const returnedAlpha = listDocumentsBySource(returnedStatus.source.id)[0];

    expect(folderBStatus.source.id).not.toBe(folderAStatus.source.id);
    expect(returnedStatus.source.id).toBe(folderAStatus.source.id);
    expect(returnedAlpha.excludedFromChat).toBe(1);
    expect(returnedAlpha.exclusionReason).toBe("Noisy alpha source");
    expect(alphaResults).toEqual([]);
    expect(betaResults[0].relativePath).toBe("beta.md");
    expect(listDocumentSources()).toHaveLength(2);
  });

  it("chat search only uses the active source and applies exclusions per source", async () => {
    const folderA = path.join(tempRoot, "Source A");
    const folderB = path.join(tempRoot, "Source B");
    await fs.mkdir(folderA, { recursive: true });
    await fs.mkdir(folderB, { recursive: true });
    await fs.writeFile(path.join(folderA, "shared.md"), "Shared keyword from excluded folder A.");
    await fs.writeFile(path.join(folderB, "shared.md"), "Shared keyword from active folder B.");

    vi.stubEnv("LOCAL_DOCUMENTS_PATH", folderA);
    await runIndexToCompletion();
    const folderAStatus = await getActiveIndexStatus({ checkForUpdates: false });
    updateIndexedDocumentExclusion({
      documentId: listDocumentsBySource(folderAStatus.source.id)[0].id,
      excludedFromChat: true
    });

    vi.stubEnv("LOCAL_DOCUMENTS_PATH", folderB);
    await runIndexToCompletion();
    const folderBResults = await searchIndexedDocuments("Shared keyword");

    vi.stubEnv("LOCAL_DOCUMENTS_PATH", folderA);
    const folderAResults = await searchIndexedDocuments("Shared keyword");

    expect(folderBResults[0].snippet).toContain("active folder B");
    expect(folderAResults).toEqual([]);
  });

  it("enables OCR by default and reports registered extractors at startup", async () => {
    vi.stubEnv("ENABLE_LOCAL_OCR", "");

    const status = await getActiveIndexStatus({ checkForUpdates: false });

    expect(status.index.ocrEnabled).toBe(true);
    expect(status.index.startupValidation.database.connected).toBe(true);
    expect(status.index.startupValidation.ocrService).toEqual(
      expect.objectContaining({
        loaded: true,
        enabled: true
      })
    );
    expect(status.index.startupValidation.extractors.registered).toEqual(
      expect.arrayContaining([
        "pdfExtractor",
        "ocrExtractor",
        "pptxExtractor",
        "xlsxExtractor",
        "imageExtractor",
        "urlExtractor",
        "videoMetadataExtractor"
      ])
    );
    expect(status.index.startupValidation.extractors.supportedExtensions).toEqual(
      expect.arrayContaining([".pdf", ".pptx", ".xlsx", ".png", ".jpg", ".jpeg", ".url", ".mp4"])
    );
  });

  it("persists OCR fallback text for scanned PDFs in database chunks", async () => {
    vi.stubEnv("ENABLE_LOCAL_OCR", "true");
    await fs.writeFile(path.join(tempRoot, "scanned.pdf"), "SCANNED_PDF");

    const run = await runIndexToCompletion();
    const status = await getActiveIndexStatus({ checkForUpdates: false });
    const documents = listDocumentsBySource(status.source.id);
    const chunks = listSearchableChunks(status.source.id);

    expect(run.ocrProcessed).toBe(1);
    expect(documents[0]).toEqual(
      expect.objectContaining({
        fileName: "scanned.pdf",
        extractionMode: "OCR",
        indexedMode: "OCR_TEXT",
        extractionStatus: "INDEXED"
      })
    );
    expect(JSON.parse(documents[0].metadataJson || "{}")).toEqual(
      expect.objectContaining({
        ocrAttempted: true,
        ocrProcessed: true
      })
    );
    expect(chunks[0].text).toContain("OCR extracted e-invoicing qualification text");
  });

  it("persists image OCR text and searches database chunks without rescanning", async () => {
    vi.stubEnv("ENABLE_LOCAL_OCR", "true");
    await writePngFixture(path.join(tempRoot, "Qualification.png"));

    await runIndexToCompletion();
    const results = await searchIndexedDocuments("qualification OCR");

    expect(results.length).toBeGreaterThan(0);
    expect(results[0]).toEqual(
      expect.objectContaining({
        fileName: "Qualification.png",
        relativePath: "Qualification.png"
      })
    );
    expect(results[0].snippet).toContain("OCR extracted e-invoicing qualification text");
  });

  it("indexes PPTX and XLSX content into persistent chunks", async () => {
    await fs.mkdir(path.join(tempRoot, "Enterprise"), { recursive: true });
    await writePptxFixture(
      path.join(tempRoot, "Enterprise", "E-Invoicing Sales Deck.pptx"),
      "VeriFactu rollout milestone",
      "Speaker notes mention Belgium readiness"
    );
    await writeXlsxFixture(path.join(tempRoot, "Enterprise", "Rollout Tracker.xlsx"));

    await runIndexToCompletion();
    const status = await getActiveIndexStatus({ checkForUpdates: false });
    const documents = listDocumentsBySource(status.source.id);
    const chunks = listSearchableChunks(status.source.id);

    expect(documents.map((document) => document.relativePath)).toEqual([
      "Enterprise/E-Invoicing Sales Deck.pptx",
      "Enterprise/Rollout Tracker.xlsx"
    ]);
    expect(chunks.map((chunk) => chunk.text).join(" ")).toContain("VeriFactu rollout milestone");
    expect(chunks.map((chunk) => chunk.text).join(" ")).toContain("Belgium | Ready for e-invoicing rollout");
  });

  it("recursively indexes nested supported business assets", async () => {
    await fs.mkdir(path.join(tempRoot, "Internal Videos", "France"), { recursive: true });
    await fs.writeFile(
      path.join(tempRoot, "Internal Videos", "France", "1 - OBN Registration.mp4"),
      "fake video bytes"
    );
    await fs.writeFile(
      path.join(tempRoot, "Internal Videos", "France", "1 - OBN Registration.vtt"),
      "WEBVTT\n00:00:00.000 --> 00:00:02.000\nOBN registration uses the e-invoicing portal."
    );
    await fs.writeFile(
      path.join(tempRoot, "Internal Videos", "France", "EI Spain VeriFactu Setup.url"),
      "[InternetShortcut]\nURL=https://internal.example/verifactu\n"
    );

    await runIndexToCompletion();
    const status = await getActiveIndexStatus({ checkForUpdates: false });
    const documents = listDocumentsBySource(status.source.id);

    expect(documents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          relativePath: "Internal Videos/France/1 - OBN Registration.mp4"
        }),
        expect.objectContaining({
          relativePath: "Internal Videos/France/EI Spain VeriFactu Setup.url"
        })
      ])
    );
    expect(documents.find((document) => document.extension === ".mp4")?.indexedMode).toBe(
      "TRANSCRIPT_LINKED"
    );
  });

  it("excludes selected documents from search, sources, and prompt context", async () => {
    await fs.writeFile(path.join(tempRoot, "outdated.md"), "Outdated Belgium tax note.");
    await fs.writeFile(path.join(tempRoot, "approved.md"), "Approved Portugal clearance flow.");
    await runIndexToCompletion();
    const status = await getActiveIndexStatus({ checkForUpdates: false });
    const outdated = listDocumentsBySource(status.source.id).find(
      (document) => document.relativePath === "outdated.md"
    );

    updateIndexedDocumentExclusion({
      documentId: outdated?.id || "",
      excludedFromChat: true,
      exclusionReason: "Outdated content"
    });

    const excludedResults = await searchIndexedDocuments("Belgium tax note");
    const activeResults = await searchIndexedDocuments("Portugal clearance");
    const prompt = buildChatPrompt({
      question: "What is the approved Portugal clearance flow?",
      guardrails: {
        systemGuardrails: ["Answer only from document context."],
        checkboxDefaults: {
          keepAnswersShort: true,
          includeSources: true,
          includeConfidenceScore: true,
          sayWhenInformationIsMissing: true,
          useBusinessFriendlyLanguage: true
        },
        userGuardrails: ""
      },
      contextChunks: activeResults
    });

    expect(excludedResults).toEqual([]);
    expect(activeResults[0].relativePath).toBe("approved.md");
    expect(prompt).toContain("Approved Portugal clearance flow");
    expect(prompt).not.toContain("Outdated Belgium tax note");
  });

  it("skips reprocessing documents excluded from future indexing and preserves exclusion metadata", async () => {
    const filePath = path.join(tempRoot, "legacy.md");
    await fs.writeFile(filePath, "Original indexed content.");
    await runIndexToCompletion();
    const firstStatus = await getActiveIndexStatus({ checkForUpdates: false });
    const legacy = listDocumentsBySource(firstStatus.source.id)[0];

    updateIndexedDocumentExclusion({
      documentId: legacy.id,
      excludedFromIndexing: true,
      exclusionReason: "Legacy source"
    });
    await fs.writeFile(filePath, "Changed content that should not replace chunks.");

    const secondRun = await runIndexToCompletion();
    const secondStatus = await getActiveIndexStatus({ checkForUpdates: false });
    const [document] = listDocumentsBySource(secondStatus.source.id);
    const chunks = listSearchableChunks(secondStatus.source.id);

    expect(secondRun.filesSkipped).toBeGreaterThanOrEqual(1);
    expect(document.excludedFromIndexing).toBe(1);
    expect(document.exclusionReason).toBe("Legacy source");
    expect(chunks[0].text).toContain("Original indexed content");
    expect(chunks[0].text).not.toContain("Changed content");
  });

  it("bulk excludes documents and can re-enable them", async () => {
    await fs.writeFile(path.join(tempRoot, "one.md"), "First indexed document.");
    await fs.writeFile(path.join(tempRoot, "two.md"), "Second indexed document.");
    await runIndexToCompletion();
    const status = await getActiveIndexStatus({ checkForUpdates: false });
    const documentIds = listDocumentsBySource(status.source.id).map((document) => document.id);

    const excluded = bulkUpdateIndexedDocumentExclusions({
      documentIds,
      excludedFromChat: true,
      excludedFromIndexing: true,
      exclusionReason: "Noisy batch"
    });
    expect(excluded.every((document) => document.excludedFromChat === 1)).toBe(true);
    expect(excluded.every((document) => document.excludedFromIndexing === 1)).toBe(true);

    const afterExcludeStatus = await getActiveIndexStatus({ checkForUpdates: false });
    expect(afterExcludeStatus.index.chatExcludedDocuments).toBe(2);
    expect(afterExcludeStatus.index.indexExcludedDocuments).toBe(2);
    expect(afterExcludeStatus.index.activeDocuments).toBe(0);

    const enabled = bulkUpdateIndexedDocumentExclusions({
      documentIds,
      excludedFromChat: false,
      excludedFromIndexing: false,
      exclusionReason: null
    });

    expect(enabled.every((document) => document.excludedFromChat === 0)).toBe(true);
    expect(enabled.every((document) => document.excludedFromIndexing === 0)).toBe(true);
    expect(enabled.every((document) => document.exclusionReason === null)).toBe(true);
  });

  it("skips unchanged files without creating duplicate documents or chunks", async () => {
    await fs.writeFile(path.join(tempRoot, "policy.md"), "Stable e-invoicing content.");
    await runIndexToCompletion();
    const statusAfterFirstRun = await getActiveIndexStatus({ checkForUpdates: false });
    const chunkCountAfterFirstRun = listSearchableChunks(statusAfterFirstRun.source.id).length;

    const secondRun = await runIndexToCompletion();
    const statusAfterSecondRun = await getActiveIndexStatus({ checkForUpdates: false });
    const documentsAfterSecondRun = listDocumentsBySource(statusAfterSecondRun.source.id);
    const chunksAfterSecondRun = listSearchableChunks(statusAfterSecondRun.source.id);

    expect(secondRun.filesIndexed).toBe(0);
    expect(secondRun.filesUpdated).toBe(0);
    expect(secondRun.filesSkipped).toBeGreaterThanOrEqual(1);
    expect(documentsAfterSecondRun).toHaveLength(1);
    expect(chunksAfterSecondRun).toHaveLength(chunkCountAfterFirstRun);
  });

  it("re-indexes changed files and replaces old chunks", async () => {
    await fs.writeFile(path.join(tempRoot, "policy.md"), "Initial content.");
    await runIndexToCompletion();

    await fs.writeFile(path.join(tempRoot, "policy.md"), "Updated content for Portugal e-invoicing.");
    const updateRun = await runIndexToCompletion();
    const status = await getActiveIndexStatus({ checkForUpdates: false });
    const documents = listDocumentsBySource(status.source.id);
    const chunks = listSearchableChunks(status.source.id);

    expect(updateRun.filesUpdated).toBe(1);
    expect(documents).toHaveLength(1);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toContain("Portugal e-invoicing");
  });

  it("marks deleted files missing and removes their chunks", async () => {
    const filePath = path.join(tempRoot, "removed.md");
    await fs.writeFile(filePath, "This document will be removed.");
    await runIndexToCompletion();
    await fs.rm(filePath);

    const deleteRun = await runIndexToCompletion();
    const status = await getActiveIndexStatus({ checkForUpdates: false });
    const documents = listDocumentsBySource(status.source.id);
    const chunks = listSearchableChunks(status.source.id);

    expect(deleteRun.filesUpdated).toBe(1);
    expect(status.index.indexedDocuments).toBe(0);
    expect(documents[0]).toEqual(expect.objectContaining({ isMissing: 1 }));
    expect(chunks).toHaveLength(0);
  });

  it("detects new files as stale without extracting them during status checks", async () => {
    await runIndexToCompletion();
    await fs.writeFile(path.join(tempRoot, "new-policy.md"), "New policy waiting for indexing.");

    const status = await getActiveIndexStatus();

    expect(status.index.status).toBe("EMPTY");
    expect(status.index.needsUpdate).toBe(true);
    expect(status.index.newFiles).toBe(1);
    expect(status.index.indexedDocuments).toBe(0);
  });
});

async function runIndexToCompletion() {
  const run = await startIndexRun();

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const current = getIndexRunProgress(run.id);

    if (current && current.status !== "QUEUED" && current.status !== "RUNNING") {
      expect(current.status).toBe("COMPLETED");
      return current;
    }

    await new Promise((resolve) => setTimeout(resolve, 15));
  }

  throw new Error("Index run did not finish.");
}

async function writePptxFixture(
  filePath: string,
  slideText: string,
  notesText: string
): Promise<void> {
  const zip = new JSZip();
  zip.file("ppt/slides/slide1.xml", `<p:sld><a:t>${slideText}</a:t></p:sld>`);
  zip.file("ppt/notesSlides/notesSlide1.xml", `<p:notes><a:t>${notesText}</a:t></p:notes>`);
  await fs.writeFile(filePath, await zip.generateAsync({ type: "nodebuffer" }));
}

async function writeXlsxFixture(filePath: string): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Rollout");
  worksheet.addRow(["Country", "Status"]);
  worksheet.addRow(["Belgium", "Ready for e-invoicing rollout"]);
  await workbook.xlsx.writeFile(filePath);
}

async function writePngFixture(filePath: string): Promise<void> {
  const buffer = Buffer.alloc(33);
  buffer.writeUInt8(0x89, 0);
  buffer.write("PNG", 1, "ascii");
  buffer.writeUInt32BE(64, 16);
  buffer.writeUInt32BE(32, 20);
  await fs.writeFile(filePath, buffer);
}
