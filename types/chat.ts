import type { SourceReference } from "./document";

export interface ChatRequestBody {
  question: string;
}

export interface ChatAnswer {
  answer: string;
  confidence: number;
  sources: SourceReference[];
  engine: "codex" | "codex-placeholder";
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
