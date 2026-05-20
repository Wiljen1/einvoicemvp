# Troubleshooting

## Codex Not Found

Set `CODEX_BIN` in `.env.local`.

macOS:

```bash
CODEX_BIN=/Applications/Codex.app/Contents/Resources/codex
```

Windows:

```bash
CODEX_BIN=C:\Users\you\AppData\Local\Programs\Codex\codex.exe
```

Restart `npm run dev` after changing `.env.local`.

## SharePoint Direct Access Is Not Available

The current MVP does not use Microsoft sign-in or Graph. Browser SharePoint login alone does not give this local app file access, and the app must not reuse browser cookies or scrape SharePoint pages.

Use OneDrive to sync the approved SharePoint folder locally, then choose **Synced SharePoint Folder** under `/settings/documents`.

Future direct SharePoint access is documented in `docs/future-sharepoint-integration.md`.

## Local Documents Not Showing

Check the top status pills and open **Document Index Details** on the dashboard. It shows the resolved folder path, indexed document count, indexed chunk count, skipped/failed files, OCR state, update status, and last indexed time.

Open `/api/diagnostics` if you need a quick service health check. It verifies the local index database, active source folder readability, recursive scanner, OCR setting, extractor registration, and local Codex availability.

Supported MVP file types are `.txt`, `.md`, `.markdown`, `.json`, `.csv`, `.pdf`, `.docx`, `.pptx`, `.xlsx`, `.png`, `.jpg`, `.jpeg`, `.mp4`, and `.url`.

Files may appear as:

- **Full text** when useful text was extracted.
- **OCR text** when useful text came from local OCR.
- **Transcript linked** when a video has a nearby `.txt` or `.vtt` transcript.
- **Metadata only** when the app indexes filename, folder, and basic metadata.
- **Skipped** when a file is hidden/system, unreadable, corrupted, or outside the configured folder.

Set `LOCAL_DOCUMENTS_PATH=/absolute/path/to/documents` in `.env.local` to use a different approved local folder.

If files are present but chat says no documents are indexed, click **Scan / Update Document Index**. Chat does not rescan or OCR files during a question; it only searches the saved local index.

If a chat answer seems stale after adding files, run **Scan / Update Document Index** first. The MVP intentionally does not index during chat.

The default SQLite index is stored at `data/knowledge-index.sqlite`. Set `INDEX_DATABASE_PATH=/absolute/path/to/knowledge-index.sqlite` if you want to store it elsewhere.

## Large Files

Large supported files are not skipped outright. If they exceed the configured full-text limit, the app indexes metadata only.

```bash
MAX_TEXT_EXTRACTION_FILE_SIZE_MB=100
MAX_VIDEO_METADATA_FILE_SIZE_MB=500
```

## OCR Not Processing

Confirm OCR is enabled:

```bash
ENABLE_LOCAL_OCR=true
OCR_LANGUAGE=eng
OCR_MAX_FILE_SIZE_MB=50
```

Image OCR uses local `tesseract.js`. Scanned PDF OCR also needs a local `pdftoppm` executable from Poppler. If that renderer is not available, scanned PDFs are kept as metadata-only assets and listed under **OCR not processed**.

## Stop A Running Codex Job

Use the **Stop** button in the chat progress area. The app sends a cancel request and terminates the local Codex child process with `SIGTERM`.

## Cached Answer Appears

When a high-similarity previous question is still safe to reuse, the app shows **Previous similar question** and offers **Run fresh search**. Reuse is disabled if the source changed, the index changed, source documents were excluded, or the prior answer was low confidence.

Set `LOG_CHAT_HISTORY=false` to stop saving future question and answer logs. Existing logs can be cleared in `/admin`.

Delete files in `artifacts/cache` to clear the local cache.

## Chat Seems To Use External Knowledge

The local Codex operator runs without internet search by default:

```bash
CODEX_ENABLE_SEARCH=false
```

Keep it disabled for approved-source validation. Answers should include source references from indexed SQLite chunks; unsupported questions should use the fallback message.
