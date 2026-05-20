// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StatusChecks } from "@/components/StatusChecks";
import type { ChatSessionStatus } from "@/types/chat";
import type { DocumentIndexStatus } from "@/types/document";

const idleStatus: ChatSessionStatus = {
  sessionId: "",
  status: "IDLE",
  progress: 0,
  step: "Idle",
  answer: null,
  confidence: null,
  sources: [],
  error: null
};

describe("StatusChecks", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the synced SharePoint folder path when it is the active local source", async () => {
    mockStatusFetch({
      activeSource: "SYNCED_SHAREPOINT_FOLDER",
      available: true,
      exists: true,
      displayName: "Synced SharePoint Folder",
      folderUrl: null,
      folderPath: "/Users/person/OneDrive/Electronic Invoicing",
      fileCount: 0,
      activeFileCount: 0,
      chatExcludedFileCount: 0,
      indexExcludedFileCount: 0,
      skippedFileCount: 0,
      indexedCount: 0,
      skippedCount: 0,
      failedFileCount: 0,
      ocrEnabled: false,
      ocrProcessedCount: 0,
      ocrFailedFiles: [],
      recursive: true,
      maxDepth: 10,
      supportedExtensions: [".txt", ".md", ".json", ".csv", ".pdf", ".png", ".jpg"],
      indexedFiles: [],
      skippedFiles: [],
      lastIndexedAt: "",
      message: "Documents indexed"
    });

    render(
      <StatusChecks processingStatus={idleStatus} refreshKey={0} onRefresh={() => undefined} />
    );

    await waitFor(() => {
      expect(screen.getAllByText("Synced SharePoint Folder").length).toBeGreaterThan(0);
    });
    expect(
      screen.getByText("/Users/person/OneDrive/Electronic Invoicing")
    ).toBeInTheDocument();
  });

  it("shows local folder details only when local documents are active", async () => {
    mockStatusFetch({
      activeSource: "LOCAL_FOLDER",
      available: true,
      exists: true,
      displayName: "Local Folder",
      folderUrl: null,
      folderPath: "/documents",
      fileCount: 2,
      activeFileCount: 1,
      chatExcludedFileCount: 1,
      indexExcludedFileCount: 0,
      skippedFileCount: 1,
      indexedCount: 2,
      skippedCount: 1,
      failedFileCount: 0,
      ocrEnabled: true,
      ocrProcessedCount: 1,
      ocrFailedFiles: [
        { fileName: "scan.png", relativePath: "Images/scan.png", extension: ".png", reason: "OCR completed but did not find readable text." }
      ],
      recursive: true,
      maxDepth: 10,
      supportedExtensions: [".txt", ".md", ".json", ".csv", ".pdf", ".png", ".jpg"],
      lastIndexedAt: "2026-05-20T10:00:00.000Z",
      indexedFiles: [
        { id: "1", fileName: "approved.md", relativePath: "Policies/approved.md", absolutePath: "/documents/Policies/approved.md", extension: ".md", path: "/documents/Policies/approved.md", size: 10, lastModified: "2026-05-20T09:00:00.000Z", sourceType: "LOCAL_FOLDER", indexedMode: "FULL_TEXT", excludedFromChat: false, excludedFromIndexing: false, exclusionReason: null, excludedAt: null, excludedBy: null, metadata: { size: 10, lastModified: "2026-05-20T09:00:00.000Z" } },
        { id: "2", fileName: "data.csv", relativePath: "data.csv", absolutePath: "/documents/data.csv", extension: ".csv", path: "/documents/data.csv", size: 8, lastModified: "2026-05-20T09:00:00.000Z", sourceType: "LOCAL_FOLDER", indexedMode: "FULL_TEXT", excludedFromChat: true, excludedFromIndexing: false, exclusionReason: "Outdated", excludedAt: "2026-05-20T09:30:00.000Z", excludedBy: "local-user", metadata: { size: 8, lastModified: "2026-05-20T09:00:00.000Z" } }
      ],
      skippedFiles: [{ fileName: "archive.doc", relativePath: "Docs/archive.doc", absolutePath: "/documents/Docs/archive.doc", extension: ".doc", path: "/documents/Docs/archive.doc", reason: "Unsupported file type (.doc)" }],
      message: "Documents indexed"
    });

    render(
      <StatusChecks processingStatus={idleStatus} refreshKey={0} onRefresh={() => undefined} />
    );

    await waitFor(() => {
      expect(screen.getAllByText("Local Folder").length).toBeGreaterThan(0);
    });
    expect(screen.getByText("/documents")).toBeInTheDocument();
    expect(screen.getByText("Indexed documents")).toBeInTheDocument();
    expect(screen.getByText("Active documents")).toBeInTheDocument();
    expect(screen.getByText("Chat excluded")).toBeInTheDocument();
    expect(screen.getByText("Indexed chunks")).toBeInTheDocument();
    expect(screen.getByText("Indexed files (2)")).toBeInTheDocument();
    expect(screen.getByText("Skipped files (1)")).toBeInTheDocument();
    expect(screen.getByText("OCR")).toBeInTheDocument();
    expect(screen.getByText("OCR processed")).toBeInTheDocument();
    expect(screen.getByText("Supported files")).toBeInTheDocument();
    expect(screen.getByText(/pdfExtractor/)).toBeInTheDocument();
    expect(screen.getByText(/Docs\/archive.doc - Unsupported file type/)).toBeInTheDocument();
  });

  it("shows manual upload as an active source without SharePoint status", async () => {
    mockStatusFetch({
      activeSource: "MANUAL_UPLOAD",
      available: true,
      exists: true,
      displayName: "Manual Upload",
      folderUrl: null,
      folderPath: "/uploaded-documents",
      fileCount: 1,
      activeFileCount: 1,
      chatExcludedFileCount: 0,
      indexExcludedFileCount: 0,
      skippedFileCount: 0,
      indexedCount: 1,
      skippedCount: 0,
      failedFileCount: 0,
      ocrEnabled: false,
      ocrProcessedCount: 0,
      ocrFailedFiles: [],
      recursive: true,
      maxDepth: 10,
      supportedExtensions: [".txt", ".md", ".json", ".csv", ".pdf"],
      lastIndexedAt: "2026-05-20T10:00:00.000Z",
      indexedFiles: [
        { id: "1", fileName: "approved.md", relativePath: "approved.md", absolutePath: "/uploaded-documents/approved.md", extension: ".md", path: "/uploaded-documents/approved.md", size: 10, lastModified: "2026-05-20T09:00:00.000Z", sourceType: "MANUAL_UPLOAD", indexedMode: "FULL_TEXT", excludedFromChat: false, excludedFromIndexing: false, exclusionReason: null, excludedAt: null, excludedBy: null, metadata: { size: 10, lastModified: "2026-05-20T09:00:00.000Z" } }
      ],
      skippedFiles: [],
      message: "Documents indexed"
    });

    render(
      <StatusChecks processingStatus={idleStatus} refreshKey={0} onRefresh={() => undefined} />
    );

    await waitFor(() => {
      expect(screen.getAllByText("Manual Upload").length).toBeGreaterThan(0);
    });
    expect(screen.getByText("/uploaded-documents")).toBeInTheDocument();
    expect(screen.queryByText(/Microsoft signed in|SharePoint folder connected/)).not.toBeInTheDocument();
  });
});

function mockStatusFetch(inputDocuments: Omit<DocumentIndexStatus, "startupValidation"> & Partial<Pick<DocumentIndexStatus, "startupValidation">>) {
  const documents: DocumentIndexStatus = {
    ...inputDocuments,
    startupValidation: inputDocuments.startupValidation || buildStartupValidation(inputDocuments)
  };

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url.includes("/api/index/status")) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            data: {
              source: {
                id: "source-1",
                type: documents.activeSource,
                displayName: documents.displayName,
                rootPath: documents.folderPath
              },
              index: {
                status: documents.fileCount > 0 ? "FRESH" : "EMPTY",
                lastIndexedAt: documents.lastIndexedAt || null,
                indexedDocuments: documents.fileCount,
                indexedChunks: documents.fileCount * 2,
                activeDocuments: documents.activeFileCount,
                activeChunks: documents.activeFileCount * 2,
                needsUpdate: false,
                newFiles: 0,
                changedFiles: 0,
                deletedFiles: 0,
                chatExcludedDocuments: documents.chatExcludedFileCount,
                indexExcludedDocuments: documents.indexExcludedFileCount,
                failedDocuments: 0,
                skippedDocuments: documents.skippedFileCount,
                ocrEnabled: documents.ocrEnabled,
                startupValidation: documents.startupValidation,
                lastRun: null
              }
            }
          })
        };
      }

      if (url.includes("/api/index/documents")) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            data: {
              documents: documents.indexedFiles || []
            }
          })
        };
      }

      return {
        ok: true,
        json: async () => ({
          ok: true,
          data: {
            codex: {
              available: true,
              message: "Codex detected and operational",
              executionMode: "operator",
              binaryPath: "codex"
            },
            documents
          }
        })
      };
    })
  );
}

function buildStartupValidation(documents: Pick<DocumentIndexStatus, "activeSource" | "folderPath" | "supportedExtensions" | "ocrEnabled">): DocumentIndexStatus["startupValidation"] {
  return {
    database: {
      connected: true,
      message: "Local index database connected"
    },
    ocrService: {
      loaded: true,
      enabled: documents.ocrEnabled,
      message: documents.ocrEnabled ? "OCR service enabled (eng)" : "OCR service is disabled. Scanned documents may not be searchable."
    },
    activeSource: {
      available: true,
      type: documents.activeSource,
      rootPath: documents.folderPath,
      message: "Active document source accessible"
    },
    extractors: {
      registered: [
        "pdfExtractor",
        "ocrExtractor",
        "pptxExtractor",
        "xlsxExtractor",
        "imageExtractor",
        "urlExtractor",
        "videoMetadataExtractor"
      ],
      supportedExtensions: documents.supportedExtensions
    },
    warnings: documents.ocrEnabled ? [] : ["OCR service is disabled. Scanned documents may not be searchable."]
  };
}
