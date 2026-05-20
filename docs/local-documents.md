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
```

The dashboard shows the resolved absolute folder path, indexed file count, skipped file count, supported file types, and last indexed time.

## Supported Files

The MVP indexes:

- `.txt`
- `.md`
- `.markdown`
- `.json`
- `.csv`
- text-based `.pdf`
- `.pptx`
- `.xlsx`
- `.png`
- `.mp4`
- `.url`

PPTX extracts slide text and speaker notes when available. XLSX extracts sheet names and non-empty cell text. PNG and MP4 files are indexed as searchable assets; MP4 files link nearby `.txt` or `.vtt` transcripts when present. URL shortcut files index the target URL and filename.

Scanned PDFs are skipped because OCR is not included yet. DOCX extraction is future work.

## Indexing Modes

- `FULL_TEXT`: searchable text was extracted.
- `TRANSCRIPT_LINKED`: a video was indexed with a nearby transcript.
- `PARTIAL_METADATA`: filename, folder, and useful metadata were indexed.

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

After adding or removing files, click **Refresh Documents** on the dashboard. The app clears the previous local index and rebuilds it without restarting.

## Git Safety

The repo keeps only small sample fixtures under `documents`. Real synced SharePoint or client files should stay local and are ignored by Git.
