"use client";

import { Bot, Sparkles } from "lucide-react";
import { useRef, useState } from "react";
import type { ChatAnswer } from "@/types/chat";
import { ChatInput } from "./ChatInput";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { SourceList } from "./SourceList";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  result?: ChatAnswer;
}

export function ChatWindow() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "Ask a question about the approved SharePoint folder documents."
    }
  ]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const idCounter = useRef(0);

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
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ question })
      });
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        setError(payload.error || "Unable to answer right now.");
        return;
      }

      const answer = payload.data as ChatAnswer;
      const assistantMessage: Message = {
        id: `assistant-${idCounter.current++}`,
        role: "assistant",
        content: answer.answer,
        result: answer
      };
      setMessages((current) => [...current, assistantMessage]);
    } catch {
      setError("Unable to reach the chat service.");
    } finally {
      setLoading(false);
    }
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
                    {message.result.engine === "codex" ? "Codex" : "Codex placeholder"}
                  </span>
                </div>
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
