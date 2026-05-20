import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultDocumentsDirectory } from "@/lib/paths";
import { toPublicSharePointConfig } from "@/services/sharepointConfigService";
import {
  checkSharePointAccess,
  getDocumentSourceStatus,
  listApprovedDocuments
} from "@/services/sharepointService";
import type { SharePointConfig } from "@/types/sharepoint";

describe("sharepointService", () => {
  const nestedFolder = path.join(defaultDocumentsDirectory, "_not-approved-nested");

  afterEach(async () => {
    await fs.rm(nestedFolder, { force: true, recursive: true });
    vi.unstubAllGlobals();
  });

  it("uses the approved mock folder when SharePoint credentials are incomplete", async () => {
    const config: SharePointConfig = {
      siteUrl: "",
      folderPath: "",
      tenantId: "",
      clientId: "",
      clientSecret: ""
    };
    const status = await checkSharePointAccess(config);

    expect(status.available).toBe(true);
    expect(status.mode).toBe("mock");
    expect(status.activeFolder).toContain("documents");
  });

  it("does not read files from nested folders in the mock approved folder", async () => {
    await fs.mkdir(nestedFolder, { recursive: true });
    await fs.writeFile(
      path.join(nestedFolder, "not-approved.md"),
      "SECRET_NESTED_CONTEXT: this must never be searched."
    );

    const documents = await listApprovedDocuments({
      siteUrl: "",
      folderPath: "",
      tenantId: "",
      clientId: "",
      clientSecret: ""
    });

    expect(documents.some((document) => document.fileName.includes("_not-approved-nested"))).toBe(
      false
    );
    expect(documents.some((document) => document.content.includes("SECRET_NESTED_CONTEXT"))).toBe(
      false
    );
  });

  it("reports the saved SharePoint folder as active when SharePoint is connected", async () => {
    mockSuccessfulGraphAccess();
    const config: SharePointConfig = {
      siteUrl: "https://company.sharepoint.com/sites/einvoice",
      folderPath: "Shared Documents/Approved",
      tenantId: "tenant",
      clientId: "client",
      clientSecret: "secret"
    };
    const status = await getDocumentSourceStatus(config);

    expect(status.activeSource).toBe("SHAREPOINT");
    expect(status.displayName).toBe("SharePoint folder");
    expect(status.folderUrl).toBe(
      "https://company.sharepoint.com/sites/einvoice/Shared Documents/Approved"
    );
    expect(status.folderPath).toBe("Shared Documents/Approved");
  });

  it("reports mock only when mock documents are active", async () => {
    const status = await getDocumentSourceStatus({
      siteUrl: "",
      folderPath: "",
      tenantId: "",
      clientId: "",
      clientSecret: ""
    });

    expect(status.activeSource).toBe("MOCK");
    expect(status.folderUrl).toBeNull();
    expect(status.folderPath).toContain("documents");
  });

  it("masks client secrets in public SharePoint config", () => {
    const publicConfig = toPublicSharePointConfig({
      siteUrl: "https://company.sharepoint.com/sites/einvoice",
      folderPath: "Shared Documents/Approved",
      tenantId: "tenant",
      clientId: "client",
      clientSecret: "super-secret"
    });

    expect(publicConfig.clientSecretConfigured).toBe(true);
    expect(publicConfig.clientSecretMasked).toBe("********");
    expect(JSON.stringify(publicConfig)).not.toContain("super-secret");
  });

  it("uses SharePoint documents when SharePoint is the active source", async () => {
    mockSuccessfulGraphAccess();
    const documents = await listApprovedDocuments({
      siteUrl: "https://company.sharepoint.com/sites/einvoice",
      folderPath: "Shared Documents/Approved",
      tenantId: "tenant",
      clientId: "client",
      clientSecret: "secret"
    });

    expect(documents).toHaveLength(1);
    expect(documents[0].fileName).toBe("approved.md");
    expect(documents[0].content).toContain("Approved SharePoint document content");
  });
});

function mockSuccessfulGraphAccess() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("login.microsoftonline.com")) {
        return jsonResponse({ access_token: "token" });
      }

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
