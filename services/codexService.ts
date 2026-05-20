import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { codexOperatorsDirectory, projectRoot } from "@/lib/paths";
import type { SearchResult } from "@/types/document";
import type { GuardrailsConfig } from "@/types/guardrails";
import { fallbackMessage } from "./guardrailsService";

const DEFAULT_TIMEOUT_MS = 3000;
const OPERATOR_TIMEOUT_MS = 90_000;
const MAX_PROMPT_CHARS = 12000;
const MAC_CODEX_PATH = "/Applications/Codex.app/Contents/Resources/codex";

interface RunningOperator {
  sessionId: string;
  process: ChildProcessWithoutNullStreams;
}

let currentOperator: RunningOperator | null = null;
const runningOperators = new Map<string, RunningOperator>();

export interface CodexStatus {
  available: boolean;
  message: string;
  command: string;
  binaryPath: string;
  executionMode: "placeholder" | "operator";
  setupInstructions?: string;
  version?: string;
}

export interface CodexExecutionInput {
  prompt: string;
  question: string;
  contextChunks: SearchResult[];
  guardrails: GuardrailsConfig;
  sessionId?: string;
}

export interface CodexExecutionResult {
  answer: string;
  engine: "codex" | "codex-placeholder";
  stdout?: string;
  stderr?: string;
}

export interface CodexOperatorOptions {
  sessionId?: string;
  timeoutMs?: number;
}

export interface CodexOperatorResult {
  sessionId: string;
  promptFile: string;
  outputFile: string;
  output: string;
  stdout: string;
  stderr: string;
  usedSearch: boolean;
}

export class CodexOperatorCancelledError extends Error {
  constructor() {
    super("Request cancelled");
    this.name = "CodexOperatorCancelledError";
  }
}

export async function getCodexBinaryPath(): Promise<string> {
  if (process.env.CODEX_BIN) {
    return process.env.CODEX_BIN;
  }

  if (process.platform === "darwin" && (await fileExists(MAC_CODEX_PATH))) {
    return MAC_CODEX_PATH;
  }

  if (process.platform === "win32") {
    const candidates = [
      process.env.LOCALAPPDATA
        ? path.join(process.env.LOCALAPPDATA, "Programs", "Codex", "codex.exe")
        : "",
      process.env.PROGRAMFILES ? path.join(process.env.PROGRAMFILES, "Codex", "codex.exe") : "",
      process.env["PROGRAMFILES(X86)"]
        ? path.join(process.env["PROGRAMFILES(X86)"] as string, "Codex", "codex.exe")
        : ""
    ].filter(Boolean);

    for (const candidate of candidates) {
      if (await fileExists(candidate)) {
        return candidate;
      }
    }
  }

  return "codex";
}

export async function validateCodexBinary(
  binaryPath: string,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<{ ok: true; version: string } | { ok: false; error: string }> {
  if (process.env.CODEX_FORCE_UNAVAILABLE === "true") {
    return {
      ok: false,
      error: "Codex was forced unavailable for this environment."
    };
  }

  try {
    const result = await runProcess(binaryPath, ["--version"], "", {
      timeoutMs,
      cwd: projectRoot
    });

    return {
      ok: true,
      version: result.stdout.trim() || result.stderr.trim() || "version detected"
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Codex did not respond."
    };
  }
}

export function getCodexSetupInstructions(): string {
  return "Codex was not found. Please install Codex or set CODEX_BIN in your .env.local file.";
}

export async function checkCodexStatus(options?: {
  command?: string;
  timeoutMs?: number;
}): Promise<CodexStatus> {
  const binaryPath = options?.command || (await getCodexBinaryPath());
  const validation = await validateCodexBinary(binaryPath, options?.timeoutMs || DEFAULT_TIMEOUT_MS);
  const executionMode = process.env.CODEX_EXECUTION_MODE === "placeholder" ? "placeholder" : "operator";

  if (validation.ok) {
    return {
      available: true,
      message: "Codex detected and operational",
      command: binaryPath,
      binaryPath,
      executionMode,
      version: validation.version
    };
  }

  return {
    available: false,
    message: "Codex not found / not available",
    command: binaryPath,
    binaryPath,
    executionMode,
    setupInstructions: getCodexSetupInstructions()
  };
}

export async function detectCodexStatus(options?: {
  command?: string;
  timeoutMs?: number;
}): Promise<CodexStatus> {
  return checkCodexStatus(options);
}

export async function executeCodexPrompt(input: CodexExecutionInput): Promise<CodexExecutionResult> {
  const executionMode = process.env.CODEX_EXECUTION_MODE === "placeholder" ? "placeholder" : "operator";

  if (executionMode === "placeholder") {
    return {
      answer: buildPlaceholderAnswer(input.question, input.contextChunks),
      engine: "codex-placeholder"
    };
  }

  const operatorResult = await runCodexOperator(input.prompt, "E-Invoice MVP chat", {
    sessionId: input.sessionId
  });

  return {
    answer: operatorResult.output.trim() || fallbackMessage,
    engine: "codex",
    stdout: operatorResult.stdout,
    stderr: operatorResult.stderr
  };
}

export async function runCodexOperator(
  prompt: string,
  sessionTitle: string,
  options?: CodexOperatorOptions
): Promise<CodexOperatorResult> {
  const binaryPath = await getCodexBinaryPath();
  const sessionId = sanitizeSessionId(options?.sessionId || `${Date.now()}-${crypto.randomUUID()}`);
  const promptFile = path.join(codexOperatorsDirectory, `${sessionId}-prompt.md`);
  const outputFile = path.join(codexOperatorsDirectory, `${sessionId}-output.md`);
  const boundedPrompt = prompt.slice(0, MAX_PROMPT_CHARS);
  const timeoutMs = options?.timeoutMs || OPERATOR_TIMEOUT_MS;

  await fs.mkdir(codexOperatorsDirectory, { recursive: true });
  await fs.writeFile(path.join(codexOperatorsDirectory, `${sessionId}-title.txt`), sessionTitle, {
    mode: 0o600
  });
  await fs.writeFile(promptFile, boundedPrompt, { mode: 0o600 });
  await fs.writeFile(outputFile, "", { mode: 0o600 });

  const searchArgs = buildCodexOperatorArgs(outputFile, true);

  try {
    const searchResult = await runTrackedCodexProcess(binaryPath, searchArgs, boundedPrompt, {
      sessionId,
      timeoutMs
    });

    return {
      sessionId,
      promptFile,
      outputFile,
      output: await readOperatorOutput(outputFile, searchResult.stdout),
      stdout: searchResult.stdout,
      stderr: searchResult.stderr,
      usedSearch: true
    };
  } catch (error) {
    if (error instanceof CodexOperatorCancelledError) {
      throw error;
    }
  }

  const fallbackResult = await runTrackedCodexProcess(
    binaryPath,
    buildCodexOperatorArgs(outputFile, false),
    boundedPrompt,
    {
      sessionId,
      timeoutMs
    }
  );

  return {
    sessionId,
    promptFile,
    outputFile,
    output: await readOperatorOutput(outputFile, fallbackResult.stdout),
    stdout: fallbackResult.stdout,
    stderr: fallbackResult.stderr,
    usedSearch: false
  };
}

export function stopCurrentCodexOperator(sessionId?: string): boolean {
  const operator = sessionId ? runningOperators.get(sessionId) : currentOperator;

  if (!operator) {
    return false;
  }

  operator.process.kill("SIGTERM");
  return true;
}

export function buildPlaceholderAnswer(
  question: string,
  contextChunks: SearchResult[]
): string {
  if (contextChunks.length === 0) {
    return fallbackMessage;
  }

  const terms = tokenize(question);
  const sentences = contextChunks
    .flatMap((chunk) => splitSentences(chunk.snippet))
    .filter((sentence) => {
      const lower = sentence.toLowerCase();
      return terms.some((term) => lower.includes(term));
    });

  const selected = (sentences.length > 0 ? sentences : [contextChunks[0].snippet])
    .slice(0, 2)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  if (selected.length === 0) {
    return fallbackMessage;
  }

  return `MVP Codex placeholder answer: ${selected.join(" ")}`;
}

function buildCodexOperatorArgs(outputFile: string, includeSearch: boolean): string[] {
  return [
    ...(includeSearch ? ["--search"] : []),
    "--ask-for-approval",
    "never",
    "exec",
    "-C",
    projectRoot,
    "--sandbox",
    "read-only",
    "--skip-git-repo-check",
    "--output-last-message",
    outputFile,
    "-"
  ];
}

async function runTrackedCodexProcess(
  binaryPath: string,
  args: string[],
  stdin: string,
  options: { sessionId: string; timeoutMs: number }
): Promise<{ stdout: string; stderr: string }> {
  const child = spawn(binaryPath, args, {
    cwd: projectRoot,
    env: safeCodexEnvironment(process.env),
    shell: false
  });
  const operator = {
    sessionId: options.sessionId,
    process: child
  };

  currentOperator = operator;
  runningOperators.set(options.sessionId, operator);

  try {
    return await collectProcess(child, stdin, options.timeoutMs);
  } finally {
    runningOperators.delete(options.sessionId);
    if (currentOperator?.sessionId === options.sessionId) {
      currentOperator = null;
    }
  }
}

function collectProcess(
  child: ChildProcessWithoutNullStreams,
  stdin: string,
  timeoutMs: number
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let killedForTimeout = false;

    const timeout = setTimeout(() => {
      killedForTimeout = true;
      child.kill("SIGTERM");
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code, signal) => {
      clearTimeout(timeout);

      if (signal === "SIGTERM" && !killedForTimeout) {
        reject(new CodexOperatorCancelledError());
        return;
      }

      if (killedForTimeout) {
        reject(new Error("Local Codex timed out."));
        return;
      }

      if (code !== 0) {
        reject(new Error(cleanProcessError(stderr || stdout || `Local Codex exited with ${code}.`)));
        return;
      }

      resolve({ stdout, stderr });
    });

    child.stdin.end(stdin);
  });
}

async function runProcess(
  binaryPath: string,
  args: string[],
  stdin: string,
  options: { timeoutMs: number; cwd: string }
): Promise<{ stdout: string; stderr: string }> {
  const child = spawn(binaryPath, args, {
    cwd: options.cwd,
    env: safeCodexEnvironment(process.env),
    shell: false
  });

  return collectProcess(child, stdin, options.timeoutMs);
}

async function readOperatorOutput(outputFile: string, fallback: string): Promise<string> {
  try {
    const output = await fs.readFile(outputFile, "utf8");
    return output.trim() || fallback.trim();
  } catch {
    return fallback.trim();
  }
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
    APPDATA: env.APPDATA,
    HOME: env.HOME || os.homedir(),
    LOCALAPPDATA: env.LOCALAPPDATA,
    NODE_ENV: env.NODE_ENV || "development",
    PATH: env.PATH,
    PROGRAMFILES: env.PROGRAMFILES,
    "PROGRAMFILES(X86)": env["PROGRAMFILES(X86)"],
    SHELL: env.SHELL,
    TERM: env.TERM,
    TMPDIR: env.TMPDIR,
    USER: env.USER,
    USERPROFILE: env.USERPROFILE
  };
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function sanitizeSessionId(value: string): string {
  return value.replace(/[^a-zA-Z0-9-]/g, "-").slice(0, 80);
}

function cleanProcessError(value: string): string {
  return value.replace(/client_secret=[^&\s]+/gi, "client_secret=REDACTED").slice(0, 1000);
}
