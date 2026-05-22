import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { projectRoot } from "./config.mjs";
import { tokenize } from "./search.mjs";

const fallbackAnswer = "I could not find enough indexed local context to answer that confidently.";

export function getLlmStatus(settings) {
  const codexPath = resolveCommand(settings.codexBin);
  return {
    provider: settings.llmProvider,
    codex: {
      configured: Boolean(settings.codexBin),
      binary: settings.codexBin,
      resolved: codexPath || "",
      available: Boolean(codexPath)
    },
    openai: {
      configured: Boolean(settings.openaiApiKey),
      base_url: settings.openaiBaseUrl,
      model: settings.openaiModel
    },
    local_summary_available: true
  };
}

export async function answerQuestion(settings, question, results, providerOverride) {
  const provider = (providerOverride || settings.llmProvider || "auto").toLowerCase();
  if (!results.length) {
    return { answer: fallbackAnswer, provider: "local_summary", used_context: false };
  }

  if (provider === "auto" || provider === "codex") {
    try {
      const answer = runCodex(settings, buildPrompt(question, results));
      if (answer.trim()) {
        return { answer: answer.trim(), provider: "codex", used_context: true };
      }
    } catch (error) {
      if (provider === "codex") {
        throw error;
      }
    }
  }

  if (provider === "openai") {
    return {
      answer: await runOpenAI(settings, question, results),
      provider: "openai",
      used_context: true
    };
  }

  return {
    answer: buildLocalSummary(question, results),
    provider: "local_summary",
    used_context: true
  };
}

function buildPrompt(question, results) {
  const context = results
    .map((result, index) => `[Source ${index + 1}] ${result.relative_path}\n${result.snippet}`)
    .join("\n\n");
  return `You are answering an admin-only Oracle APEX knowledge assistant request.

Use only the local indexed context below. If the context is insufficient, say so plainly.
Return a concise answer and mention the source file names that support it.

Local indexed context:
${context}

Question:
${question}
`;
}

function runCodex(settings, prompt) {
  const binary = resolveCommand(settings.codexBin);
  if (!binary) {
    throw new Error("Codex binary was not found. Set CODEX_BIN or install Codex CLI.");
  }
  const outputPath = path.join(os.tmpdir(), `local-api-codex-${Date.now()}-${Math.random().toString(16).slice(2)}.md`);
  const args = [
    ...(settings.codexEnableSearch ? ["--search"] : []),
    "--ask-for-approval",
    "never",
    "exec",
    "-C",
    projectRoot,
    "--sandbox",
    "read-only",
    "--skip-git-repo-check",
    "--output-last-message",
    outputPath,
    "-"
  ];

  try {
    const result = spawnSync(binary, args, {
      input: prompt,
      encoding: "utf8",
      timeout: settings.codexTimeoutSeconds * 1000,
      cwd: projectRoot,
      env: safeCodexEnvironment()
    });
    if (result.error) {
      throw result.error;
    }
    if (result.status !== 0) {
      throw new Error((result.stderr || result.stdout || `Codex exited with ${result.status}`).trim());
    }
    const fileAnswer = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, "utf8").trim() : "";
    return fileAnswer || String(result.stdout || "").trim();
  } finally {
    try {
      fs.rmSync(outputPath, { force: true });
    } catch {
      // Best effort cleanup.
    }
  }
}

async function runOpenAI(settings, question, results) {
  if (!settings.openaiApiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }
  const response = await fetch(`${settings.openaiBaseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.openaiApiKey}`
    },
    body: JSON.stringify({
      model: settings.openaiModel,
      temperature: 0.1,
      messages: [
        {
          role: "system",
          content: "Answer using only the provided local indexed context. Say when the context is insufficient."
        },
        {
          role: "user",
          content: buildPrompt(question, results)
        }
      ]
    })
  });
  if (!response.ok) {
    throw new Error(`OpenAI-compatible endpoint returned HTTP ${response.status}: ${await response.text()}`);
  }
  const payload = await response.json();
  return payload?.choices?.[0]?.message?.content || "";
}

function buildLocalSummary(question, results) {
  const terms = tokenize(question);
  const sentences = [];
  for (const result of results) {
    for (const sentence of splitSentences(result.snippet)) {
      const lower = sentence.toLowerCase();
      if (!terms.length || terms.some((term) => lower.includes(term))) {
        sentences.push(sentence);
      }
      if (sentences.length >= 3) {
        break;
      }
    }
    if (sentences.length >= 3) {
      break;
    }
  }
  const selected = sentences.length ? sentences : [results[0].snippet];
  const sourceNames = Array.from(new Set(results.slice(0, 3).map((result) => result.file_name))).join(", ");
  return `${selected.join(" ")}\n\nSources: ${sourceNames}`;
}

function splitSentences(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function resolveCommand(command) {
  if (!command) {
    return null;
  }
  if (path.isAbsolute(command) && fs.existsSync(command)) {
    return command;
  }
  const pathEntries = (process.env.PATH || "").split(path.delimiter);
  for (const entry of pathEntries) {
    const candidate = path.join(entry, command);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function safeCodexEnvironment() {
  const keep = ["APPDATA", "HOME", "LOCALAPPDATA", "NODE_ENV", "PATH", "PROGRAMFILES", "PROGRAMFILES(X86)", "SHELL", "TERM", "TMPDIR", "USER", "USERPROFILE"];
  return Object.fromEntries(keep.map((key) => [key, process.env[key]]).filter(([, value]) => value));
}

