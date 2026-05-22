import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

loadEnvironment();

export function getSettings() {
  return {
    apiHost: env("LOCAL_API_HOST", "127.0.0.1"),
    apiPort: intEnv("LOCAL_API_PORT", 8010),
    databasePath: resolvePath(env("LOCAL_API_DATABASE_PATH", "./data/apex-middleware.sqlite")),
    documentRoot: resolvePath(env("LOCAL_API_DOCUMENT_ROOT", env("LOCAL_DOCUMENTS_PATH", "./documents"))),
    allowedExtensions: listEnv(
      "LOCAL_API_ALLOWED_EXTENSIONS",
      ".txt,.md,.markdown,.csv,.json,.pdf,.docx,.xlsx,.pptx,.url"
    ),
    recursive: boolEnv("LOCAL_API_RECURSIVE", true),
    maxDepth: intEnv("LOCAL_API_MAX_DEPTH", 10),
    maxFileSizeMb: intEnv("LOCAL_API_MAX_FILE_SIZE_MB", 100),
    adminToken: env("LOCAL_API_ADMIN_TOKEN", ""),
    llmProvider: env("LOCAL_API_LLM_PROVIDER", "auto").toLowerCase(),
    codexBin: env("CODEX_BIN", "codex"),
    codexTimeoutSeconds: intEnv("LOCAL_API_CODEX_TIMEOUT_SECONDS", 90),
    codexEnableSearch: boolEnv("CODEX_ENABLE_SEARCH", false),
    openaiApiKey: env("OPENAI_API_KEY", ""),
    openaiBaseUrl: env("OPENAI_BASE_URL", "https://api.openai.com/v1"),
    openaiModel: env("OPENAI_MODEL", "gpt-4.1-mini"),
    corsAllowOrigins: env("LOCAL_API_CORS_ALLOW_ORIGINS", "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean)
  };
}

function loadEnvironment() {
  for (const fileName of [".env.local-api", ".env.local", ".env"]) {
    const filePath = path.join(projectRoot, fileName);
    if (!fs.existsSync(filePath)) {
      continue;
    }
    const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }
      const separator = trimmed.indexOf("=");
      if (separator === -1) {
        continue;
      }
      const key = trimmed.slice(0, separator).trim();
      let value = trimmed.slice(separator + 1).trim();
      if (
        (value.startsWith("\"") && value.endsWith("\"")) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  }
}

function env(name, defaultValue) {
  return process.env[name] && process.env[name] !== "" ? process.env[name] : defaultValue;
}

function intEnv(name, defaultValue) {
  const value = Number.parseInt(env(name, String(defaultValue)), 10);
  return Number.isFinite(value) ? value : defaultValue;
}

function boolEnv(name, defaultValue) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") {
    return defaultValue;
  }
  return ["1", "true", "yes", "on"].includes(raw.toLowerCase());
}

function listEnv(name, defaultValue) {
  return Array.from(
    new Set(
      env(name, defaultValue)
        .split(",")
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean)
        .map((value) => (value.startsWith(".") ? value : `.${value}`))
    )
  ).sort();
}

function resolvePath(value) {
  const expanded = value.startsWith("~/") ? path.join(process.env.HOME || projectRoot, value.slice(2)) : value;
  return path.resolve(projectRoot, expanded);
}

