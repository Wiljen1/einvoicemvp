import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/chat/route";
import { POST as START } from "@/app/api/chat/start/route";
import { GET as STATUS } from "@/app/api/chat/status/[sessionId]/route";
import { resetDocumentIndexForTests } from "@/services/documentIndexService";

const originalEnv = { ...process.env };

describe("chat API", () => {
  let tempDocumentsPath = "";

  beforeEach(async () => {
    tempDocumentsPath = await fs.mkdtemp(path.join(os.tmpdir(), "einvoice-chat-docs-"));
    process.env.SHAREPOINT_DISABLE_LOCAL_CONFIG = "true";
    process.env.LOCAL_DOCUMENTS_PATH = tempDocumentsPath;
    resetDocumentIndexForTests();
  });

  afterEach(async () => {
    process.env = { ...originalEnv };
    resetDocumentIndexForTests();
    await fs.rm(tempDocumentsPath, { recursive: true, force: true });
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
    await fs.writeFile(
      path.join(tempDocumentsPath, "approved.md"),
      "Approved e-invoice documents require source references."
    );

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

  it("refuses clearly when no readable local documents are found", async () => {
    process.env.CODEX_FORCE_UNAVAILABLE = "false";
    process.env.CODEX_BIN = "node";
    process.env.CODEX_EXECUTION_MODE = "placeholder";
    process.env.ALLOW_MOCK_DOCUMENTS = "true";

    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({ question: "What is in the documents?" })
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.data.answer).toContain("No readable documents were found");
    expect(payload.data.confidence).toBe(0);
    expect(payload.data.sources).toEqual([]);
  });

  it("requires Microsoft sign-in when a SharePoint folder is configured", async () => {
    process.env.CODEX_FORCE_UNAVAILABLE = "false";
    process.env.CODEX_BIN = "node";
    process.env.CODEX_EXECUTION_MODE = "placeholder";
    process.env.ALLOW_MOCK_DOCUMENTS = "true";
    process.env.SHAREPOINT_SITE_URL = "https://company.sharepoint.com/sites/einvoice";
    process.env.SHAREPOINT_FOLDER_PATH = "Shared Documents/Approved";
    process.env.SHAREPOINT_TENANT_ID = "tenant";
    process.env.SHAREPOINT_CLIENT_ID = "client";

    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({ question: "What is in SharePoint?" })
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.ok).toBe(false);
    expect(payload.error).toContain("Microsoft sign-in is required");
  });


  it("uses newly added local files on the next chat request", async () => {
    process.env.CODEX_FORCE_UNAVAILABLE = "false";
    process.env.CODEX_BIN = "node";
    process.env.CODEX_EXECUTION_MODE = "placeholder";
    process.env.ALLOW_MOCK_DOCUMENTS = "true";

    await fs.writeFile(
      path.join(tempDocumentsPath, "new-policy.md"),
      "The local alpha policy requires source references for every answer."
    );

    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({ question: "What does the local alpha policy require?" })
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.data.answer).toContain("source references");
    expect(payload.data.sources[0].fileName).toBe("new-policy.md");
  });

  it("starts a progress session and completes a no-context refusal", async () => {
    process.env.CODEX_FORCE_UNAVAILABLE = "false";
    process.env.CODEX_BIN = "node";
    process.env.CODEX_EXECUTION_MODE = "placeholder";
    process.env.ALLOW_MOCK_DOCUMENTS = "true";
    await fs.writeFile(
      path.join(tempDocumentsPath, "approved.md"),
      "Approved e-invoice documents require source references."
    );

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
