# Local Indexing

The MVP stores extracted document text in a local SQLite database so chat questions stay fast.

## Flow

1. User clicks **Scan / Update Document Index**, or startup detects changes when `AUTO_INDEX_ON_STARTUP=true`.
2. The app scans the active local source.
3. New or changed files are extracted once.
4. OCR runs once during indexing when enabled.
5. Extracted text is chunked and saved to SQLite.
6. Chat searches saved chunks only.

Chat does not rescan folders, re-extract Office files, or OCR images while answering a question.

## Database

Default path:

```bash
data/knowledge-index.sqlite
```

Override:

```bash
INDEX_DATABASE_PATH=/absolute/path/to/knowledge-index.sqlite
```

Tables:

- `DocumentSource`: active source type, display name, root path, and last scan time.
- `IndexedDocument`: source id, relative path, absolute path, extension, size, modified time, checksum, extraction status, extraction mode, metadata, and indexed timestamp.
- `DocumentChunk`: searchable text chunks with optional page, slide, or sheet metadata.
- `IndexRun`: scan/update history, progress counts, OCR count, status, and errors.
- `ChatSession`, `ChatMessage`, and `QuestionAnswerLog`: local question history, assistant answers, reuse metadata, response time, confidence, and sources.

Documents are unique by `sourceId + relativePath`. Changed files replace old chunks instead of creating duplicates. Deleted files are marked missing and removed from active search.

Document sources are keyed by a deterministic `sourceKey` generated from the source type and normalized root folder path. Switching back to a previously used local or OneDrive-synced folder reuses the same `DocumentSource`, existing indexed records, and any document exclusions.

## Change Detection

Indexing compares:

- relative path
- file size
- modified time
- checksum when a file appears changed

Unchanged files are skipped and are not OCR-processed again.

Change detection is per source. The active folder is the only source searched by chat; known sources remain in the local database so their index state can be reused later.

## Status

`GET /api/diagnostics` reports service health for SQLite, the active source, recursive scanning, OCR, extractors, and Codex before you start a run.

`GET /api/index/status` reports:

- active source and root path
- source key and known previously indexed sources
- `FRESH`, `STALE`, or `EMPTY`
- indexed document and chunk counts
- new, changed, and deleted file counts
- OCR enabled/disabled state
- registered extractors and supported file extensions
- startup validation warnings
- last indexed timestamp
- latest in-memory index run

`POST /api/index/run` starts an index update. `GET /api/index/run/:runId` returns progress. `POST /api/index/run/:runId/cancel` cancels a running index update when possible.

`GET /api/document-sources` lists previously used folders. `POST /api/document-sources/select` switches back to a known source. `DELETE /api/document-sources/:sourceId` removes a source and its indexed records from the local database.

## Chat Behavior

If no chunks exist, chat returns:

```text
No documents are indexed yet. Please run Scan / Update Document Index first.
```

If chunks exist, chat searches `DocumentChunk` rows by keyword, filename, relative path, and metadata. Semantic embeddings are intentionally disabled for the MVP and represented by a future `EmbeddingService` hook.

Chat requests do not start an index run, rescan folders, re-extract Office/PDF files, or run OCR. The only database reads during chat are active-source chunk search, safe answer reuse checks, and status/cache lookups.

## Validation Commands

Run a full local check:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

After indexing, verify the database has source, document, and chunk rows:

```bash
node -e "const { DatabaseSync } = require('node:sqlite'); const db = new DatabaseSync('data/knowledge-index.sqlite', { readOnly: true }); console.log(db.prepare('SELECT COUNT(*) AS documents FROM IndexedDocument WHERE isMissing = 0').get()); console.log(db.prepare('SELECT COUNT(*) AS chunks FROM DocumentChunk').get()); console.log(db.prepare('SELECT COUNT(*) AS questions FROM QuestionAnswerLog').get()); db.close();"
```

## Document Exclusions

Indexed documents can be excluded without deleting them from the local database:

- **Exclude from Chat** keeps the file indexed but removes its chunks from search, prompt context, confidence scoring, and source references.
- **Exclude from Future Indexing** preserves the current metadata/index record and skips reprocessing that file during later scan/update runs.
- Exclusion reason, timestamp, and local user marker are stored with the indexed document.

Use the indexed files list in Document Source Settings to filter active/excluded files, update individual exclusions, or apply bulk exclusion/re-enable actions.
