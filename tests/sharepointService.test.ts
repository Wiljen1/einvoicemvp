import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  testSharePointFolderUrl,
  toPublicSharePointConfig
} from "@/services/sharepointConfigService";
import { resetDocumentIndexForTests } from "@/services/documentIndexService";
import {
  checkSharePointAccess,
  getDocumentSourceStatus,
  listApprovedDocuments
} from "@/services/sharepointService";
import type { SharePointConfig } from "@/types/sharepoint";

describe("sharepointService", () => {
  let tempDocumentsPath = "";
  let nestedFolder = "";

  beforeEach(async () => {
    tempDocumentsPath = await fs.mkdtemp(path.join(os.tmpdir(), "einvoice-sp-docs-"));
    nestedFolder = path.join(tempDocumentsPath, "_nested-approved");
    vi.stubEnv("LOCAL_DOCUMENTS_PATH", tempDocumentsPath);
    resetDocumentIndexForTests();
  });

  afterEach(async () => {
    await fs.rm(tempDocumentsPath, { force: true, recursive: true });
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    resetDocumentIndexForTests();
  });

  it("uses the approved mock folder when SharePoint credentials are incomplete", async () => {
    const config: SharePointConfig = {
      siteUrl: "",
      folderPath: "",
      tenantId: "",
      clientId: "",
      clientSecret: ""
    };
    await fs.writeFile(path.join(tempDocumentsPath, "approved.md"), "Approved local content.");
    const status = await checkSharePointAccess(config);

    expect(status.available).toBe(true);
    expect(status.mode).toBe("mock");
    expect(status.activeFolder).toBe(tempDocumentsPath);
  });

  it("reads files from nested folders in the mock approved folder", async () => {
    await fs.mkdir(nestedFolder, { recursive: true });
    await fs.writeFile(
      path.join(nestedFolder, "nested-approved.md"),
      "NESTED_APPROVED_CONTEXT: this should be searched."
    );

    const documents = await listApprovedDocuments({
      siteUrl: "",
      folderPath: "",
      tenantId: "",
      clientId: "",
      clientSecret: ""
    });

    expect(documents.some((document) => document.relativePath === "_nested-approved/nested-approved.md")).toBe(
      true
    );
    expect(documents.some((document) => document.content.includes("NESTED_APPROVED_CONTEXT"))).toBe(
      true
    );
  });

  it("reports the saved SharePoint folder as active when SharePoint is connected", async () => {
    mockSuccessfulGraphAccess();
    const config: SharePointConfig = {
      siteUrl: "https://company.sharepoint.com/sites/einvoice",
      folderPath: "Shared Documents/Approved",
      tenantId: "tenant",
      clientId: "client",
      clientSecret: ""
    };
    const status = await getDocumentSourceStatus(config, { accessToken: "delegated-token" });

    expect(status.activeSource).toBe("GRAPH_SHAREPOINT");
    expect(status.displayName).toBe("SharePoint folder");
    expect(status.folderUrl).toBe(
      "https://company.sharepoint.com/sites/einvoice/Shared Documents/Approved"
    );
    expect(status.folderPath).toBe("Shared Documents/Approved");
    expect(status.configuredSharePointFolderUrl).toBe(
      "https://company.sharepoint.com/sites/einvoice/Shared Documents/Approved"
    );
  });

  it("reports the local folder when local documents are active", async () => {
    await fs.writeFile(path.join(tempDocumentsPath, "approved.md"), "Approved local content.");
    const status = await getDocumentSourceStatus({
      siteUrl: "",
      folderPath: "",
      tenantId: "",
      clientId: "",
      clientSecret: ""
    });

    expect(status.activeSource).toBe("LOCAL_SYNCED_FOLDER");
    expect(status.folderUrl).toBeNull();
    expect(status.folderPath).toBe(tempDocumentsPath);
  });

  it("keeps the configured SharePoint folder visible when local documents are active", async () => {
    await fs.writeFile(path.join(tempDocumentsPath, "approved.md"), "Approved local content.");
    const status = await getDocumentSourceStatus({
      siteUrl: "https://company.sharepoint.com/sites/einvoice",
      folderPath: "Shared Documents/Approved",
      tenantId: "",
      clientId: "",
      clientSecret: ""
    });

    expect(status.activeSource).toBe("LOCAL_SYNCED_FOLDER");
    expect(status.configuredSharePointFolderUrl).toBe(
      "https://company.sharepoint.com/sites/einvoice/Shared Documents/Approved"
    );
  });

  it("does not expose legacy client secrets in public SharePoint config", () => {
    const publicConfig = toPublicSharePointConfig({
      siteUrl: "https://company.sharepoint.com/sites/einvoice",
      folderPath: "Shared Documents/Approved",
      tenantId: "tenant",
      clientId: "client",
      clientSecret: "super-secret"
    });

    expect(JSON.stringify(publicConfig)).not.toContain("super-secret");
    expect(JSON.stringify(publicConfig)).not.toContain("clientSecret");
  });

  it("requires Microsoft sign-in when SharePoint is configured without a delegated token", async () => {
    const status = await checkSharePointAccess({
      siteUrl: "https://company.sharepoint.com/sites/einvoice",
      folderPath: "Shared Documents/Approved",
      tenantId: "tenant",
      clientId: "client",
      clientSecret: ""
    });

    expect(status.available).toBe(false);
    expect(status.mode).toBe("auth_required");
    expect(status.message).toContain("Microsoft sign-in is required");
  });

  it("normalizes copied SharePoint folder links into site, library, and folder path", () => {
    const publicConfig = toPublicSharePointConfig({
      siteUrl: testSharePointFolderUrl,
      folderPath: testSharePointFolderUrl,
      tenantId: "",
      clientId: "",
      clientSecret: "",
      documentLibraryName: "Electronic Invoicing"
    });

    expect(publicConfig.siteUrl).toBe(
      "https://oracle.sharepoint.com/sites/netsuite-suitesuccess-published-assets"
    );
    expect(publicConfig.folderUrl).toBe(testSharePointFolderUrl);
    expect(publicConfig.folderPath).toBe("SuiteSuccess Assets/Electronic Invoicing");
    expect(publicConfig.documentLibraryName).toBe("SuiteSuccess Assets");
    expect(publicConfig.activeFolder).toBe(testSharePointFolderUrl);
  });

  it("uses SharePoint documents when SharePoint is the active source", async () => {
    mockSuccessfulGraphAccess();
    const documents = await listApprovedDocuments({
      siteUrl: "https://company.sharepoint.com/sites/einvoice",
      folderPath: "Shared Documents/Approved",
      tenantId: "tenant",
      clientId: "client",
      clientSecret: ""
    }, { accessToken: "delegated-token" });

    expect(documents).toHaveLength(1);
    expect(documents[0].fileName).toBe("approved.md");
    expect(documents[0].content).toContain("Approved SharePoint document content");
  });
});

function mockSuccessfulGraphAccess() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("/sites/") && !url.includes("/drive")) {
        return jsonResponse({ id: "site-id" });
      }

      if (url.includes("/drive") && !url.includes("/children")) {
        return jsonResponse({ id: "drive-id" });
      }

      if (url.includes("/children")) {
        return jsonResponse({
          value: [
            {
              name: "approved.md",
              file: {},
              webUrl: "https://company.sharepoint.com/approved.md",
              "@microsoft.graph.downloadUrl": "https://download.test/approved.md"
            },
            {
              name: "Nested",
              folder: {}
            }
          ]
        });
      }

      if (url.includes("download.test")) {
        return textResponse("Approved SharePoint document content");
      }

      return jsonResponse({}, false, 404);
    })
  );
}

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body
  } as Response;
}

function textResponse(body: string): Response {
  return {
    ok: true,
    status: 200,
    text: async () => body
  } as Response;
}
