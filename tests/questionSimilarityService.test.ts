import { describe, expect, it } from "vitest";
import {
  normalizeQuestion,
  scoreQuestionSimilarity
} from "@/services/questionSimilarityService";

describe("questionSimilarityService", () => {
  it("normalizes questions consistently", () => {
    expect(normalizeQuestion("  What is the SETUP process?! ")).toBe("what is the setup process");
  });

  it("detects exact and similar questions", () => {
    expect(scoreQuestionSimilarity("what is the setup process", "what is the setup process")).toBe(1);
    expect(
      scoreQuestionSimilarity("what is the setup process", "what setup process should i follow")
    ).toBeGreaterThanOrEqual(0.75);
    expect(
      scoreQuestionSimilarity(
        "what countries are supported for e invoicing",
        "which countries support e invoicing"
      )
    ).toBeGreaterThanOrEqual(0.9);
  });

  it("keeps unrelated questions below the reuse threshold", () => {
    expect(scoreQuestionSimilarity("what is the setup process", "who owns the contract renewal")).toBeLessThan(0.75);
  });
});
