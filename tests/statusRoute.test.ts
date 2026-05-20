import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as GET_DOCUMENT_SETTINGS, POST as POST_DOCUMENT_SETTINGS } from "@/app/api/settings/documents/route";
import { GET as GET_STATUS } from "@/app/api/status/route";
import { documentSourceConfigPath } from "@/lib/paths";
import { resetDocumentIndexForTests } from "@/services/documentIndexService";

const originalEnv = { ...process.env };

describe("status endpoints", () => {
  let tempDocumentsPath = "";
  let originalDocumentSourceConfig: string | null = null;

  beforeEach(async () => {
    tempDocumentsPath = await fs.mkdtemp(path.join(os.tmpdir(), "einvoice-status-docs-"));
    try {
      originalDocumentSourceConfig = await fs.readFile(documentSourceConfigPath, "utf8");
    } catch {
      originalDocumentSourceConfig = null;
    }
    process.env = { ...originalEnv };
    process.env.DOCUMENT_SOURCE_DISABLE_LOCAL_CONFIG = "true";
    process.env.LOCAL_DOCUMENTS_PATH = tempDocumentsPath;
    process.env.DOCUMENT_SOURCE_MODE = "LOCAL_FOLDER";
    process.env.CODEX_BIN = "node";
    process.env.CODEX_FORCE_UNAVAILABLE = "false";
    resetDocumentIndexForTests();
  });

  afterEach(async () => {
    process.env = { ...originalEnv };
    resetDocumentIndexForTests();
    if (originalDocumentSourceConfig === null) {
      await fs.rm(documentSourceConfigPath, { force: true });
    } else {
      await fs.writeFile(documentSourceConfigPath, originalDocumentSourceConfig);
    }
    await fs.rm(tempDocumentsPath, { recursive: true, force: true });
  });

  it("returns the status response shape for active local documents", async () => {
    await fs.writeFile(path.join(tempDocumentsPath, "approved.md"), "Approved status content.");

    const response = await GET_STATUS();
    const payload = await response.json();

    expect(payload.ok).toBe(true);
    expect(payload.data.codex).toEqual(
      expect.objectContaining({
        available: true,
        message: "Codex detected and operational"
      })
    );
    expect(payload.data.sharepoint).toBeUndefined();
    expect(payload.data.documents).toEqual(
      expect.objectContaining({
        activeSource: "LOCAL_FOLDER",
        displayName: "Local Folder",
        available: true,
        folderPath: tempDocumentsPath,
        fileCount: 1
      })
    );
  });

  it("reports synced SharePoint folder mode as a local folder source", async () => {
    const syncedPath = path.join(tempDocumentsPath, "OneDrive", "Electronic Invoicing");
    await fs.mkdir(syncedPath, { recursive: true });
    await fs.writeFile(path.join(syncedPath, "approved.md"), "Synced policy.");
    process.env.DOCUMENT_SOURCE_MODE = "SYNCED_SHAREPOINT_FOLDER";
    process.env.SYNCED_SHAREPOINT_FOLDER_PATH = syncedPath;

    const response = await GET_STATUS();
    const payload = await response.json();

    expect(payload.ok).toBe(true);
    expect(payload.data.documents).toEqual(
      expect.objectContaining({
        activeSource: "SYNCED_SHAREPOINT_FOLDER",
        displayName: "Synced SharePoint Folder",
        folderPath: syncedPath,
        fileCount: 1
      })
    );
  });

  it("returns document settings without Microsoft auth fields", async () => {
    const response = await GET_DOCUMENT_SETTINGS();
    const payload = await response.json();

    expect(payload.ok).toBe(true);
    expect(payload.data.config).toEqual(
      expect.objectContaining({
        mode: "LOCAL_FOLDER",
        localFolderPath: tempDocumentsPath
      })
    );
    expect(JSON.stringify(payload)).not.toContain("access_token");
    expect(JSON.stringify(payload)).not.toContain("clientSecret");
  });

  it("saves document source settings and reflects them in status when local config is enabled", async () => {
    process.env.DOCUMENT_SOURCE_DISABLE_LOCAL_CONFIG = "false";
    const syncedPath = path.join(tempDocumentsPath, "synced");
    await fs.mkdir(syncedPath, { recursive: true });
    await fs.writeFile(path.join(syncedPath, "source.md"), "Source content.");

    const saveResponse = await POST_DOCUMENT_SETTINGS(
      new Request("http://localhost/api/settings/documents", {
        method: "POST",
        body: JSON.stringify({
          mode: "SYNCED_SHAREPOINT_FOLDER",
          localFolderPath: tempDocumentsPath,
          syncedFolderPath: syncedPath
        })
      })
    );
    const savePayload = await saveResponse.json();
    const response = await GET_STATUS();
    const payload = await response.json();

    expect(savePayload.ok).toBe(true);
    expect(payload.ok).toBe(true);
    expect(payload.data.documents).toEqual(
      expect.objectContaining({
        activeSource: "SYNCED_SHAREPOINT_FOLDER",
        folderPath: syncedPath,
        fileCount: 1
      })
    );
  });
});
