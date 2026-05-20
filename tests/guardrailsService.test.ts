import { describe, expect, it } from "vitest";
import { loadGuardrails } from "@/services/guardrailsService";

describe("guardrailsService", () => {
  it("loads the local guardrails configuration", async () => {
    const guardrails = await loadGuardrails();

    expect(guardrails.answerOnlyFromDocuments).toBe(true);
    expect(guardrails.allowInternetBrowsing).toBe(false);
    expect(guardrails.fallbackMessage).toContain("approved SharePoint folder");
  });
});
