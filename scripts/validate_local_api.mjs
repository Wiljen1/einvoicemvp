import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const adminToken = "validation-token";

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "apex-local-api-"));
const docsPath = path.join(tempRoot, "documents");
fs.mkdirSync(docsPath);
fs.writeFileSync(
  path.join(docsPath, "peppol.md"),
  "Peppol e-invoicing uses structured invoice documents. Oracle APEX should call the local REST API middleware for admin workflows.",
  "utf8"
);
fs.writeFileSync(
  path.join(docsPath, "operations.txt"),
  "The middleware indexes local folders, stores metadata in SQLite, and searches extracted text.",
  "utf8"
);

const port = await findFreePort();
const env = {
  ...process.env,
  LOCAL_API_HOST: "127.0.0.1",
  LOCAL_API_PORT: String(port),
  LOCAL_API_DOCUMENT_ROOT: docsPath,
  LOCAL_API_DATABASE_PATH: path.join(tempRoot, "apex-middleware.sqlite"),
  LOCAL_API_ALLOWED_EXTENSIONS: ".txt,.md,.json,.csv",
  LOCAL_API_LLM_PROVIDER: "local_summary",
  LOCAL_API_ADMIN_TOKEN: adminToken
};

const child = spawn(process.execPath, ["local_api/server.mjs"], {
  cwd: projectRoot,
  env,
  stdio: ["ignore", "pipe", "pipe"]
});

try {
  const baseUrl = `http://127.0.0.1:${port}`;
  await waitForStatus(baseUrl);

  const status = await requestJson(baseUrl, "GET", "/api/status");
  assert(status.ok === true, "status should be ok");

  const indexed = await requestJson(baseUrl, "POST", "/api/index", {});
  assert(indexed.files_scanned === 2, "index should scan two files");
  assert(indexed.files_indexed === 2, "index should index two files");

  const files = await requestJson(baseUrl, "GET", "/api/files");
  assert(files.count === 2, "files should list two indexed files");

  const search = await requestJson(baseUrl, "POST", "/api/search", {
    query: "Peppol invoice middleware",
    limit: 3
  });
  assert(search.count >= 1, "search should return at least one result");

  const ask = await requestJson(baseUrl, "POST", "/api/ask", {
    question: "How should APEX call Peppol invoice data?",
    limit: 3
  });
  assert(ask.ok === true, "ask should be ok");
  assert(Boolean(ask.answer), "ask should return an answer");
  assert(Array.isArray(ask.sources) && ask.sources.length >= 1, "ask should return sources");

  fs.appendFileSync(
    path.join(docsPath, "operations.txt"),
    "\nChanged files are detected by hash and modified timestamp.",
    "utf8"
  );
  fs.rmSync(path.join(docsPath, "peppol.md"));
  fs.writeFileSync(
    path.join(docsPath, "new-policy.md"),
    "New files are included in the next local indexing run.",
    "utf8"
  );
  const reindexed = await requestJson(baseUrl, "POST", "/api/index", {});
  assert(reindexed.files_new >= 1, "second index should detect a new file");
  assert(reindexed.files_changed >= 1, "second index should detect a changed file");
  assert(reindexed.files_deleted >= 1, "second index should detect a deleted file");

  console.log("Local API validation passed");
  console.log(`Validated status, indexing, change detection, files, search, ask, and localhost reachability at ${baseUrl}`);
} finally {
  child.kill("SIGTERM");
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

function requestJson(baseUrl, method, pathname, body) {
  return fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Admin-Token": adminToken
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  }).then(async (response) => {
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(`${method} ${pathname} failed with ${response.status}: ${JSON.stringify(payload)}`);
    }
    return payload;
  });
}

async function waitForStatus(baseUrl) {
  const started = Date.now();
  let lastError;
  while (Date.now() - started < 20000) {
    try {
      await requestJson(baseUrl, "GET", "/api/status");
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error(`Local API did not start in time: ${lastError?.message || "unknown error"}`);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function findFreePort() {
  return new Promise((resolve, reject) => {
    import("node:net").then(({ createServer }) => {
      const server = createServer();
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        const port = typeof address === "object" && address ? address.port : 0;
        server.close(() => resolve(port));
      });
      server.on("error", reject);
    }, reject);
  });
}
