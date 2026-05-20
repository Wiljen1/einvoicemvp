import { describe, expect, it } from "vitest";
import {
  checkCodexStatus,
  detectCodexStatus,
  getCodexSetupInstructions,
  validateCodexBinary
} from "@/services/codexService";

describe("codexService", () => {
  it("detects an available safe command", async () => {
    const status = await detectCodexStatus({ command: "node", timeoutMs: 1000 });

    expect(status.available).toBe(true);
    expect(status.message).toBe("Codex detected and operational");
    expect(status.binaryPath).toBe("node");
  });

  it("handles unavailable Codex command gracefully", async () => {
    const status = await detectCodexStatus({
      command: "definitely-not-a-real-codex-command",
      timeoutMs: 100
    });

    expect(status.available).toBe(false);
    expect(status.message).toBe("Codex not found / not available");
  });

  it("exposes setup guidance when Codex cannot be found", async () => {
    const status = await checkCodexStatus({
      command: "definitely-not-a-real-codex-command",
      timeoutMs: 100
    });

    expect(status.setupInstructions).toBe(getCodexSetupInstructions());
  });

  it("validates a binary with a version health check", async () => {
    const validation = await validateCodexBinary("node", 1000);

    expect(validation.ok).toBe(true);
  });
});
