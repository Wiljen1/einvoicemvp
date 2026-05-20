"use client";

import { Bot } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ChatAnswer, ChatSessionStatus } from "@/types/chat";
import { ChatInput } from "./ChatInput";
import { SlackStyleChat, type SlackChatTurn } from "./SlackStyleChat";

interface ChatWindowProps {
  onProcessingStatusChange?: (status: ChatSessionStatus) => void;
}

const idleStatus: ChatSessionStatus = {
  sessionId: "",
  status: "IDLE",
  progress: 0,
  step: "Idle",
  answer: null,
  confidence: null,
  sources: [],
  error: null
};

export function ChatWindow({ onProcessingStatusChange }: ChatWindowProps) {
  const [turns, setTurns] = useState<SlackChatTurn[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTurnId, setActiveTurnId] = useState<string | undefined>();
  const [processingStatus, setProcessingStatus] = useState<ChatSessionStatus>(idleStatus);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idCounter = useRef(0);

  useEffect(() => {
    onProcessingStatusChange?.(processingStatus);
  }, [onProcessingStatusChange, processingStatus]);

  useEffect(() => {
    return () => {
      if (pollTimer.current) {
        clearTimeout(pollTimer.current);
      }
    };
  }, []);

  async function askQuestion(question: string, options?: { forceFresh?: boolean }) {
    setLoading(true);
    const turnId = `turn-${idCounter.current++}`;
    const startedAt = getCurrentTimestamp();
    const createdAt = new Date(startedAt).toISOString();

    setActiveTurnId(turnId);
    setTurns((current) => [
      ...current,
      {
        id: turnId,
        question,
        createdAt,
        status: "processing",
        step: "Queued",
        progress: 2
      }
    ]);

    try {
      const response = await fetch("/api/chat/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ question, forceFresh: options?.forceFresh || false })
      });
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        const message = payload.error || "Unable to answer right now.";
        failTurn(turnId, message);
        setProcessingStatus({
          ...idleStatus,
          status: "FAILED",
          step: "Error",
          error: message
        });
        setLoading(false);
        setActiveTurnId(undefined);
        return;
      }

      const status = payload.data as ChatSessionStatus;
      setProcessingStatus(status);
      updateTurnFromStatus(turnId, status);
      pollSession(status.sessionId, turnId, startedAt);
    } catch {
      const message = "Unable to reach the chat service.";
      failTurn(turnId, message);
      setProcessingStatus({
        ...idleStatus,
        status: "FAILED",
        step: "Error",
        error: message
      });
      setLoading(false);
      setActiveTurnId(undefined);
    }
  }

  async function pollSession(sessionId: string, turnId: string, startedAt: number) {
    try {
      const response = await fetch(`/api/chat/status/${encodeURIComponent(sessionId)}`, {
        cache: "no-store"
      });
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Unable to read processing status.");
      }

      const status = payload.data as ChatSessionStatus;
      setProcessingStatus(status);
      updateTurnFromStatus(turnId, status);

      if (status.status === "RUNNING") {
        pollTimer.current = setTimeout(() => pollSession(sessionId, turnId, startedAt), 700);
        return;
      }

      setLoading(false);
      setActiveTurnId(undefined);

      if (status.status === "COMPLETED" && status.answer !== null && status.confidence !== null) {
        const answer: ChatAnswer = {
          answer: status.answer,
          confidence: status.confidence,
          sources: status.sources,
          engine: status.engine || "codex",
          fromCache: status.fromCache,
          answerSource: status.answerSource,
          similarityScore: status.similarityScore,
          reusedFromQuestionId: status.reusedFromQuestionId,
          warning: status.warning
        };

        setTurns((current) =>
          current.map((turn) =>
            turn.id === turnId
              ? {
                  ...turn,
                  status: "completed",
                  progress: 100,
                  step: "Completed",
                  answer: answer.answer,
                  result: answer,
                  responseTimeMs: getCurrentTimestamp() - startedAt
                }
              : turn
          )
        );
        return;
      }

      if (status.status === "CANCELLED") {
        setTurns((current) =>
          current.map((turn) =>
            turn.id === turnId
              ? {
                  ...turn,
                  status: "cancelled",
                  step: "Request cancelled",
                  progress: status.progress || turn.progress,
                  error: status.error || "Request cancelled"
                }
              : turn
          )
        );
        return;
      }

      failTurn(turnId, status.error || "Unable to answer right now.");
    } catch (pollError) {
      const message =
        pollError instanceof Error ? pollError.message : "Unable to read processing status.";
      failTurn(turnId, message);
      setProcessingStatus((current) => ({
        ...current,
        status: "FAILED",
        step: "Error",
        error: message
      }));
      setLoading(false);
      setActiveTurnId(undefined);
    }
  }

  async function cancelCurrentSession() {
    if (!processingStatus.sessionId || processingStatus.status !== "RUNNING") {
      return;
    }

    if (pollTimer.current) {
      clearTimeout(pollTimer.current);
    }

    const response = await fetch(
      `/api/chat/cancel/${encodeURIComponent(processingStatus.sessionId)}`,
      {
        method: "POST"
      }
    );
    const payload = await response.json();
    const status = payload.data as ChatSessionStatus | undefined;
    const currentTurnId = activeTurnId;

    setProcessingStatus(
      status || {
        ...processingStatus,
        status: "CANCELLED",
        step: "Request cancelled",
        error: "Request cancelled"
      }
    );

    if (currentTurnId) {
      setTurns((current) =>
        current.map((turn) =>
          turn.id === currentTurnId
            ? {
                ...turn,
                status: "cancelled",
                step: "Request cancelled",
                error: "Request cancelled"
              }
            : turn
        )
      );
    }

    setLoading(false);
    setActiveTurnId(undefined);
  }

  function updateTurnFromStatus(turnId: string, status: ChatSessionStatus) {
    setTurns((current) =>
      current.map((turn) =>
        turn.id === turnId
          ? {
              ...turn,
              step: status.step,
              progress: status.progress,
              status: status.status === "RUNNING" ? "processing" : turn.status,
              error: status.error || turn.error
            }
          : turn
      )
    );
  }

  function failTurn(turnId: string, message: string) {
    setTurns((current) =>
      current.map((turn) =>
        turn.id === turnId
          ? {
              ...turn,
              status: "failed",
              step: "Error",
              error: message
            }
          : turn
      )
    );
  }

  return (
    <section className="panel chat-panel" aria-label="Chat interface">
      <div className="panel-header slack-chat-header">
        <div>
          <h2 className="panel-title">
            <Bot aria-hidden="true" size={20} />
            Knowledge Bot
          </h2>
          <p className="panel-subtitle">Ask a question based on the indexed document source.</p>
        </div>
      </div>

      <SlackStyleChat
        activeTurnId={activeTurnId}
        turns={turns}
        onCancel={cancelCurrentSession}
        onRunFresh={(question) => void askQuestion(question, { forceFresh: true })}
      />

      <ChatInput disabled={loading} onSubmit={askQuestion} />
    </section>
  );
}

function getCurrentTimestamp(): number {
  return Date.now();
}
