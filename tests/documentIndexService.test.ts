import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
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
    await fs.writeFile(path.join(tempRoot, "sheet.xlsx"), "not parsed");

    const index = await refreshLocalDocumentIndex();

    expect(index.activeSource).toBe("LOCAL_SYNCED_FOLDER");
    expect(index.fileCount).toBe(3);
    expect(index.supportedExtensions).toContain(".pdf");
    expect(index.indexedFiles.map((file) => file.fileName).sort()).toEqual([
      "approved.md",
      "data.json",
      "deck.pdf"
    ]);
    expect(index.indexedFiles.find((file) => file.fileName === "deck.pdf")?.metadata.pageCount).toBe(3);
    expect(index.skippedFiles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fileName: "sheet.xlsx",
          reason: expect.stringContaining("Unsupported file type (.xlsx)")
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
    expect(payload.data.indexedFiles).toBe(1);
    expect(payload.data.indexedFileDetails[0].fileName).toBe("new-file.csv");
  });
});
