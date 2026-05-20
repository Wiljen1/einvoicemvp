// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatWindow } from "@/components/ChatWindow";
import { SlackStyleChat, type SlackChatTurn } from "@/components/SlackStyleChat";

describe("Slack-style chat experience", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("shows the user question, inline processing, bot answer, and thread details", async () => {
    const statusResponse = createDeferred<Response>();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url.includes("/api/chat/start")) {
        return jsonResponse({
          ok: true,
          data: {
            sessionId: "session-1",
            status: "RUNNING",
            progress: 45,
            step: "Searching indexed documents",
            answer: null,
            confidence: null,
            sources: [],
            error: null
          }
        });
      }

      if (url.includes("/api/chat/status/session-1")) {
        return statusResponse.promise;
      }

      throw new Error(`Unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ChatWindow />);

    expect(screen.getByText("Knowledge Bot")).toBeInTheDocument();
    expect(screen.queryByText("Assistant")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Ask a question about the approved document source.")
    ).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Ask a question"), {
      target: { value: "What is e-invoicing?" }
    });
    fireEvent.click(screen.getByRole("button", { name: /ask/i }));

    await waitFor(() => {
      expect(screen.getByText("What is e-invoicing?")).toBeInTheDocument();
      expect(screen.getByText("Processing your question...")).toBeInTheDocument();
      expect(screen.getByText(/Current step: Searching indexed database/)).toBeInTheDocument();
    });

    statusResponse.resolve(
      jsonResponse({
        ok: true,
        data: {
          sessionId: "session-1",
          status: "COMPLETED",
          progress: 100,
          step: "Completed",
          answer: "E-invoicing is electronic invoice exchange based on the indexed documents.",
          confidence: 0.82,
          sources: [
            {
              fileName: "guide.pdf",
              relativePath: "Guides/guide.pdf",
              snippet: "E-invoicing supports electronic invoice exchange."
            }
          ],
          error: null,
          engine: "codex",
          answerSource: "INDEXED_DOCUMENTS"
        }
      })
    );

    await waitFor(() => {
      expect(
        screen.getByText("E-invoicing is electronic invoice exchange based on the indexed documents.")
      ).toBeInTheDocument();
    });

    expect(screen.getByText("Answered with Codex using indexed documents")).toBeInTheDocument();
    const summary = screen.getByText("Show sources and confidence");
    const details = summary.closest("details");
    expect(details).not.toHaveAttribute("open");

    fireEvent.click(summary);
    expect(details).toHaveAttribute("open");
    expect(screen.getByText("Guides/guide.pdf")).toBeInTheDocument();
    expect(screen.getByText(/High - 82%/)).toBeInTheDocument();
    expect(screen.getByText("Answered from indexed database + Codex.")).toBeInTheDocument();
  });

  it("renders reused-answer labels in the bot thread", () => {
    const turns: SlackChatTurn[] = [
      {
        id: "turn-1",
        question: "Which countries support electronic invoicing?",
        createdAt: "2026-05-20T12:00:00.000Z",
        status: "completed",
        step: "Completed",
        progress: 100,
        answer: "A similar answer was reused.",
        result: {
          answer: "A similar answer was reused.",
          confidence: 0.9,
          sources: [],
          engine: "codex",
          fromCache: true,
          answerSource: "PREVIOUS_SIMILAR_QUESTION",
          similarityScore: 0.94
        },
        responseTimeMs: 42
      }
    ];

    render(<SlackStyleChat turns={turns} />);

    expect(screen.getByText("Reused from a similar previous question")).toBeInTheDocument();
    expect(screen.getByText("Run fresh search")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Show sources and confidence"));
    expect(screen.getByText("Answered from previous similar question.")).toBeInTheDocument();
    expect(screen.getByText("94%")).toBeInTheDocument();
  });
});

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });

  return { promise, reject, resolve };
}

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    json: async () => body
  } as Response;
}
