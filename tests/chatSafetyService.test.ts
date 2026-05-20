import { describe, expect, it } from "vitest";
import { evaluateChatQuestionSafety } from "@/services/chatSafetyService";

describe("chat safety service", () => {
  it("blocks questions that require live or external knowledge", () => {
    const decision = evaluateChatQuestionSafety("What is the weather in Madrid today?");

    expect(decision.blocked).toBe(true);
    expect(decision.answer).toContain("approved document source");
    expect(decision.answer).toContain("cannot use general knowledge");
  });

  it("blocks requests to search outside the active indexed source", () => {
    const decision = evaluateChatQuestionSafety("Use all files on my computer, not just the indexed folder.");

    expect(decision.blocked).toBe(true);
    expect(decision.answer).toContain("active indexed document source");
  });

  it("allows normal document-grounded questions through", () => {
    const decision = evaluateChatQuestionSafety("What prerequisites are listed in the implementation guide?");

    expect(decision.blocked).toBe(false);
  });
});
