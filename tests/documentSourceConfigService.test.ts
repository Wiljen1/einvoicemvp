import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { documentSourceConfigPath } from "@/lib/paths";
import {
  getActiveDocumentSourceConfig,
  loadDocumentSourceConfig,
  saveDocumentSourceConfig
} from "@/services/documentSourceConfigService";

const originalEnv = { ...process.env };

describe("documentSourceConfigService", () => {
  let tempRoot = "";
  let originalConfig: string | null = null;

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "einvoice-source-config-"));
    try {
      originalConfig = await fs.readFile(documentSourceConfigPath, "utf8");
    } catch {
      originalConfig = null;
    }
    process.env = { ...originalEnv };
    vi.unstubAllEnvs();
  });

  afterEach(async () => {
    process.env = { ...originalEnv };
    vi.unstubAllEnvs();
    if (originalConfig === null) {
      await fs.rm(documentSourceConfigPath, { force: true });
    } else {
      await fs.writeFile(documentSourceConfigPath, originalConfig);
    }
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it("uses environment defaults when no saved config exists", async () => {
    await fs.rm(documentSourceConfigPath, { force: true });
    const syncedPath = path.join(tempRoot, "synced");
    vi.stubEnv("DOCUMENT_SOURCE_MODE", "SYNCED_SHAREPOINT_FOLDER");
    vi.stubEnv("SYNCED_SHAREPOINT_FOLDER_PATH", syncedPath);

    const config = await loadDocumentSourceConfig();
    const active = await getActiveDocumentSourceConfig();

    expect(config.mode).toBe("SYNCED_SHAREPOINT_FOLDER");
    expect(config.syncedFolderPath).toBe(syncedPath);
    expect(active).toEqual(
      expect.objectContaining({
        mode: "SYNCED_SHAREPOINT_FOLDER",
        folderPath: syncedPath,
        displayName: "Synced SharePoint Folder"
      })
    );
  });

  it("keeps saved UI settings authoritative over environment defaults", async () => {
    const localPath = path.join(tempRoot, "local");
    const syncedPath = path.join(tempRoot, "synced");
    vi.stubEnv("DOCUMENT_SOURCE_MODE", "LOCAL_FOLDER");
    vi.stubEnv("LOCAL_DOCUMENTS_PATH", localPath);

    await saveDocumentSourceConfig({
      mode: "SYNCED_SHAREPOINT_FOLDER",
      localFolderPath: localPath,
      syncedFolderPath: syncedPath
    });

    const active = await getActiveDocumentSourceConfig();

    expect(active.mode).toBe("SYNCED_SHAREPOINT_FOLDER");
    expect(active.folderPath).toBe(syncedPath);
  });

  it("keeps Graph SharePoint disabled unless the feature flag is enabled", async () => {
    await saveDocumentSourceConfig({
      mode: "GRAPH_SHAREPOINT",
      localFolderPath: tempRoot,
      syncedFolderPath: ""
    });

    const config = await loadDocumentSourceConfig();
    const active = await getActiveDocumentSourceConfig();

    expect(config.mode).toBe("LOCAL_FOLDER");
    expect(active.mode).toBe("LOCAL_FOLDER");
    expect(active.folderPath).toBe(tempRoot);
  });

  it("supports manual upload mode with the local upload folder", async () => {
    await saveDocumentSourceConfig({
      mode: "MANUAL_UPLOAD",
      localFolderPath: tempRoot,
      syncedFolderPath: ""
    });

    const active = await getActiveDocumentSourceConfig();

    expect(active.mode).toBe("MANUAL_UPLOAD");
    expect(active.displayName).toBe("Manual Upload");
    expect(active.folderPath).toContain("uploaded-documents");
  });
});
