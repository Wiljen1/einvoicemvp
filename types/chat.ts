import type { SourceReference } from "./document";

export interface ChatRequestBody {
  question: string;
}

export interface ChatAnswer {
  answer: string;
  confidence: number;
  sources: SourceReference[];
  engine: "codex" | "codex-placeholder";
  fromCache?: boolean;
  warning?: string;
}

export type ChatSessionState = "IDLE" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";

export interface ChatSessionStatus {
  sessionId: string;
  status: ChatSessionState;
  progress: number;
  step: string;
  answer: string | null;
  confidence: number | null;
  sources: SourceReference[];
  error: string | null;
  engine?: "codex" | "codex-placeholder";
  fromCache?: boolean;
  warning?: string;
}

export interface ApiSuccess<T> {
  ok: true;
  data: T;
}

export interface ApiFailure {
  ok: false;
  error: string;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;
