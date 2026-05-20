# Local Documents

Local document mode is for no-cost MVP testing, colleague demos, and OneDrive-synced SharePoint folders.

## Configure The Folder

Default folder:

```bash
<project-root>/documents
```

Optional override:

```bash
LOCAL_DOCUMENTS_PATH=/absolute/path/to/documents
```

Recursive scanning is enabled by default:

```bash
LOCAL_DOCUMENTS_RECURSIVE=true
LOCAL_DOCUMENTS_MAX_DEPTH=10
MAX_TEXT_EXTRACTION_FILE_SIZE_MB=100
MAX_VIDEO_METADATA_FILE_SIZE_MB=500
ENABLE_LOCAL_OCR=true
OCR_LANGUAGE=eng
OCR_MAX_FILE_SIZE_MB=50
AUTO_INDEX_ON_STARTUP=true
INDEX_DATABASE_PATH=
```

The dashboard shows the resolved absolute folder path, indexed document count, indexed chunk count, skipped/failed file count, OCR state, and last indexed time in **Document Index Details**.

## Supported Files

The MVP indexes:

- `.txt`
- `.md`
- `.markdown`
- `.json`
- `.csv`
- text-based `.pdf`
- `.docx`
- `.pptx`
- `.xlsx`
- `.png`
- `.jpg`
- `.jpeg`
- `.mp4`
- `.url`

PPTX extracts slide text and speaker notes when available. DOCX extracts document text. XLSX extracts sheet names and non-empty cell text. PNG/JPG/JPEG files use local OCR when enabled, otherwise they are metadata-indexed. MP4 files are indexed as searchable assets and link nearby `.txt` or `.vtt` transcripts when present. URL shortcut files index the target URL and filename.

Scanned PDFs first try normal PDF text extraction, then local OCR fallback when enabled. If OCR is unavailable or fails, the file is still metadata-indexed with a visible reason.

## Indexing Modes

- `FULL_TEXT`: searchable text was extracted.
- `OCR_TEXT`: searchable text came from local OCR.
- `TRANSCRIPT_LINKED`: a video was indexed with a nearby transcript.
- `PARTIAL_METADATA`: filename, folder, and useful metadata were indexed.

## Local OCR

OCR is local-only and does not call external APIs:

```bash
ENABLE_LOCAL_OCR=true
OCR_LANGUAGE=eng
OCR_MAX_FILE_SIZE_MB=50
```

Image OCR works directly through `tesseract.js`. Scanned PDF OCR additionally needs a local PDF renderer (`pdftoppm`, commonly installed with Poppler). Without that renderer, scanned PDFs are metadata-indexed and the UI shows why OCR could not be processed.

Embedded images inside PPTX/DOCX are detected, but not OCR-indexed yet. Those files show the warning: “Embedded images were not OCR-indexed yet.”

## Recursive Scanning

Nested folders are scanned inside the configured root only. The scanner:

- preserves relative paths for sources
- skips hidden/system folders
- skips `.git`, `.next`, `node_modules`, `dist`, `build`, and `coverage`
- does not follow symlinks
- refuses paths outside the configured root
- applies a max depth limit
- skips temporary Office files such as `~$deck.pptx`

## Refreshing

After adding or removing files, click **Scan / Update Document Index** on the dashboard or document settings page. The app scans the folder, extracts/OCRs only new or changed files, updates the local SQLite index, and leaves unchanged files alone.

Chat questions search the saved SQLite chunks only. If no documents are indexed, chat returns:

```text
No documents are indexed yet. Please run Scan / Update Document Index first.
```

See `docs/local-indexing.md` for the database tables and stale-index behavior.

## Git Safety

The repo keeps only small sample fixtures under `documents`. Real synced SharePoint or client files should stay local and are ignored by Git.
