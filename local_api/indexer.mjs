import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { hasFts, openDatabase } from "./database.mjs";

const skippedDirectories = new Set([
  ".git",
  ".next",
  ".venv",
  ".venv-local-api",
  "__pycache__",
  "node_modules",
  "dist",
  "build",
  "coverage"
]);
const textExtensions = new Set([".txt", ".md", ".markdown", ".csv", ".json", ".url", ".log", ".xml", ".html", ".htm"]);

export async function indexFolder(settings, input = {}) {
  const root = path.resolve(input.folder_path || settings.documentRoot);
  const allowedExtensions = normalizeExtensions(input.allowed_extensions || settings.allowedExtensions);
  const force = Boolean(input.force);

  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    const error = new Error(`Document folder does not exist or is not a directory: ${root}`);
    error.statusCode = 400;
    throw error;
  }

  const database = openDatabase(settings.databasePath);
  const now = utcNow();
  const run = database
    .prepare(
      "INSERT INTO index_runs (root_path, allowed_extensions_json, status, started_at) VALUES (?, ?, 'RUNNING', ?)"
    )
    .run(root, JSON.stringify(allowedExtensions), now);
  const runId = Number(run.lastInsertRowid);
  const existingRows = database
    .prepare("SELECT * FROM file_index WHERE file_path LIKE ?")
    .all(`${root}${path.sep}%`);
  const existingByPath = new Map(existingRows.map((row) => [row.file_path, row]));
  const seenPaths = new Set();
  const counts = {
    files_scanned: 0,
    files_indexed: 0,
    files_new: 0,
    files_changed: 0,
    files_deleted: 0,
    files_skipped: 0,
    files_failed: 0
  };

  try {
    for (const filePath of scanFiles(root, allowedExtensions, settings.recursive, settings.maxDepth)) {
      counts.files_scanned += 1;
      seenPaths.add(filePath);
      const stat = fs.statSync(filePath);
      const modifiedAt = stat.mtime.toISOString();
      const fileHash = hashFile(filePath);
      const existing = existingByPath.get(filePath);
      const isNew = !existing || existing.index_status === "DELETED";
      const isChanged = Boolean(existing && existing.file_hash !== fileHash);

      if (existing && !force && existing.file_hash === fileHash && existing.modified_at === modifiedAt) {
        counts.files_skipped += 1;
        continue;
      }

      const extracted = await extractText(filePath, settings.maxFileSizeMb);
      const rowId = upsertFile(database, {
        root,
        filePath,
        fileHash,
        modifiedAt,
        sizeBytes: stat.size,
        status: extracted.status,
        extractedText: extracted.text,
        metadata: {
          ...extracted.metadata,
          rootPath: root,
          relativePath: path.relative(root, filePath).split(path.sep).join("/"),
          sourceType: "LOCAL_FOLDER"
        },
        errorMessage: extracted.error,
        now: utcNow()
      });
      syncFts(database, rowId);

      if (isNew) {
        counts.files_new += 1;
      } else if (isChanged || force) {
        counts.files_changed += 1;
      }
      if (["INDEXED", "PARTIAL"].includes(extracted.status)) {
        counts.files_indexed += 1;
      } else if (extracted.status === "FAILED") {
        counts.files_failed += 1;
      } else {
        counts.files_skipped += 1;
      }
    }

    for (const [filePath, existing] of existingByPath) {
      if (seenPaths.has(filePath) || existing.index_status === "DELETED") {
        continue;
      }
      counts.files_deleted += 1;
      database
        .prepare(
          "UPDATE file_index SET index_status = 'DELETED', deleted_at = ?, updated_at = ?, extracted_text = '' WHERE id = ?"
        )
        .run(utcNow(), utcNow(), existing.id);
      deleteFts(database, existing.id);
    }

    database
      .prepare(
        `UPDATE index_runs
         SET status = 'COMPLETED',
             completed_at = ?,
             files_scanned = ?,
             files_indexed = ?,
             files_new = ?,
             files_changed = ?,
             files_deleted = ?,
             files_skipped = ?,
             files_failed = ?
         WHERE id = ?`
      )
      .run(
        utcNow(),
        counts.files_scanned,
        counts.files_indexed,
        counts.files_new,
        counts.files_changed,
        counts.files_deleted,
        counts.files_skipped,
        counts.files_failed,
        runId
      );

    return { run_id: runId, root_path: root, allowed_extensions: allowedExtensions, status: "COMPLETED", ...counts };
  } catch (error) {
    database
      .prepare("UPDATE index_runs SET status = 'FAILED', completed_at = ?, error_message = ? WHERE id = ?")
      .run(utcNow(), error instanceof Error ? error.message : String(error), runId);
    throw error;
  } finally {
    database.close();
  }
}

function* scanFiles(root, allowedExtensions, recursive, maxDepth) {
  if (!recursive) {
    for (const entry of fs.readdirSync(root, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const filePath = path.join(root, entry.name);
      if (entry.isFile() && isAllowedFile(filePath, allowedExtensions)) {
        yield path.resolve(filePath);
      }
    }
    return;
  }

  yield* scanDirectory(root, root, allowedExtensions, maxDepth, 0);
}

function* scanDirectory(root, directory, allowedExtensions, maxDepth, depth) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isSymbolicLink() || entry.name.startsWith(".") || entry.name.startsWith("~$")) {
      continue;
    }
    if (entry.isDirectory()) {
      if (skippedDirectories.has(entry.name) || depth >= maxDepth) {
        continue;
      }
      yield* scanDirectory(root, entryPath, allowedExtensions, maxDepth, depth + 1);
      continue;
    }
    if (entry.isFile() && isAllowedFile(entryPath, allowedExtensions)) {
      yield path.resolve(entryPath);
    }
  }
}

function isAllowedFile(filePath, allowedExtensions) {
  return allowedExtensions.includes(path.extname(filePath).toLowerCase()) && !path.basename(filePath).startsWith(".");
}

async function extractText(filePath, maxFileSizeMb) {
  const stat = fs.statSync(filePath);
  const extension = path.extname(filePath).toLowerCase();
  const baseMetadata = { sizeBytes: stat.size, extractor: "metadata", maxFileSizeMb };

  if (stat.size > maxFileSizeMb * 1024 * 1024) {
    return { text: "", metadata: baseMetadata, status: "SKIPPED", error: "File exceeds LOCAL_API_MAX_FILE_SIZE_MB." };
  }

  try {
    if (textExtensions.has(extension)) {
      const text = fs.readFileSync(filePath, "utf8");
      return { text: normalizeTextFile(text, extension), metadata: { ...baseMetadata, extractor: "plain-text" }, status: text.trim() ? "INDEXED" : "PARTIAL", error: null };
    }
    if (extension === ".docx" || extension === ".pptx") {
      const text = await extractOfficeXmlText(filePath, extension);
      return { text, metadata: { ...baseMetadata, extractor: "office-xml" }, status: text.trim() ? "INDEXED" : "PARTIAL", error: null };
    }
    if (extension === ".xlsx") {
      const text = await extractXlsxText(filePath);
      return { text, metadata: { ...baseMetadata, extractor: "exceljs" }, status: text.trim() ? "INDEXED" : "PARTIAL", error: null };
    }
    if (extension === ".pdf") {
      const text = await extractPdfText(filePath);
      return { text, metadata: { ...baseMetadata, extractor: "pdf-parse" }, status: text.trim() ? "INDEXED" : "PARTIAL", error: null };
    }
    return { text: "", metadata: { ...baseMetadata, extractor: "unsupported" }, status: "SKIPPED", error: `Unsupported file type: ${extension}` };
  } catch (error) {
    return {
      text: "",
      metadata: { ...baseMetadata, extractor: "failed" },
      status: "FAILED",
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function normalizeTextFile(text, extension) {
  if (extension === ".json") {
    try {
      return JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      return text;
    }
  }
  if (extension === ".csv") {
    return text
      .split(/\r?\n/)
      .map((line) => line.split(",").map((cell) => cell.trim()).join(" | "))
      .join("\n");
  }
  return text;
}

async function extractOfficeXmlText(filePath, extension) {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(fs.readFileSync(filePath));
  const names = Object.keys(zip.files)
    .filter((name) =>
      extension === ".docx"
        ? name.startsWith("word/") && name.endsWith(".xml")
        : name.startsWith("ppt/slides/slide") && name.endsWith(".xml")
    )
    .sort();
  const parts = [];
  for (const name of names) {
    const xml = await zip.files[name].async("string");
    const matches = Array.from(xml.matchAll(/<a:t[^>]*>(.*?)<\/a:t>|<w:t[^>]*>(.*?)<\/w:t>/g));
    const text = matches
      .map((match) => decodeXml(match[1] || match[2] || ""))
      .filter(Boolean)
      .join(" ");
    if (text) {
      parts.push(text);
    }
  }
  return parts.join("\n");
}

async function extractXlsxText(filePath) {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const parts = [];
  workbook.eachSheet((worksheet) => {
    parts.push(`Sheet: ${worksheet.name}`);
    worksheet.eachRow((row) => {
      const values = row.values
        .slice(1)
        .filter((value) => value !== null && value !== undefined && value !== "")
        .map((value) => String(value).trim());
      if (values.length) {
        parts.push(values.join(" | "));
      }
    });
  });
  return parts.join("\n");
}

async function extractPdfText(filePath) {
  const pdfParse = await import("pdf-parse");
  const parser = pdfParse.default || pdfParse;
  const result = await parser(fs.readFileSync(filePath));
  return result.text || "";
}

function decodeXml(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .trim();
}

function upsertFile(database, input) {
  const relativePath = path.relative(input.root, input.filePath).split(path.sep).join("/");
  const existing = database.prepare("SELECT id FROM file_index WHERE file_path = ?").get(input.filePath);
  if (existing) {
    database
      .prepare(
        `UPDATE file_index
         SET relative_path = ?,
             file_name = ?,
             extension = ?,
             file_hash = ?,
             size_bytes = ?,
             modified_at = ?,
             index_status = ?,
             extracted_text = ?,
             metadata_json = ?,
             error_message = ?,
             deleted_at = NULL,
             updated_at = ?,
             indexed_at = ?
         WHERE id = ?`
      )
      .run(
        relativePath,
        path.basename(input.filePath),
        path.extname(input.filePath).toLowerCase(),
        input.fileHash,
        input.sizeBytes,
        input.modifiedAt,
        input.status,
        input.extractedText,
        JSON.stringify(input.metadata),
        input.errorMessage,
        input.now,
        ["INDEXED", "PARTIAL"].includes(input.status) ? input.now : null,
        existing.id
      );
    return existing.id;
  }

  const result = database
    .prepare(
      `INSERT INTO file_index
       (file_path, relative_path, file_name, extension, file_hash, size_bytes, modified_at,
        index_status, extracted_text, metadata_json, error_message, created_at, updated_at, indexed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.filePath,
      relativePath,
      path.basename(input.filePath),
      path.extname(input.filePath).toLowerCase(),
      input.fileHash,
      input.sizeBytes,
      input.modifiedAt,
      input.status,
      input.extractedText,
      JSON.stringify(input.metadata),
      input.errorMessage,
      input.now,
      input.now,
      ["INDEXED", "PARTIAL"].includes(input.status) ? input.now : null
    );
  return Number(result.lastInsertRowid);
}

function syncFts(database, rowId) {
  if (!hasFts(database)) {
    return;
  }
  const row = database
    .prepare("SELECT file_path, relative_path, file_name, extracted_text FROM file_index WHERE id = ?")
    .get(rowId);
  if (!row) {
    return;
  }
  deleteFts(database, rowId);
  database
    .prepare(
      "INSERT INTO file_index_fts(rowid, file_path, relative_path, file_name, extracted_text) VALUES (?, ?, ?, ?, ?)"
    )
    .run(rowId, row.file_path, row.relative_path, row.file_name, row.extracted_text);
}

function deleteFts(database, rowId) {
  if (!hasFts(database)) {
    return;
  }
  database.prepare("DELETE FROM file_index_fts WHERE rowid = ?").run(rowId);
}

function hashFile(filePath) {
  const digest = crypto.createHash("sha256");
  digest.update(fs.readFileSync(filePath));
  return digest.digest("hex");
}

function normalizeExtensions(values) {
  return Array.from(
    new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean).map((value) => (value.startsWith(".") ? value : `.${value}`)))
  ).sort();
}

function utcNow() {
  return new Date().toISOString();
}
