"use client";

import { LoaderCircle, Square } from "lucide-react";
import type { ChatSessionStatus } from "@/types/chat";

interface ProcessingProgressBarProps {
  status: Pick<ChatSessionStatus, "status" | "progress" | "step" | "error">;
  onCancel?: () => void;
  compact?: boolean;
}

export function ProcessingProgressBar({
  status,
  onCancel,
  compact
}: ProcessingProgressBarProps) {
  const active = status.status === "RUNNING";
  const progress = Math.max(0, Math.min(100, status.progress || 0));

  return (
    <div className={`processing ${compact ? "compact" : ""}`} aria-live="polite">
      <div className="processing-row">
        <div className="processing-label">
          {active ? <LoaderCircle className="spin" aria-hidden="true" size={16} /> : null}
          <span>{status.step || "Idle"}</span>
        </div>
        <strong>{progress}%</strong>
      </div>
      <div className="progress-track" aria-label="Processing progress">
        <div className="progress-fill" style={{ width: `${progress}%` }} />
      </div>
      {status.error ? <div className="field-help">{status.error}</div> : null}
      {active && onCancel ? (
        <button className="button secondary stop-button" type="button" onClick={onCancel}>
          <Square aria-hidden="true" size={14} />
          Stop
        </button>
      ) : null}
    </div>
  );
}
