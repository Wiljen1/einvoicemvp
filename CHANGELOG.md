# Changelog

## Unreleased

- Added recursive local document indexing with max-depth, path-safety, symlink protection, and skipped-file reasons.
- Added text-based PDF extraction for local documents.
- Added PPTX, XLSX, PNG, MP4, and URL shortcut indexing.
- Added extraction modes for full text, metadata-only, and transcript-linked assets.
- Added optional local OCR for images and scanned PDF fallback paths.
- Added DOCX text extraction and embedded Office image warnings.
- Added disabled embedding service placeholder for future semantic search.
- Added persistent SQLite document indexing so extraction and OCR run during index updates, not during chat.
- Added index run APIs, progress polling, change detection, stale-index status, and duplicate prevention.
- Updated chat to search saved database chunks only.
- Reworked dashboard status into compact pills with collapsible document index details.
- Added large-file metadata indexing instead of aggressive skipping.
- Added document status and refresh endpoints for local reindexing without restart.
- Updated chat search and sources to use relative paths for nested files.
- Disabled the MSAL/Graph SharePoint flow for the local MVP.
- Added document-source settings for local folders, OneDrive-synced SharePoint folders, and manual uploads.
- Added future SharePoint integration documentation for admin-approved Graph options.
- Added clearer status states for Codex, active document source, file counts, and skipped files.
- Added tests for recursive indexing, PDF indexing, skipped files, document-source status behavior, guardrails, chat refusal, and active document sources.
