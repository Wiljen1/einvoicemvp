import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/chat/route";
import { POST as START } from "@/app/api/chat/start/route";
import { GET as STATUS } from "@/app/api/chat/status/[sessionId]/route";

const originalEnv = { ...process.env };

describe("chat API", () => {
  beforeEach(() => {
    process.env.SHAREPOINT_DISABLE_LOCAL_CONFIG = "true";
  });

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
    process.env.CODEX_BIN = "node";
    process.env.CODEX_EXECUTION_MODE = "placeholder";
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

  it("starts a progress session and completes a no-context refusal", async () => {
    process.env.CODEX_FORCE_UNAVAILABLE = "false";
    process.env.CODEX_BIN = "node";
    process.env.CODEX_EXECUTION_MODE = "placeholder";
    process.env.ALLOW_MOCK_DOCUMENTS = "true";

    const startResponse = await START(
      new Request("http://localhost/api/chat/start", {
        method: "POST",
        body: JSON.stringify({ question: "What is the capital of Mars?" })
      })
    );
    const startPayload = await startResponse.json();

    expect(startPayload.ok).toBe(true);
    expect(startPayload.data.status).toBe("RUNNING");

    const finalStatus = await waitForSession(startPayload.data.sessionId);

    expect(finalStatus.status).toBe("COMPLETED");
    expect(finalStatus.progress).toBe(100);
    expect(finalStatus.answer).toContain("could not find enough information");
  });
});

async function waitForSession(sessionId: string) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await STATUS(new Request(`http://localhost/api/chat/status/${sessionId}`), {
      params: Promise.resolve({ sessionId })
    });
    const payload = await response.json();

    if (payload.data.status !== "RUNNING") {
      return payload.data;
    }

    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  throw new Error("Session did not finish.");
}
