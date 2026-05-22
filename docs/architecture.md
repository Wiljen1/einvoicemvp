# Architecture

## Current Direction

The target architecture is now APEX-first. Oracle APEX and Autonomous Database should own backend data, admin UI, analytics, governance, configuration, reporting, audit logs, and ORDS APIs. Custom Node services should be limited to Slack runtime duties and Codex runner orchestration.

See `docs/apex-first-architecture.md` for the corrected target architecture.

The Next.js/local SQLite architecture below is a legacy local MVP/prototype shape. Do not expand it into a duplicate admin/governance platform.

## Shape

This is a single Next.js app with server-side API routes and local services.

- `app` contains pages and API routes.
- `components` contains React UI components.
- `services` contains Codex, guardrails, prompt, document source, extractor, SQLite index, and search logic.
- `types` contains shared TypeScript types.
- `config` contains guardrails and ignored runtime document-source config.
- `documents` is the default approved local folder for MVP development.
- `uploaded-documents` stores manual-upload files locally and is ignored by Git.
- `local_api` contains a standalone Node.js middleware for Oracle APEX admin screens.

## Oracle APEX Middleware

APEX integrates through the local Node.js service in `local_api/` instead of calling Codex directly.

The middleware provides:

- `GET /api/status`
- `POST /api/index`
- `GET /api/files`
- `POST /api/search`
- `POST /api/ask`

It scans a configured local folder, stores file metadata and extracted text in a separate SQLite database, searches indexed content, retrieves relevant snippets for questions, and bridges to local Codex or an explicitly configured OpenAI-compatible endpoint. If Codex is unavailable and the provider is `auto`, it can return a local extractive answer so validation remains fully local.

The APEX middleware intentionally does not require SharePoint or OCI. The REST boundary is kept narrow so the same APEX REST Data Source can later point to an OCI-hosted version of the service.

## Chat Flow

1. Validate the question.
2. Start a local chat session and return a session id.
3. Check local Codex availability.
4. Check the active document source.
5. Load current guardrails.
6. Read only indexed approved documents.
7. Run keyword chunk search across text, filenames, metadata, folders, and transcripts.
8. Refuse if no supported context is found.
9. Build a bounded prompt from guardrails, sources, and question.
10. Reuse a cached answer if the stable request hash already exists.
11. Run local Codex as a read-only background operator.
12. Return answer, confidence, sources, and cache status through polling.

## Document Sources

Supported active modes:

- `LOCAL_FOLDER`
- `SYNCED_SHAREPOINT_FOLDER`
- `MANUAL_UPLOAD`

Future disabled mode:

- `GRAPH_SHAREPOINT`, only if a secure admin-approved integration is restored behind `ENABLE_MSAL_SHAREPOINT=true`.

## Extraction Modes

Indexed files expose one of:

- `FULL_TEXT`
- `OCR_TEXT`
- `PARTIAL_METADATA`
- `TRANSCRIPT_LINKED`

Text-based files, PDFs, DOCX text, PPTX slide text, and XLSX cell text are indexed as full text when extraction succeeds. PNG/JPG/JPEG and scanned PDFs can be indexed as OCR text through local `tesseract.js`. MP4 without transcript, URL shortcuts, and oversized files are metadata-indexed so business assets remain discoverable.

Semantic embeddings are intentionally represented only by the disabled `EmbeddingService` interface. The current MVP continues to use keyword/chunk search.

## Persistent Index

Documents are indexed into local SQLite before chat:

- `DocumentSource` stores source type and root path.
- `IndexedDocument` stores file path, checksum, modified time, extraction status, mode, metadata, and indexed time.
- `DocumentChunk` stores searchable text chunks.
- `IndexRun` stores scan/update progress and history.

`POST /api/index/run` scans the active source, extracts/OCRs only new or changed files, replaces chunks for changed files, and marks deleted files missing. Chat searches `DocumentChunk` rows and does not rescan folders or run OCR during a question.

Index endpoints:

- `GET /api/index/status`
- `POST /api/index/run`
- `GET /api/index/run/:runId`
- `POST /api/index/run/:runId/cancel`
- `GET /api/index/documents`

## Chat Session Endpoints

- `POST /api/chat/start`
- `GET /api/chat/status/:sessionId`
- `POST /api/chat/cancel/:sessionId`

The UI polls for progress and can cancel the running local Codex child process.

## Security Boundary

The chatbot never browses the internet. It only reads files from the active configured local source.

Local folders are scanned recursively by default with max-depth protection. The indexer does not follow symlinks, does not leave the configured root folder, skips hidden/system folders, and ignores temporary Office files.

Local Codex is run with a read-only sandbox, no approvals, and approved document context only. The app never sends prompts to a paid cloud AI API.

## Guardrail Prompt Order

Prompts are built in this order:

1. System Guardrails
2. User Additional Guardrails
3. Document Context
4. User Question

User additional guardrails cannot override the fixed system guardrails.
