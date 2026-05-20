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

Check the **Active Document Source** card on the dashboard. It shows the resolved folder path, indexed file count, skipped file count, supported file types, and last indexed time.

Supported MVP file types are `.txt`, `.md`, `.markdown`, `.json`, `.csv`, `.pdf`, `.pptx`, `.xlsx`, `.png`, `.mp4`, and `.url`.

Files may appear as:

- **Fully indexed** when useful text was extracted.
- **Transcript linked** when a video has a nearby `.txt` or `.vtt` transcript.
- **Metadata indexed only** when the app indexes filename, folder, and basic metadata.
- **Skipped** when a file is hidden/system, unreadable, corrupted, or outside the configured folder.

Set `LOCAL_DOCUMENTS_PATH=/absolute/path/to/documents` in `.env.local` to use a different approved local folder.

## Large Files

Large supported files are not skipped outright. If they exceed the configured full-text limit, the app indexes metadata only.

```bash
MAX_TEXT_EXTRACTION_FILE_SIZE_MB=100
MAX_VIDEO_METADATA_FILE_SIZE_MB=500
```

## Stop A Running Codex Job

Use the **Stop** button in the chat progress area. The app sends a cancel request and terminates the local Codex child process with `SIGTERM`.

## Cached Answer Appears

When the same question, guardrails, selected document chunks, and active folder match a previous completed run, the app reuses the cached response and shows **Loaded from cache**.

Delete files in `artifacts/cache` to clear the local cache.
