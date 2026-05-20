import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as GET_STATUS } from "@/app/api/documents/status/route";
import { POST as POST_REFRESH } from "@/app/api/documents/refresh/route";
import { defaultDocumentsDirectory, getLocalDocumentsPath } from "@/lib/paths";
import {
  getLocalApprovedDocuments,
  refreshLocalDocumentIndex,
  resetDocumentIndexForTests
} from "@/services/documentIndexService";
import { searchDocuments } from "@/services/documentSearchService";

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
      if (this.rawText.includes("THROW_PDF")) {
        throw new Error("Cannot parse PDF");
      }

      return {
        text: this.rawText.includes("SCANNED_PDF") ? "" : this.rawText,
        total: 3
      };
    }

    async destroy() {
      return undefined;
    }
  }
}));

vi.mock("pdf-parse/worker", () => ({
  getData: () => "data:text/javascript;base64,"
}));

describe("documentIndexService", () => {
  let tempRoot = "";

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "einvoice-docs-"));
    vi.stubEnv("DOCUMENT_SOURCE_DISABLE_LOCAL_CONFIG", "true");
    vi.stubEnv("DOCUMENT_SOURCE_MODE", "LOCAL_FOLDER");
    vi.stubEnv("SYNCED_SHAREPOINT_FOLDER_PATH", "");
    vi.stubEnv("MAX_TEXT_EXTRACTION_FILE_SIZE_MB", "100");
    vi.stubEnv("MAX_VIDEO_METADATA_FILE_SIZE_MB", "500");
    resetDocumentIndexForTests();
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    resetDocumentIndexForTests();
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it("resolves the default /documents path", () => {
    vi.stubEnv("LOCAL_DOCUMENTS_PATH", "");

    expect(getLocalDocumentsPath()).toBe(defaultDocumentsDirectory);
  });

  it("uses LOCAL_DOCUMENTS_PATH when provided", () => {
    vi.stubEnv("LOCAL_DOCUMENTS_PATH", tempRoot);

    expect(getLocalDocumentsPath()).toBe(tempRoot);
  });

  it("reports a missing LOCAL_DOCUMENTS_PATH folder without creating it", async () => {
    const missingFolder = path.join(tempRoot, "missing");
    vi.stubEnv("LOCAL_DOCUMENTS_PATH", missingFolder);

    const index = await refreshLocalDocumentIndex();

    expect(index.exists).toBe(false);
    expect(index.available).toBe(false);
    expect(index.folderPath).toBe(missingFolder);
    expect(index.fileCount).toBe(0);
  });

  it("indexes readable files, PDFs, and skips unsupported files", async () => {
    vi.stubEnv("LOCAL_DOCUMENTS_PATH", tempRoot);
    await fs.writeFile(path.join(tempRoot, "approved.md"), "Approved local content");
    await fs.writeFile(path.join(tempRoot, "data.json"), "{\"enabled\":true}");
    await fs.writeFile(path.join(tempRoot, "deck.pdf"), "PDF local text");
    await fs.writeFile(path.join(tempRoot, "sheet.docx"), "not parsed");

    const index = await refreshLocalDocumentIndex();

    expect(index.activeSource).toBe("LOCAL_FOLDER");
    expect(index.fileCount).toBe(3);
    expect(index.supportedExtensions).toContain(".pdf");
    expect(index.indexedFiles.map((file) => file.fileName).sort()).toEqual([
      "approved.md",
      "data.json",
      "deck.pdf"
    ]);
    expect(index.indexedFiles.find((file) => file.fileName === "deck.pdf")?.metadata.pageCount).toBe(3);
    expect(index.indexedFiles.find((file) => file.fileName === "deck.pdf")?.indexedMode).toBe("FULL_TEXT");
    expect(index.skippedFiles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fileName: "sheet.docx",
          reason: expect.stringContaining("Unsupported file type (.docx)")
        })
      ])
    );
  });

  it("recursively scans nested folders and preserves relative paths", async () => {
    vi.stubEnv("LOCAL_DOCUMENTS_PATH", tempRoot);
    await fs.mkdir(path.join(tempRoot, "Tax", "VAT"), { recursive: true });
    await fs.writeFile(path.join(tempRoot, "Tax", "VAT", "guide.md"), "Nested VAT rules");

    const index = await refreshLocalDocumentIndex();

    expect(index.recursive).toBe(true);
    expect(index.fileCount).toBe(1);
    expect(index.indexedFiles[0].relativePath).toBe("Tax/VAT/guide.md");
    expect(index.documents[0].relativePath).toBe("Tax/VAT/guide.md");
  });

  it("honors max depth when recursively scanning", async () => {
    vi.stubEnv("LOCAL_DOCUMENTS_PATH", tempRoot);
    vi.stubEnv("LOCAL_DOCUMENTS_MAX_DEPTH", "1");
    await fs.mkdir(path.join(tempRoot, "Level1", "Level2"), { recursive: true });
    await fs.writeFile(path.join(tempRoot, "Level1", "included.md"), "Included");
    await fs.writeFile(path.join(tempRoot, "Level1", "Level2", "excluded.md"), "Excluded");

    const index = await refreshLocalDocumentIndex();

    expect(index.fileCount).toBe(1);
    expect(index.indexedFiles[0].relativePath).toBe("Level1/included.md");
    expect(index.skippedFiles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          relativePath: "Level1/Level2",
          reason: "Max folder depth 1 reached"
        })
      ])
    );
  });

  it("indexes a PDF inside a nested subfolder", async () => {
    vi.stubEnv("LOCAL_DOCUMENTS_PATH", tempRoot);
    await fs.mkdir(path.join(tempRoot, "Tax"), { recursive: true });
    await fs.writeFile(path.join(tempRoot, "Tax", "VAT guide.pdf"), "Nested PDF VAT content");

    const index = await refreshLocalDocumentIndex();

    expect(index.fileCount).toBe(1);
    expect(index.indexedFiles[0]).toEqual(
      expect.objectContaining({
        fileName: "VAT guide.pdf",
        relativePath: "Tax/VAT guide.pdf",
        extension: ".pdf"
      })
    );
    expect(index.documents[0].content).toContain("Nested PDF VAT content");
  });

  it("skips scanned or unreadable PDFs gracefully", async () => {
    vi.stubEnv("LOCAL_DOCUMENTS_PATH", tempRoot);
    await fs.writeFile(path.join(tempRoot, "scanned.pdf"), "SCANNED_PDF");
    await fs.writeFile(path.join(tempRoot, "broken.pdf"), "THROW_PDF");

    const index = await refreshLocalDocumentIndex();

    expect(index.fileCount).toBe(0);
    expect(index.skippedFiles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fileName: "scanned.pdf",
          reason: "PDF contains no extractable text or may be scanned."
        }),
        expect.objectContaining({
          fileName: "broken.pdf",
          reason: expect.stringContaining("Unable to extract PDF text")
        })
      ])
    );
  });

  it("refresh clears stale index entries", async () => {
    vi.stubEnv("LOCAL_DOCUMENTS_PATH", tempRoot);
    const stalePath = path.join(tempRoot, "stale.md");
    await fs.writeFile(stalePath, "Stale content");
    await refreshLocalDocumentIndex();

    await fs.rm(stalePath);
    await fs.writeFile(path.join(tempRoot, "fresh.md"), "Fresh content");
    const index = await refreshLocalDocumentIndex();

    expect(index.indexedFiles.map((file) => file.fileName)).toEqual(["fresh.md"]);
  });

  it("chat search finds content from a nested PDF", async () => {
    vi.stubEnv("LOCAL_DOCUMENTS_PATH", tempRoot);
    await fs.mkdir(path.join(tempRoot, "Tax"), { recursive: true });
    await fs.writeFile(path.join(tempRoot, "Tax", "VAT guide.pdf"), "Nested PDF VAT compliance answer");

    const documents = await getLocalApprovedDocuments({ force: true });
    const results = searchDocuments("VAT compliance", documents);

    expect(results[0].relativePath).toBe("Tax/VAT guide.pdf");
    expect(results[0].snippet).toContain("VAT compliance");
  });

  it("indexes PPTX, XLSX, PNG, MP4, and URL business assets", async () => {
    vi.stubEnv("LOCAL_DOCUMENTS_PATH", tempRoot);
    await fs.mkdir(path.join(tempRoot, "Sales"), { recursive: true });
    await writePptxFixture(
      path.join(tempRoot, "Sales", "E-Invoicing Sales Deck.pptx"),
      "Belgium installation overview",
      "Speaker note about electronic invoicing"
    );
    await writeXlsxFixture(path.join(tempRoot, "Sales", "Implementation Tracker.xlsx"));
    await writePngFixture(path.join(tempRoot, "Qualification.png"));
    await fs.writeFile(path.join(tempRoot, "Internal Demo.mp4"), "fake video bytes");
    await fs.writeFile(
      path.join(tempRoot, "EI Spain VeriFactu Setup.url"),
      "[InternetShortcut]\nURL=https://internal.example/verifactu\n"
    );

    const index = await refreshLocalDocumentIndex();

    expect(index.fileCount).toBe(5);
    expect(index.supportedExtensions).toEqual(
      expect.arrayContaining([".pptx", ".xlsx", ".png", ".mp4", ".url"])
    );
    expect(index.indexedFiles.find((file) => file.extension === ".pptx")).toEqual(
      expect.objectContaining({
        relativePath: "Sales/E-Invoicing Sales Deck.pptx",
        indexedMode: "FULL_TEXT",
        metadata: expect.objectContaining({ slideCount: 1 })
      })
    );
    expect(index.indexedFiles.find((file) => file.extension === ".xlsx")).toEqual(
      expect.objectContaining({
        indexedMode: "FULL_TEXT",
        metadata: expect.objectContaining({
          sheetCount: 1,
          sheetNames: ["Rollout"]
        })
      })
    );
    expect(index.indexedFiles.find((file) => file.extension === ".png")?.indexedMode).toBe(
      "PARTIAL_METADATA"
    );
    expect(index.indexedFiles.find((file) => file.extension === ".mp4")?.indexedMode).toBe(
      "PARTIAL_METADATA"
    );
    expect(index.indexedFiles.find((file) => file.extension === ".url")?.metadata.targetUrl).toBe(
      "https://internal.example/verifactu"
    );
  });

  it("links nearby video transcripts when available", async () => {
    vi.stubEnv("LOCAL_DOCUMENTS_PATH", tempRoot);
    await fs.mkdir(path.join(tempRoot, "Internal Videos", "France"), { recursive: true });
    await fs.writeFile(
      path.join(tempRoot, "Internal Videos", "France", "1 - OBN Registration.mp4"),
      "fake video bytes"
    );
    await fs.writeFile(
      path.join(tempRoot, "Internal Videos", "France", "1 - OBN Registration.vtt"),
      "WEBVTT\n00:00:00.000 --> 00:00:02.000\nOBN registration uses the e-invoicing portal."
    );

    const index = await refreshLocalDocumentIndex();
    const video = index.indexedFiles.find((file) => file.extension === ".mp4");

    expect(video).toEqual(
      expect.objectContaining({
        relativePath: "Internal Videos/France/1 - OBN Registration.mp4",
        indexedMode: "TRANSCRIPT_LINKED",
        metadata: expect.objectContaining({
          transcriptPath: "Internal Videos/France/1 - OBN Registration.vtt"
        })
      })
    );
    expect(index.documents.find((document) => document.extension === ".mp4")?.content).toContain(
      "OBN registration uses the e-invoicing portal"
    );
  });

  it("indexes metadata instead of skipping large supported files", async () => {
    vi.stubEnv("LOCAL_DOCUMENTS_PATH", tempRoot);
    vi.stubEnv("MAX_TEXT_EXTRACTION_FILE_SIZE_MB", "1");
    await fs.writeFile(path.join(tempRoot, "large-policy.md"), "A".repeat(1024 * 1024 + 1));

    const index = await refreshLocalDocumentIndex();

    expect(index.fileCount).toBe(1);
    expect(index.skippedFileCount).toBe(0);
    expect(index.indexedFiles[0]).toEqual(
      expect.objectContaining({
        fileName: "large-policy.md",
        indexedMode: "PARTIAL_METADATA"
      })
    );
    expect(index.documents[0].content).toContain("exceeds the configured full-text extraction limit");
  });

  it("searches extracted text, filenames, metadata, folders, and transcripts", async () => {
    vi.stubEnv("LOCAL_DOCUMENTS_PATH", tempRoot);
    await fs.mkdir(path.join(tempRoot, "Internal Videos"), { recursive: true });
    await writePptxFixture(
      path.join(tempRoot, "enterprise-roadmap.pptx"),
      "VeriFactu rollout milestone",
      ""
    );
    await fs.writeFile(path.join(tempRoot, "Internal Videos", "demo.mp4"), "fake video bytes");
    await fs.writeFile(
      path.join(tempRoot, "Internal Videos", "demo.txt"),
      "The installation demo explains Belgium setup."
    );

    const documents = await getLocalApprovedDocuments({ force: true });
    const pptResults = searchDocuments("VeriFactu milestone", documents);
    const videoResults = searchDocuments("Belgium setup demo", documents);

    expect(pptResults[0].relativePath).toBe("enterprise-roadmap.pptx");
    expect(videoResults.some((result) => result.relativePath === "Internal Videos/demo.mp4")).toBe(
      true
    );
  });

  it("returns document status from the status endpoint", async () => {
    vi.stubEnv("LOCAL_DOCUMENTS_PATH", tempRoot);
    await fs.writeFile(path.join(tempRoot, "approved.txt"), "Approved local content");

    const response = await GET_STATUS();
    const payload = await response.json();

    expect(payload.ok).toBe(true);
    expect(payload.data.folderPath).toBe(tempRoot);
    expect(payload.data.fileCount).toBe(1);
    expect(payload.data.recursive).toBe(true);
    expect(payload.data.supportedExtensions).toContain(".pdf");
    expect(payload.data.indexedFiles[0].fileName).toBe("approved.txt");
  });

  it("refresh endpoint detects a newly added file", async () => {
    vi.stubEnv("LOCAL_DOCUMENTS_PATH", tempRoot);
    await refreshLocalDocumentIndex();
    await fs.writeFile(path.join(tempRoot, "new-file.csv"), "invoice,status\n1,approved");

    const response = await POST_REFRESH();
    const payload = await response.json();

    expect(payload.ok).toBe(true);
    expect(payload.data.fileCount).toBe(1);
    expect(payload.data.indexedFiles[0].fileName).toBe("new-file.csv");
  });
});

async function writePptxFixture(filePath: string, slideText: string, notesText: string): Promise<void> {
  const zip = new JSZip();
  zip.file("ppt/slides/slide1.xml", `<p:sld><a:t>${slideText}</a:t></p:sld>`);
  if (notesText) {
    zip.file("ppt/notesSlides/notesSlide1.xml", `<p:notes><a:t>${notesText}</a:t></p:notes>`);
  }
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
