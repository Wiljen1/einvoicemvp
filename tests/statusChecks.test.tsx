// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StatusChecks } from "@/components/StatusChecks";
import type { ChatSessionStatus } from "@/types/chat";

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

  it("shows the SharePoint folder when SharePoint is the active source", async () => {
    mockStatusFetch({
      activeSource: "GRAPH_SHAREPOINT",
      available: true,
      displayName: "SharePoint folder",
      folderUrl: "https://company.sharepoint.com/sites/einvoice/docs",
      folderPath: "Shared Documents/Approved",
      configuredSharePointFolderUrl: "https://company.sharepoint.com/sites/einvoice/docs",
      configuredSharePointFolderPath: "Shared Documents/Approved",
      fileCount: 0,
      skippedFileCount: 0,
      recursive: true,
      maxDepth: 10,
      supportedExtensions: [".txt", ".md", ".json", ".csv", ".pdf"],
      lastIndexedAt: "",
      message: "SharePoint folder connected"
    });

    render(
      <StatusChecks processingStatus={idleStatus} refreshKey={0} onRefresh={() => undefined} />
    );

    await waitFor(() => {
      expect(screen.getByText("Active Source: SharePoint")).toBeInTheDocument();
    });
    expect(
      screen.getByText("Folder: https://company.sharepoint.com/sites/einvoice/docs")
    ).toBeInTheDocument();
  });

  it("shows the mock folder only when mock documents are active", async () => {
    mockStatusFetch({
      activeSource: "MOCK_FOLDER",
      available: true,
      displayName: "Local documents",
      folderUrl: null,
      folderPath: "/documents",
      configuredSharePointFolderUrl: null,
      configuredSharePointFolderPath: "",
      fileCount: 2,
      skippedFileCount: 1,
      recursive: true,
      maxDepth: 10,
      supportedExtensions: [".txt", ".md", ".json", ".csv", ".pdf"],
      lastIndexedAt: "2026-05-20T10:00:00.000Z",
      indexedFiles: [
        { fileName: "approved.md", relativePath: "Policies/approved.md", path: "/documents/Policies/approved.md", size: 10, lastModified: "2026-05-20T09:00:00.000Z" },
        { fileName: "data.csv", relativePath: "data.csv", path: "/documents/data.csv", size: 8, lastModified: "2026-05-20T09:00:00.000Z" }
      ],
      skippedFiles: [{ fileName: "deck.pptx", relativePath: "Slides/deck.pptx", path: "/documents/Slides/deck.pptx", reason: "Unsupported file type (.pptx)" }],
      message: "Local documents connected"
    });

    render(
      <StatusChecks processingStatus={idleStatus} refreshKey={0} onRefresh={() => undefined} />
    );

    await waitFor(() => {
      expect(screen.getByText("Active Source: Local documents")).toBeInTheDocument();
    });
    expect(screen.getByText("Folder: /documents")).toBeInTheDocument();
    expect(screen.getByText("Files Found: 2")).toBeInTheDocument();
    expect(screen.getByText("Recursive Scan: Enabled")).toBeInTheDocument();
    expect(screen.getByText(/Supported: .*\.pdf/)).toBeInTheDocument();
    expect(screen.getByText("Indexed files (2)")).toBeInTheDocument();
    expect(screen.getByText("Skipped files (1)")).toBeInTheDocument();
    expect(screen.getByText(/Slides\/deck.pptx - Unsupported file type/)).toBeInTheDocument();
  });

  it("shows configured SharePoint folder when mock is active", async () => {
    mockStatusFetch({
      activeSource: "MOCK_FOLDER",
      available: true,
      displayName: "Local documents",
      folderUrl: null,
      folderPath: "/documents",
      configuredSharePointFolderUrl: "https://company.sharepoint.com/sites/einvoice/docs",
      configuredSharePointFolderPath: "Shared Documents/Approved",
      fileCount: 1,
      skippedFileCount: 0,
      recursive: true,
      maxDepth: 10,
      supportedExtensions: [".txt", ".md", ".json", ".csv", ".pdf"],
      lastIndexedAt: "2026-05-20T10:00:00.000Z",
      indexedFiles: [
        { fileName: "approved.md", relativePath: "approved.md", path: "/documents/approved.md", size: 10, lastModified: "2026-05-20T09:00:00.000Z" }
      ],
      message: "Local documents connected"
    });

    render(
      <StatusChecks processingStatus={idleStatus} refreshKey={0} onRefresh={() => undefined} />
    );

    await waitFor(() => {
      expect(screen.getByText("Active Source: Local documents")).toBeInTheDocument();
    });
    expect(
      screen.getByText("Configured SharePoint folder: https://company.sharepoint.com/sites/einvoice/docs")
    ).toBeInTheDocument();
  });
});

function mockStatusFetch(documents: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
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
          sharepoint: {
            available: true,
            message: "SharePoint folder connected",
            activeFolder: "",
            mode: "sharepoint"
          },
          documents
        }
      })
    }))
  );
}
