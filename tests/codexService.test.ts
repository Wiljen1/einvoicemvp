import { describe, expect, it } from "vitest";
import { detectCodexStatus } from "@/services/codexService";

describe("codexService", () => {
  it("detects an available safe command", async () => {
    const status = await detectCodexStatus({ command: "node", timeoutMs: 1000 });

    expect(status.available).toBe(true);
    expect(status.message).toBe("Codex detected and operational");
  });

  it("handles unavailable Codex command gracefully", async () => {
    const status = await detectCodexStatus({
      command: "definitely-not-a-real-codex-command",
      timeoutMs: 100
    });

    expect(status.available).toBe(false);
    expect(status.message).toBe("Codex not found / not available");
  });
});
