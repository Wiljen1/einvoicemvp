import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { SearchResult } from "@/types/document";
import type { GuardrailsConfig } from "@/types/guardrails";

const execFileAsync = promisify(execFile);
const DEFAULT_TIMEOUT_MS = 3000;
const DEFAULT_COMMAND = "codex";
const MAX_PROMPT_CHARS = 12000;

export interface CodexStatus {
  available: boolean;
  message: string;
  command: string;
  executionMode: "placeholder" | "real";
}

export interface CodexExecutionInput {
  prompt: string;
  question: string;
  contextChunks: SearchResult[];
  guardrails: GuardrailsConfig;
}

export interface CodexExecutionResult {
  answer: string;
  engine: "codex" | "codex-placeholder";
}

export async function detectCodexStatus(options?: {
  command?: string;
  timeoutMs?: number;
}): Promise<CodexStatus> {
  const command = options?.command || process.env.CODEX_COMMAND || DEFAULT_COMMAND;
  const timeoutMs = options?.timeoutMs || DEFAULT_TIMEOUT_MS;
  const executionMode = process.env.CODEX_EXECUTION_MODE === "real" ? "real" : "placeholder";

  if (process.env.CODEX_FORCE_UNAVAILABLE === "true") {
    return {
      available: false,
      message: "Codex not found / not available",
      command,
      executionMode
    };
  }

  try {
    await execFileAsync(command, ["--version"], {
      timeout: timeoutMs,
      maxBuffer: 20_000,
      cwd: process.cwd(),
      env: safeCodexEnvironment(process.env)
    });

    return {
      available: true,
      message: "Codex detected and operational",
      command,
      executionMode
    };
  } catch {
    return {
      available: false,
      message: "Codex not found / not available",
      command,
      executionMode
    };
  }
}

export async function executeCodexPrompt(input: CodexExecutionInput): Promise<CodexExecutionResult> {
  const executionMode = process.env.CODEX_EXECUTION_MODE === "real" ? "real" : "placeholder";

  if (executionMode !== "real") {
    return {
      answer: buildPlaceholderAnswer(input.question, input.contextChunks, input.guardrails),
      engine: "codex-placeholder"
    };
  }

  return executeRealCodex(input);
}

async function executeRealCodex(input: CodexExecutionInput): Promise<CodexExecutionResult> {
  const command = process.env.CODEX_COMMAND || DEFAULT_COMMAND;
  const prompt = input.prompt.slice(0, MAX_PROMPT_CHARS);

  try {
    const { stdout } = await execFileAsync(command, ["exec", "--skip-git-repo-check", prompt], {
      timeout: 30_000,
      maxBuffer: 200_000,
      cwd: process.cwd(),
      env: safeCodexEnvironment(process.env)
    });

    return {
      answer: stdout.trim() || input.guardrails.fallbackMessage,
      engine: "codex"
    };
  } catch {
    return {
      answer: input.guardrails.fallbackMessage,
      engine: "codex"
    };
  }
}

function buildPlaceholderAnswer(
  question: string,
  contextChunks: SearchResult[],
  guardrails: GuardrailsConfig
): string {
  if (contextChunks.length === 0) {
    return guardrails.fallbackMessage;
  }

  const terms = tokenize(question);
  const sentences = contextChunks
    .flatMap((chunk) => splitSentences(chunk.snippet))
    .filter((sentence) => {
      const lower = sentence.toLowerCase();
      return terms.some((term) => lower.includes(term));
    });

  const selected = (sentences.length > 0 ? sentences : [contextChunks[0].snippet])
    .slice(0, guardrails.keepAnswersShort ? 2 : 4)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  if (selected.length === 0) {
    return guardrails.fallbackMessage;
  }

  return `MVP Codex placeholder answer: ${selected.join(" ")}`;
}

function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function tokenize(value: string): string[] {
  const stopWords = new Set([
    "a",
    "an",
    "and",
    "are",
    "for",
    "from",
    "how",
    "is",
    "of",
    "on",
    "or",
    "the",
    "to",
    "what",
    "when",
    "where",
    "why"
  ]);

  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => term.length > 2 && !stopWords.has(term));
}

function safeCodexEnvironment(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return {
    PATH: env.PATH,
    HOME: env.HOME,
    NODE_ENV: env.NODE_ENV || "development",
    USER: env.USER,
    SHELL: env.SHELL,
    TERM: env.TERM
  };
}
