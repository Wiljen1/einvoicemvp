import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { defaultDocumentsDirectory } from "@/lib/paths";
import { checkSharePointAccess, listApprovedDocuments } from "@/services/sharepointService";
import type { SharePointConfig } from "@/types/sharepoint";

describe("sharepointService", () => {
  const nestedFolder = path.join(defaultDocumentsDirectory, "_not-approved-nested");

  afterEach(async () => {
    await fs.rm(nestedFolder, { force: true, recursive: true });
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
});
