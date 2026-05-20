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

  it("shows the synced SharePoint folder path when it is the active local source", async () => {
    mockStatusFetch({
      activeSource: "SYNCED_SHAREPOINT_FOLDER",
      available: true,
      displayName: "Synced SharePoint Folder",
      folderUrl: null,
      folderPath: "/Users/person/OneDrive/Electronic Invoicing",
      fileCount: 0,
      skippedFileCount: 0,
      indexedCount: 0,
      skippedCount: 0,
      recursive: true,
      maxDepth: 10,
      supportedExtensions: [".txt", ".md", ".json", ".csv", ".pdf"],
      indexedFiles: [],
      skippedFiles: [],
      lastIndexedAt: "",
      message: "Documents indexed"
    });

    render(
      <StatusChecks processingStatus={idleStatus} refreshKey={0} onRefresh={() => undefined} />
    );

    await waitFor(() => {
      expect(screen.getByText("Active Source: Synced SharePoint Folder")).toBeInTheDocument();
    });
    expect(
      screen.getByText("Folder: /Users/person/OneDrive/Electronic Invoicing")
    ).toBeInTheDocument();
  });

  it("shows local folder details only when local documents are active", async () => {
    mockStatusFetch({
      activeSource: "LOCAL_FOLDER",
      available: true,
      displayName: "Local Folder",
      folderUrl: null,
      folderPath: "/documents",
      fileCount: 2,
      skippedFileCount: 1,
      indexedCount: 2,
      skippedCount: 1,
      recursive: true,
      maxDepth: 10,
      supportedExtensions: [".txt", ".md", ".json", ".csv", ".pdf"],
      lastIndexedAt: "2026-05-20T10:00:00.000Z",
      indexedFiles: [
        { id: "1", fileName: "approved.md", relativePath: "Policies/approved.md", absolutePath: "/documents/Policies/approved.md", extension: ".md", path: "/documents/Policies/approved.md", size: 10, lastModified: "2026-05-20T09:00:00.000Z", sourceType: "LOCAL_FOLDER", metadata: { size: 10, lastModified: "2026-05-20T09:00:00.000Z" } },
        { id: "2", fileName: "data.csv", relativePath: "data.csv", absolutePath: "/documents/data.csv", extension: ".csv", path: "/documents/data.csv", size: 8, lastModified: "2026-05-20T09:00:00.000Z", sourceType: "LOCAL_FOLDER", metadata: { size: 8, lastModified: "2026-05-20T09:00:00.000Z" } }
      ],
      skippedFiles: [{ fileName: "archive.docx", relativePath: "Docs/archive.docx", absolutePath: "/documents/Docs/archive.docx", extension: ".docx", path: "/documents/Docs/archive.docx", reason: "Unsupported file type (.docx)" }],
      message: "Documents indexed"
    });

    render(
      <StatusChecks processingStatus={idleStatus} refreshKey={0} onRefresh={() => undefined} />
    );

    await waitFor(() => {
      expect(screen.getByText("Active Source: Local Folder")).toBeInTheDocument();
    });
    expect(screen.getByText("Folder: /documents")).toBeInTheDocument();
    expect(screen.getByText("Indexed files: 2")).toBeInTheDocument();
    expect(screen.getByText("Recursive Scan: Enabled")).toBeInTheDocument();
    expect(screen.getByText(/Supported: .*\.pdf/)).toBeInTheDocument();
    expect(screen.getByText("Indexed files (2)")).toBeInTheDocument();
    expect(screen.getByText("Skipped files (1)")).toBeInTheDocument();
    expect(screen.getByText(/Docs\/archive.docx - Unsupported file type/)).toBeInTheDocument();
  });

  it("shows manual upload as an active source without SharePoint status", async () => {
    mockStatusFetch({
      activeSource: "MANUAL_UPLOAD",
      available: true,
      displayName: "Manual Upload",
      folderUrl: null,
      folderPath: "/uploaded-documents",
      fileCount: 1,
      skippedFileCount: 0,
      indexedCount: 1,
      skippedCount: 0,
      recursive: true,
      maxDepth: 10,
      supportedExtensions: [".txt", ".md", ".json", ".csv", ".pdf"],
      lastIndexedAt: "2026-05-20T10:00:00.000Z",
      indexedFiles: [
        { id: "1", fileName: "approved.md", relativePath: "approved.md", absolutePath: "/uploaded-documents/approved.md", extension: ".md", path: "/uploaded-documents/approved.md", size: 10, lastModified: "2026-05-20T09:00:00.000Z", sourceType: "MANUAL_UPLOAD", metadata: { size: 10, lastModified: "2026-05-20T09:00:00.000Z" } }
      ],
      skippedFiles: [],
      message: "Documents indexed"
    });

    render(
      <StatusChecks processingStatus={idleStatus} refreshKey={0} onRefresh={() => undefined} />
    );

    await waitFor(() => {
      expect(screen.getByText("Active Source: Manual Upload")).toBeInTheDocument();
    });
    expect(screen.getByText("Folder: /uploaded-documents")).toBeInTheDocument();
    expect(screen.queryByText(/Microsoft signed in|SharePoint folder connected/)).not.toBeInTheDocument();
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
          documents
        }
      })
    }))
  );
}
