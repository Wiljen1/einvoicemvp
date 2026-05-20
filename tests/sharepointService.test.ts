import { describe, expect, it } from "vitest";
import { checkSharePointAccess } from "@/services/sharepointService";
import type { SharePointConfig } from "@/types/sharepoint";

describe("sharepointService", () => {
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
});
