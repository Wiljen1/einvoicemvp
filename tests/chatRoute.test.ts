import { afterEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/chat/route";

const originalEnv = { ...process.env };

describe("chat API", () => {
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("fails gracefully when Codex is unavailable", async () => {
    process.env.CODEX_FORCE_UNAVAILABLE = "true";

    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({ question: "What are the guardrails?" })
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.ok).toBe(false);
    expect(payload.error).toBe("Codex is not available.");
  });

  it("refuses when no approved document context is found", async () => {
    process.env.CODEX_FORCE_UNAVAILABLE = "false";
    process.env.CODEX_COMMAND = "node";
    process.env.ALLOW_MOCK_DOCUMENTS = "true";

    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({ question: "What is the capital of Mars?" })
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.data.answer).toContain("could not find enough information");
    expect(payload.data.confidence).toBe(0);
    expect(payload.data.sources).toEqual([]);
  });
});
