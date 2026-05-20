"use client";

import { Send } from "lucide-react";
import { FormEvent, useState } from "react";

interface ChatInputProps {
  disabled?: boolean;
  onSubmit: (question: string, options?: { forceFresh?: boolean }) => Promise<void>;
}

export function ChatInput({ disabled, onSubmit }: ChatInputProps) {
  const [question, setQuestion] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = question.trim();
    if (!trimmed || disabled) {
      return;
    }

    setQuestion("");
    await onSubmit(trimmed);
  }

  return (
    <form className="chat-form" onSubmit={handleSubmit}>
      <textarea
        aria-label="Ask a question"
        className="text-area"
        maxLength={600}
        placeholder="Ask about the approved documents..."
        value={question}
        onChange={(event) => setQuestion(event.target.value)}
      />
      <button className="button" disabled={disabled || !question.trim()} type="submit">
        <Send aria-hidden="true" size={16} />
        Ask
      </button>
    </form>
  );
}
