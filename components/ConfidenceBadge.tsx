"use client";

interface ConfidenceBadgeProps {
  confidence: number;
}

export function ConfidenceBadge({ confidence }: ConfidenceBadgeProps) {
  const percent = Math.round(confidence * 100);
  const level = confidence >= 0.75 ? "high" : confidence >= 0.45 ? "medium" : "low";

  return <span className={`confidence-badge ${level}`}>Confidence {percent}%</span>;
}
