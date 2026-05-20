// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminDashboard } from "@/components/AdminDashboard";

describe("AdminDashboard question history", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("paginates question history, sorts by header, and opens full details", async () => {
    mockAdminFetch();
    render(<AdminDashboard />);

    fireEvent.click(await screen.findByRole("button", { name: "Question History" }));

    await waitFor(() => {
      expect(screen.getByText("Question 6")).toBeInTheDocument();
    });
    expect(screen.queryByText("Question 1")).not.toBeInTheDocument();
    expect(screen.getByText("Page 1 of 2 - 6 records")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Created At/ }));

    await waitFor(() => {
      expect(screen.getByText("Question 1")).toBeInTheDocument();
    });
    expect(screen.queryByText("Question 6")).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "View" })[0]);

    expect(await screen.findByText("Full answer 1")).toBeInTheDocument();
    expect(screen.getAllByText("source-1.md").length).toBeGreaterThan(0);
    expect(screen.getByText("Retrieved Chunks")).toBeInTheDocument();
  });
});

function mockAdminFetch() {
  const questions = Array.from({ length: 6 }, (_, index) => {
    const value = index + 1;
    return {
      id: `q-${value}`,
      sourceId: "source-1",
      question: `Question ${value}`,
      answer: `Full answer ${value}`,
      confidenceScore: value / 10,
      confidenceLevel: value > 3 ? "High" : "Low",
      responseTimeMs: value * 100,
      cacheHit: value % 2 === 0,
      codexUsed: value % 2 === 1,
      answerSource: "INDEXED_DOCUMENTS",
      createdAt: `2026-05-20T10:0${value}:00.000Z`,
      sources: [{ fileName: `source-${value}.md`, relativePath: `source-${value}.md`, snippet: "Evidence" }],
      retrievedChunks: [{ chunkId: `chunk-${value}`, documentId: `doc-${value}`, relativePath: `source-${value}.md` }]
    };
  });

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url.includes("/api/admin/guardrails")) {
        return jsonResponse({
          ok: true,
          data: {
            systemGuardrails: ["Answer only from documents."],
            checkboxDefaults: {
              keepAnswersShort: true,
              includeSources: true,
              includeConfidenceScore: true,
              sayWhenInformationIsMissing: true,
              useBusinessFriendlyLanguage: true
            },
            userGuardrails: "",
            promptPreview: "SYSTEM GUARDRAILS:"
          }
        });
      }

      if (url.includes("/api/admin/questions")) {
        return jsonResponse({ ok: true, data: { questions } });
      }

      if (url.includes("/api/admin/analytics")) {
        return jsonResponse({
          ok: true,
          data: {
            totalQuestions: 6,
            questionsToday: 6,
            questionsThisWeek: 6,
            averageResponseTimeMs: 350,
            cacheHitRate: 0.5,
            confidenceDistribution: { High: 3, Medium: 0, Low: 3, Unknown: 0 },
            mostAskedQuestions: [],
            similarQuestionClusters: [],
            topReferencedDocuments: [],
            unansweredOrLowConfidence: [],
            questionsOverTime: []
          }
        });
      }

      return jsonResponse({ ok: true, data: { documents: [] } });
    })
  );
}

function jsonResponse(payload: unknown) {
  return {
    ok: true,
    json: async () => payload
  };
}
