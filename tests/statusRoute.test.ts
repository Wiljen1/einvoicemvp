import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as GET_MICROSOFT_CONFIG } from "@/app/api/auth/microsoft/config/route";
import { GET as GET_STATUS } from "@/app/api/status/route";
import { resetDocumentIndexForTests } from "@/services/documentIndexService";

const originalEnv = { ...process.env };

describe("status endpoints", () => {
  let tempDocumentsPath = "";

  beforeEach(async () => {
    tempDocumentsPath = await fs.mkdtemp(path.join(os.tmpdir(), "einvoice-status-docs-"));
    process.env = { ...originalEnv };
    process.env.SHAREPOINT_DISABLE_LOCAL_CONFIG = "true";
    process.env.LOCAL_DOCUMENTS_PATH = tempDocumentsPath;
    process.env.ALLOW_MOCK_DOCUMENTS = "true";
    process.env.CODEX_BIN = "node";
    process.env.CODEX_FORCE_UNAVAILABLE = "false";
    resetDocumentIndexForTests();
  });

  afterEach(async () => {
    process.env = { ...originalEnv };
    resetDocumentIndexForTests();
    await fs.rm(tempDocumentsPath, { recursive: true, force: true });
  });

  it("returns the status response shape for active local documents", async () => {
    await fs.writeFile(path.join(tempDocumentsPath, "approved.md"), "Approved status content.");

    const response = await GET_STATUS(new Request("http://localhost/api/status"));
    const payload = await response.json();

    expect(payload.ok).toBe(true);
    expect(payload.data.codex).toEqual(
      expect.objectContaining({
        available: true,
        message: "Codex detected and operational"
      })
    );
    expect(payload.data.sharepoint.mode).toBe("mock");
    expect(payload.data.documents).toEqual(
      expect.objectContaining({
        activeSource: "LOCAL_SYNCED_FOLDER",
        available: true,
        folderPath: tempDocumentsPath,
        fileCount: 1
      })
    );
  });

  it("reports Microsoft sign-in required when SharePoint is configured without a token", async () => {
    process.env.SHAREPOINT_SITE_URL = "https://company.sharepoint.com/sites/einvoice";
    process.env.SHAREPOINT_FOLDER_PATH = "Shared Documents/Approved";
    process.env.SHAREPOINT_TENANT_ID = "tenant";
    process.env.SHAREPOINT_CLIENT_ID = "client";

    const response = await GET_STATUS(new Request("http://localhost/api/status"));
    const payload = await response.json();

    expect(payload.ok).toBe(true);
    expect(payload.data.sharepoint.mode).toBe("auth_required");
    expect(payload.data.documents.activeSource).toBe("NONE");
    expect(payload.data.documents.message).toContain("Microsoft sign-in is required");
  });

  it("returns public MSAL configuration without secrets or tokens", async () => {
    process.env.NEXT_PUBLIC_MSAL_CLIENT_ID = "client";
    process.env.NEXT_PUBLIC_MSAL_TENANT_ID = "tenant";

    const response = await GET_MICROSOFT_CONFIG(
      new Request("http://localhost/api/auth/microsoft/config")
    );
    const payload = await response.json();

    expect(payload.ok).toBe(true);
    expect(payload.data).toEqual(
      expect.objectContaining({
        configured: true,
        clientId: "client",
        tenantId: "tenant",
        redirectUri: "http://localhost",
        scopes: ["User.Read", "Files.Read.All", "Sites.Read.All"]
      })
    );
    expect(JSON.stringify(payload)).not.toContain("access_token");
  });
});
