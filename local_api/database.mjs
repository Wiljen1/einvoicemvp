import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export function openDatabase(databasePath) {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const database = new DatabaseSync(databasePath);
  database.exec("PRAGMA foreign_keys = ON;");
  initializeDatabase(database);
  return database;
}

export function initializeDatabase(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS file_index (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_path TEXT NOT NULL UNIQUE,
      relative_path TEXT NOT NULL,
      file_name TEXT NOT NULL,
      extension TEXT NOT NULL,
      file_hash TEXT,
      size_bytes INTEGER NOT NULL DEFAULT 0,
      modified_at TEXT,
      index_status TEXT NOT NULL,
      extracted_text TEXT NOT NULL DEFAULT '',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      error_message TEXT,
      deleted_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      indexed_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_file_index_status ON file_index(index_status);
    CREATE INDEX IF NOT EXISTS idx_file_index_relative_path ON file_index(relative_path);

    CREATE TABLE IF NOT EXISTS index_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      root_path TEXT NOT NULL,
      allowed_extensions_json TEXT NOT NULL,
      status TEXT NOT NULL,
      files_scanned INTEGER NOT NULL DEFAULT 0,
      files_indexed INTEGER NOT NULL DEFAULT 0,
      files_new INTEGER NOT NULL DEFAULT 0,
      files_changed INTEGER NOT NULL DEFAULT 0,
      files_deleted INTEGER NOT NULL DEFAULT 0,
      files_skipped INTEGER NOT NULL DEFAULT 0,
      files_failed INTEGER NOT NULL DEFAULT 0,
      error_message TEXT,
      started_at TEXT NOT NULL,
      completed_at TEXT
    );
  `);
  ensureFts(database);
}

export function ensureFts(database) {
  try {
    database.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS file_index_fts
      USING fts5(file_path, relative_path, file_name, extracted_text);
    `);
    return true;
  } catch {
    return false;
  }
}

export function hasFts(database) {
  try {
    database.prepare("SELECT rowid FROM file_index_fts LIMIT 1").get();
    return true;
  } catch {
    return ensureFts(database);
  }
}

export function parseMetadata(value) {
  if (!value) {
    return {};
  }
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

