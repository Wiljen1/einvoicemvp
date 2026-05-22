import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import { getSettings } from "./config.mjs";
import { openDatabase, parseMetadata } from "./database.mjs";
import { indexFolder } from "./indexer.mjs";
import { answerQuestion, getLlmStatus } from "./llm.mjs";
import { searchFiles } from "./search.mjs";

const settings = getSettings();

if (process.argv.includes("--init-db")) {
  const database = openDatabase(settings.databasePath);
  database.close();
  console.log(`Initialized local API database at ${settings.databasePath}`);
  process.exit(0);
}

const server = createServer(async (request, response) => {
  try {
    if (handleCors(request, response)) {
      return;
    }
    if (!isAuthorized(request)) {
      return sendJson(response, 401, { ok: false, error: "Missing or invalid admin token." });
    }

    const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
    const method = request.method || "GET";

    if (method === "GET" && url.pathname === "/api/status") {
      return sendJson(response, 200, statusPayload());
    }
    if (method === "POST" && url.pathname === "/api/index") {
      const body = await readJson(request);
      const result = await indexFolder(settings, body);
      return sendJson(response, 200, { ok: true, ...result });
    }
    if (method === "GET" && url.pathname === "/api/files") {
      return sendJson(response, 200, filesPayload(url));
    }
    if (method === "POST" && url.pathname === "/api/search") {
      const body = await readJson(request);
      const query = requireString(body.query, "query");
      const limit = normalizeLimit(body.limit, 5, 25);
      const results = searchFiles(settings, query, limit);
      return sendJson(response, 200, { ok: true, query, results, count: results.length });
    }
    if (method === "POST" && url.pathname === "/api/ask") {
      const body = await readJson(request);
      const question = requireString(body.question, "question");
      const limit = normalizeLimit(body.limit, 5, 15);
      const results = searchFiles(settings, question, limit);
      const answer = await answerQuestion(settings, question, results, body.llm_provider);
      return sendJson(response, 200, {
        ok: true,
        question,
        answer: answer.answer,
        provider: answer.provider,
        used_context: answer.used_context,
        sources: results.map((result) => ({
          file_path: result.file_path,
          relative_path: result.relative_path,
          file_name: result.file_name,
          snippet: result.snippet,
          score: result.score,
          metadata: result.metadata
        }))
      });
    }

    sendJson(response, 404, { ok: false, error: "Not found." });
  } catch (error) {
    const statusCode = error?.statusCode || 500;
    sendJson(response, statusCode, { ok: false, error: error instanceof Error ? error.message : String(error) });
  }
});

server.listen(settings.apiPort, settings.apiHost, () => {
  console.log(`Local APEX middleware listening at http://${settings.apiHost}:${settings.apiPort}`);
});

function statusPayload() {
  const database = openDatabase(settings.databasePath);
  try {
    const counts = database
      .prepare(
        `SELECT
           COUNT(*) AS total_files,
           SUM(CASE WHEN index_status IN ('INDEXED', 'PARTIAL') THEN 1 ELSE 0 END) AS active_files,
           SUM(CASE WHEN index_status = 'DELETED' THEN 1 ELSE 0 END) AS deleted_files,
           SUM(CASE WHEN index_status = 'FAILED' THEN 1 ELSE 0 END) AS failed_files
         FROM file_index`
      )
      .get();
    const latestRun = database.prepare("SELECT * FROM index_runs ORDER BY id DESC LIMIT 1").get();
    return {
      ok: true,
      service: "local-apex-middleware",
      api: {
        host: settings.apiHost,
        port: settings.apiPort
      },
      database: {
        path: settings.databasePath,
        connected: true
      },
      folder: {
        path: settings.documentRoot,
        exists: fileExists(settings.documentRoot),
        recursive: settings.recursive,
        max_depth: settings.maxDepth,
        allowed_extensions: settings.allowedExtensions
      },
      index: {
        total_files: counts.total_files || 0,
        active_files: counts.active_files || 0,
        deleted_files: counts.deleted_files || 0,
        failed_files: counts.failed_files || 0,
        latest_run: latestRun || null
      },
      llm: getLlmStatus(settings),
      admin_only: Boolean(settings.adminToken)
    };
  } finally {
    database.close();
  }
}

function filesPayload(url) {
  const includeDeleted = url.searchParams.get("include_deleted") === "true";
  const limit = normalizeLimit(url.searchParams.get("limit"), 500, 5000);
  const database = openDatabase(settings.databasePath);
  try {
    const where = includeDeleted ? "" : "WHERE index_status != 'DELETED'";
    const rows = database
      .prepare(
        `SELECT id, file_path, relative_path, file_name, extension, file_hash,
                size_bytes, modified_at, index_status, metadata_json, error_message,
                deleted_at, created_at, updated_at, indexed_at
         FROM file_index
         ${where}
         ORDER BY relative_path
         LIMIT ?`
      )
      .all(limit);
    const files = rows.map((row) => {
      const { metadata_json: metadataJson, ...rest } = row;
      return { ...rest, metadata: parseMetadata(metadataJson) };
    });
    return { ok: true, files, count: files.length };
  } finally {
    database.close();
  }
}

function isAuthorized(request) {
  if (!settings.adminToken) {
    return true;
  }
  const headerToken = request.headers["x-admin-token"];
  const authorization = request.headers.authorization || "";
  const bearerToken = authorization.toLowerCase().startsWith("bearer ") ? authorization.slice(7).trim() : "";
  const supplied = Array.isArray(headerToken) ? headerToken[0] : headerToken || bearerToken;
  if (!supplied) {
    return false;
  }
  const expected = Buffer.from(settings.adminToken);
  const actual = Buffer.from(supplied);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function handleCors(request, response) {
  const origin = request.headers.origin;
  if (origin && settings.corsAllowOrigins.includes(origin)) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Admin-Token");
    response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  }
  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return true;
  }
  return false;
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) {
    return {};
  }
  try {
    return JSON.parse(raw);
  } catch {
    const error = new Error("Request body must be valid JSON.");
    error.statusCode = 400;
    throw error;
  }
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function requireString(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    const error = new Error(`${name} is required.`);
    error.statusCode = 400;
    throw error;
  }
  return value.trim();
}

function normalizeLimit(value, defaultValue, maxValue) {
  const parsed = Number.parseInt(String(value || defaultValue), 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return defaultValue;
  }
  return Math.min(parsed, maxValue);
}

function fileExists(filePath) {
  try {
    return Boolean(filePath && fs.statSync(filePath).isDirectory());
  } catch {
    return false;
  }
}
