import { describe, expect, it } from "vitest";
import { estimateOverallConfidence, searchDocuments } from "@/services/documentSearchService";
import type { ApprovedDocument } from "@/types/document";

describe("documentSearchService", () => {
  const documents: ApprovedDocument[] = [
    {
      fileName: "policy.md",
      sourcePath: "/approved/policy.md",
      content:
        "The chatbot must include source references and confidence scores. It must refuse unsupported answers."
    },
    {
      fileName: "other.md",
      sourcePath: "/approved/other.md",
      content: "Invoices should be reviewed by the finance operations team."
    }
  ];

  it("returns ranked chunks for matching approved documents", () => {
    const results = searchDocuments("Should the chatbot include source references?", documents);

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].fileName).toBe("policy.md");
    expect(results[0].confidence).toBeGreaterThan(0);
  });

  it("estimates zero confidence when no context is found", () => {
    expect(estimateOverallConfidence([])).toBe(0);
  });
});
