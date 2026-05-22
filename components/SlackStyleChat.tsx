"use client";

import {
  Bot,
  ChevronDown,
  FileText,
  LoaderCircle,
  RotateCcw,
  Sparkles,
  Square,
  User
} from "lucide-react";
import type { ReactNode } from "react";
import type { ChatAnswer } from "@/types/chat";

export type SlackChatTurnStatus = "processing" | "completed" | "failed" | "cancelled";

export interface SlackChatTurn {
  id: string;
  question: string;
  createdAt: string;
  status: SlackChatTurnStatus;
  step: string;
  progress: number;
  answer?: string;
  result?: ChatAnswer;
  error?: string;
  responseTimeMs?: number;
}

interface SlackStyleChatProps {
  turns: SlackChatTurn[];
  activeTurnId?: string;
  onCancel?: () => void;
  onRunFresh?: (question: string) => void;
}

export function SlackStyleChat({
  turns,
  activeTurnId,
  onCancel,
  onRunFresh
}: SlackStyleChatProps) {
  if (turns.length === 0) {
    return (
      <div className="slack-empty-state">
        <div className="bot-avatar">
          <Bot aria-hidden="true" size={18} />
        </div>
        <div>
          <strong>Knowledge Bot is ready.</strong>
          <p>Ask a question based on the indexed document source.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="slack-conversation" aria-live="polite">
      {turns.map((turn) => (
        <section className="slack-turn" key={turn.id}>
          <ChatMessageBubble
            align="right"
            avatar={<User aria-hidden="true" size={16} />}
            label="You"
            timestamp={turn.createdAt}
          >
            {turn.question}
          </ChatMessageBubble>

          <BotReply
            active={turn.id === activeTurnId}
            turn={turn}
            onCancel={onCancel}
            onRunFresh={onRunFresh}
          />
        </section>
      ))}
    </div>
  );
}

export function ChatMessageBubble({
  align,
  avatar,
  children,
  label,
  timestamp
}: {
  align: "left" | "right";
  avatar: ReactNode;
  children: ReactNode;
  label: string;
  timestamp: string;
}) {
  return (
    <article className={`slack-message ${align}`}>
      <div className="slack-avatar">{avatar}</div>
      <div className="slack-message-body">
        <div className="slack-message-meta">
          <strong>{label}</strong>
          <time dateTime={timestamp}>{formatTime(timestamp)}</time>
        </div>
        <div className="slack-bubble">{children}</div>
      </div>
    </article>
  );
}

export function BotReply({
  active,
  turn,
  onCancel,
  onRunFresh
}: {
  active: boolean;
  turn: SlackChatTurn;
  onCancel?: () => void;
  onRunFresh?: (question: string) => void;
}) {
  const result = turn.result;

  return (
    <ChatMessageBubble
      align="left"
      avatar={<Bot aria-hidden="true" size={17} />}
      label="Knowledge Bot"
      timestamp={turn.createdAt}
    >
      {turn.status === "processing" ? (
        <InlineProcessingStatus
          active={active}
          progress={turn.progress}
          step={turn.step}
          onCancel={onCancel}
        />
      ) : null}

      {turn.status === "failed" ? (
        <p className="slack-error">
          {turn.error || "I could not answer this question right now."}
        </p>
      ) : null}

      {turn.status === "cancelled" ? <p>Request cancelled.</p> : null}

      {turn.status === "completed" && result ? (
        <>
          <p>{turn.answer || result.answer}</p>
          <div className="slack-answer-labels">
            <AnswerSourceLabel result={result} />
            {result.answerSource === "PREVIOUS_SIMILAR_QUESTION" ? (
              <button
                className="thread-action"
                type="button"
                onClick={() => onRunFresh?.(turn.question)}
              >
                <RotateCcw aria-hidden="true" size={13} />
                Run fresh search
              </button>
            ) : null}
          </div>
          <ThreadedDetails result={result} responseTimeMs={turn.responseTimeMs} />
        </>
      ) : null}
    </ChatMessageBubble>
  );
}

export function InlineProcessingStatus({
  active,
  progress,
  step,
  onCancel
}: {
  active: boolean;
  progress: number;
  step: string;
  onCancel?: () => void;
}) {
  const boundedProgress = Math.max(0, Math.min(100, progress || 0));

  return (
    <div className="inline-processing">
      <div className="inline-processing-row">
        <span className="inline-status-text">
          <LoaderCircle className="spin" aria-hidden="true" size={15} />
          Processing your question...
        </span>
        <span>{boundedProgress}%</span>
      </div>
      <div className="inline-processing-step">
        Current step: {toSlackStepLabel(step)}
      </div>
      <div className="inline-progress-track" aria-label="Chat processing progress">
        <div className="inline-progress-fill" style={{ width: `${boundedProgress}%` }} />
      </div>
      {active && onCancel ? (
        <button className="thread-action danger" type="button" onClick={onCancel}>
          <Square aria-hidden="true" size={13} />
          Cancel
        </button>
      ) : null}
    </div>
  );
}

export function ThreadedDetails({
  responseTimeMs,
  result
}: {
  responseTimeMs?: number;
  result: ChatAnswer;
}) {
  return (
    <details className="thread-details">
      <summary>
        <ChevronDown aria-hidden="true" size={15} />
        Show sources and confidence
      </summary>
      <div className="thread-content">
        <SourceThread result={result} />
        <ConfidenceThread result={result} />
        <div className="thread-block">
          <h3>Processing</h3>
          <p>{getProcessingSummary(result)}</p>
          <dl className="thread-metadata">
            <div>
              <dt>Codex used</dt>
              <dd>{result.engine === "codex" && result.answerSource !== "PREVIOUS_SIMILAR_QUESTION" ? "Yes" : "No"}</dd>
            </div>
            <div>
              <dt>Answer reused</dt>
              <dd>{result.answerSource === "PREVIOUS_SIMILAR_QUESTION" || result.fromCache ? "Yes" : "No"}</dd>
            </div>
            <div>
              <dt>Response time</dt>
              <dd>{responseTimeMs ? `${responseTimeMs} ms` : "Not available"}</dd>
            </div>
            {typeof result.similarityScore === "number" ? (
              <div>
                <dt>Similarity</dt>
                <dd>{Math.round(result.similarityScore * 100)}%</dd>
              </div>
            ) : null}
          </dl>
        </div>
        {result.warning ? <div className="thread-warning">{result.warning}</div> : null}
      </div>
    </details>
  );
}

export function SourceThread({ result }: { result: ChatAnswer }) {
  if (result.sources.length === 0) {
    return (
      <div className="thread-block">
        <h3>Sources</h3>
        <p>No source references were returned for this answer.</p>
      </div>
    );
  }

  return (
    <div className="thread-block">
      <h3>Sources</h3>
      <div className="thread-source-list">
        {result.sources.map((source, index) => (
          <article className="thread-source" key={`${source.fileName}-${index}`}>
            <div className="thread-source-title">
              <FileText aria-hidden="true" size={14} />
              {source.webUrl ? (
                <a href={source.webUrl} rel="noreferrer" target="_blank">
                  {source.relativePath || source.fileName}
                </a>
              ) : (
                source.relativePath || source.fileName
              )}
            </div>
            {source.evidenceDetail ? (
              <p className="thread-source-evidence">{source.evidenceDetail}</p>
            ) : null}
            {source.sourceQuality ? (
              <span className={`source-quality ${source.sourceQuality.toLowerCase()}`}>
                {source.sourceQuality} quality
              </span>
            ) : null}
            {source.snippet ? <p>{source.snippet}</p> : null}
          </article>
        ))}
      </div>
    </div>
  );
}

export function ConfidenceThread({ result }: { result: ChatAnswer }) {
  const level = getConfidenceLevel(result.confidence);
  const percent = Math.round(result.confidence * 100);

  return (
    <div className="thread-block">
      <h3>Confidence</h3>
      <p>
        {level} - {percent}%.
        {level === "Low" ? " Please confirm with an SME before using this guidance." : ""}
      </p>
    </div>
  );
}

function AnswerSourceLabel({ result }: { result: ChatAnswer }) {
  let text = "Answered with Codex using indexed documents";

  if (result.answerSource === "PREVIOUS_SIMILAR_QUESTION") {
    text = "Reused from a similar previous question";
  } else if (result.answerSource === "REFUSAL") {
    text = "No supported answer found in indexed documents";
  } else if (result.engine === "codex-placeholder") {
    text = "Answered with local placeholder using indexed documents";
  }

  return (
    <span className="answer-source-label">
      <Sparkles aria-hidden="true" size={13} />
      {text}
    </span>
  );
}

function getProcessingSummary(result: ChatAnswer): string {
  if (result.answerSource === "PREVIOUS_SIMILAR_QUESTION") {
    return "Answered from previous similar question.";
  }

  if (result.answerSource === "REFUSAL") {
    return "No supported indexed context was available for this question.";
  }

  return result.engine === "codex"
    ? "Answered from indexed database + Codex."
    : "Answered from indexed database + local placeholder.";
}

function getConfidenceLevel(confidence: number): "High" | "Medium" | "Low" {
  if (confidence >= 0.75) return "High";
  if (confidence >= 0.45) return "Medium";
  return "Low";
}

function toSlackStepLabel(step: string): string {
  const normalized = step.toLowerCase();

  if (normalized.includes("queued")) return "Queued";
  if (normalized.includes("checking codex")) return "Checking local Codex";
  if (normalized.includes("document index")) return "Checking indexed database";
  if (normalized.includes("guardrails")) return "Checking guardrails and similar questions";
  if (normalized.includes("searching")) return "Searching indexed database";
  if (normalized.includes("preparing")) return "Preparing context";
  if (normalized.includes("running local codex")) return "Asking local Codex";
  if (normalized.includes("reading")) return "Formatting answer";
  if (normalized.includes("completed")) return "Completed";
  if (normalized.includes("cancel")) return "Request cancelled";
  if (normalized.includes("error")) return "Error";
  return step || "Working";
}

function formatTime(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
