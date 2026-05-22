import { hasFts, openDatabase, parseMetadata } from "./database.mjs";

const tokenPattern = /[a-zA-Z0-9]{2,}/g;
const stopWords = new Set(["about", "after", "also", "and", "are", "can", "for", "from", "how", "into", "that", "the", "this", "what", "when", "where", "which", "with", "your"]);

export function searchFiles(settings, query, limit = 5) {
  const terms = tokenize(query);
  if (!terms.length) {
    return [];
  }

  const database = openDatabase(settings.databasePath);
  try {
    if (hasFts(database)) {
      const results = searchWithFts(database, terms, limit);
      if (results.length) {
        return results;
      }
    }
    return searchWithLike(database, terms, limit);
  } finally {
    database.close();
  }
}

export function tokenize(query) {
  return Array.from(
    new Set(
      Array.from(query.toLowerCase().matchAll(tokenPattern))
        .map((match) => match[0])
        .filter((term) => term.length > 1 && !stopWords.has(term))
    )
  );
}

function searchWithFts(database, terms, limit) {
  const matchQuery = terms.slice(0, 12).map((term) => `${term}*`).join(" OR ");
  const rows = database
    .prepare(
      `SELECT
         f.id,
         f.file_path,
         f.relative_path,
         f.file_name,
         f.extension,
         f.size_bytes,
         f.modified_at,
         f.index_status,
         f.metadata_json,
         snippet(file_index_fts, 3, '', '', ' ... ', 36) AS snippet,
         bm25(file_index_fts) AS rank
       FROM file_index_fts
       JOIN file_index f ON f.id = file_index_fts.rowid
       WHERE file_index_fts MATCH ?
         AND f.index_status IN ('INDEXED', 'PARTIAL')
       ORDER BY rank ASC
       LIMIT ?`
    )
    .all(matchQuery, limit);
  return rows.map((row) => formatResult(row, Math.round(Math.abs(row.rank) * 10000) / 10000, row.snippet));
}

function searchWithLike(database, terms, limit) {
  const rows = database
    .prepare("SELECT * FROM file_index WHERE index_status IN ('INDEXED', 'PARTIAL') ORDER BY updated_at DESC")
    .all();
  return rows
    .map((row) => {
      const haystack = `${row.file_name} ${row.relative_path} ${row.extracted_text}`.toLowerCase();
      const score = terms.reduce((total, term) => total + countOccurrences(haystack, term), 0);
      return { row, score, snippet: buildSnippet(row.extracted_text, terms) };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => formatResult(item.row, item.score, item.snippet));
}

function formatResult(row, score, snippet) {
  return {
    id: row.id,
    file_path: row.file_path,
    relative_path: row.relative_path,
    file_name: row.file_name,
    extension: row.extension,
    size_bytes: row.size_bytes,
    modified_at: row.modified_at,
    index_status: row.index_status,
    metadata: parseMetadata(row.metadata_json),
    snippet: cleanSnippet(snippet),
    score
  };
}

function countOccurrences(value, term) {
  return value.split(term).length - 1;
}

function buildSnippet(text, terms, radius = 320) {
  const lower = text.toLowerCase();
  const locations = terms.map((term) => lower.indexOf(term)).filter((index) => index >= 0);
  const first = locations.length ? Math.min(...locations) : 0;
  const start = Math.max(0, first - radius);
  const end = Math.min(text.length, first + radius);
  return `${start > 0 ? "..." : ""}${text.slice(start, end)}${end < text.length ? "..." : ""}`;
}

function cleanSnippet(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 1800);
}

