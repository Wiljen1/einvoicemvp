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
      activeSource: "SHAREPOINT",
      available: true,
      displayName: "SharePoint folder",
      folderUrl: "https://company.sharepoint.com/sites/einvoice/docs",
      folderPath: "Shared Documents/Approved",
      configuredSharePointFolderUrl: "https://company.sharepoint.com/sites/einvoice/docs",
      configuredSharePointFolderPath: "Shared Documents/Approved",
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
      activeSource: "MOCK",
      available: true,
      displayName: "Local mock documents",
      folderUrl: null,
      folderPath: "/documents",
      configuredSharePointFolderUrl: null,
      configuredSharePointFolderPath: "",
      message: "Using local mock documents"
    });

    render(
      <StatusChecks processingStatus={idleStatus} refreshKey={0} onRefresh={() => undefined} />
    );

    await waitFor(() => {
      expect(screen.getByText("Active Source: Mock documents")).toBeInTheDocument();
    });
    expect(screen.getByText("Folder: /documents")).toBeInTheDocument();
  });

  it("shows local synced SharePoint folder when that source is active", async () => {
    mockStatusFetch({
      activeSource: "LOCAL_SYNC",
      available: true,
      displayName: "Local synced SharePoint folder",
      folderUrl: null,
      folderPath: "/Users/you/OneDrive/Electronic Invoicing",
      configuredSharePointFolderUrl: "https://company.sharepoint.com/sites/einvoice/docs",
      configuredSharePointFolderPath: "Shared Documents/Approved",
      message: "Using local synced SharePoint folder"
    });

    render(
      <StatusChecks processingStatus={idleStatus} refreshKey={0} onRefresh={() => undefined} />
    );

    await waitFor(() => {
      expect(screen.getByText("Active Source: Local synced SharePoint folder")).toBeInTheDocument();
    });
    expect(screen.getByText("Folder: /Users/you/OneDrive/Electronic Invoicing")).toBeInTheDocument();
  });

  it("shows configured SharePoint folder when mock is active", async () => {
    mockStatusFetch({
      activeSource: "MOCK",
      available: true,
      displayName: "Local mock documents",
      folderUrl: null,
      folderPath: "/documents",
      configuredSharePointFolderUrl: "https://company.sharepoint.com/sites/einvoice/docs",
      configuredSharePointFolderPath: "Shared Documents/Approved",
      message: "Using local mock documents"
    });

    render(
      <StatusChecks processingStatus={idleStatus} refreshKey={0} onRefresh={() => undefined} />
    );

    await waitFor(() => {
      expect(screen.getByText("Active Source: Mock documents")).toBeInTheDocument();
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
