"use client";

import { Bot, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ChatAnswer, ChatSessionStatus } from "@/types/chat";
import { ChatInput } from "./ChatInput";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { ProcessingProgressBar } from "./ProcessingProgressBar";
import { SourceList } from "./SourceList";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  result?: ChatAnswer;
}

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
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "Ask a question about the approved document source."
    }
  ]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
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

  async function askQuestion(question: string) {
    setLoading(true);
    setError("");
    const userMessage: Message = {
      id: `user-${idCounter.current++}`,
      role: "user",
      content: question
    };
    setMessages((current) => [...current, userMessage]);

    try {
      const response = await fetch("/api/chat/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ question })
      });
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        const message = payload.error || "Unable to answer right now.";
        setError(message);
        setProcessingStatus({
          ...idleStatus,
          status: "FAILED",
          step: "Error",
          error: message
        });
        setLoading(false);
        return;
      }

      const status = payload.data as ChatSessionStatus;
      setProcessingStatus(status);
      pollSession(status.sessionId);
    } catch {
      const message = "Unable to reach the chat service.";
      setError(message);
      setProcessingStatus({
        ...idleStatus,
        status: "FAILED",
        step: "Error",
        error: message
      });
      setLoading(false);
    }
  }

  async function pollSession(sessionId: string) {
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

      if (status.status === "RUNNING") {
        pollTimer.current = setTimeout(() => pollSession(sessionId), 700);
        return;
      }

      setLoading(false);

      if (status.status === "COMPLETED" && status.answer !== null && status.confidence !== null) {
        const answer: ChatAnswer = {
          answer: status.answer,
          confidence: status.confidence,
          sources: status.sources,
          engine: status.engine || "codex",
          fromCache: status.fromCache,
          warning: status.warning
        };
        const assistantMessage: Message = {
          id: `assistant-${idCounter.current++}`,
          role: "assistant",
          content: answer.answer,
          result: answer
        };
        setMessages((current) => [...current, assistantMessage]);
        return;
      }

      setError(status.error || "Unable to answer right now.");
    } catch (pollError) {
      const message =
        pollError instanceof Error ? pollError.message : "Unable to read processing status.";
      setError(message);
      setProcessingStatus((current) => ({
        ...current,
        status: "FAILED",
        step: "Error",
        error: message
      }));
      setLoading(false);
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

    setProcessingStatus(
      status || {
        ...processingStatus,
        status: "CANCELLED",
        step: "Request cancelled",
        error: "Request cancelled"
      }
    );
    setError("Request cancelled");
    setLoading(false);
  }

  return (
    <section className="panel chat-panel" aria-label="Chat interface">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">
            <Bot aria-hidden="true" size={20} />
            Chat
          </h2>
          <p className="panel-subtitle">Answers are constrained to the approved folder.</p>
        </div>
      </div>

      <ProcessingProgressBar status={processingStatus} onCancel={cancelCurrentSession} />

      <div className="messages" aria-live="polite">
        {messages.map((message) => (
          <article className={`message ${message.role}`} key={message.id}>
            <span className="message-label">{message.role === "user" ? "You" : "Assistant"}</span>
            <p>{message.content}</p>
            {message.result ? (
              <>
                <div className="answer-meta">
                  <ConfidenceBadge confidence={message.result.confidence} />
                  <span className="engine-badge">
                    <Sparkles aria-hidden="true" size={14} />
                    {message.result.fromCache
                      ? "Loaded from cache"
                      : message.result.engine === "codex"
                        ? "Codex"
                        : "Codex placeholder"}
                  </span>
                </div>
                {message.result.warning ? (
                  <div className="notice warning">{message.result.warning}</div>
                ) : null}
                <SourceList sources={message.result.sources} />
              </>
            ) : null}
          </article>
        ))}
        {loading ? (
          <article className="message assistant">
            <span className="message-label">Assistant</span>
            <p>Checking the approved documents...</p>
          </article>
        ) : null}
        {error ? <div className="notice error">{error}</div> : null}
      </div>

      <ChatInput disabled={loading} onSubmit={askQuestion} />
    </section>
  );
}
