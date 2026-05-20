# Architecture

## Shape

This is a single Next.js app with server-side API routes and local services.

- `app` contains pages and API routes.
- `components` contains React UI components.
- `services` contains Codex, guardrails, prompt, document source, extractor, index, and search logic.
- `types` contains shared TypeScript types.
- `config` contains guardrails and ignored runtime document-source config.
- `documents` is the default approved local folder for MVP development.
- `uploaded-documents` stores manual-upload files locally and is ignored by Git.

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
- `PARTIAL_METADATA`
- `TRANSCRIPT_LINKED`

Text-based files, PDFs, PPTX slide text, and XLSX cell text are indexed as full text when extraction succeeds. PNG, MP4 without transcript, URL shortcuts, and oversized files are metadata-indexed so business assets remain discoverable.

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
