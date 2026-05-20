# Local Documents

Local document mode is for no-cost MVP testing and colleague demos when SharePoint is not configured.

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

Scanned PDFs are skipped because OCR is not included yet. DOCX, PPTX, and XLSX extraction are TODOs.

## Recursive Scanning

Nested folders are scanned inside the configured root only. The scanner:

- preserves relative paths for sources
- skips hidden/system folders
- skips `.git`, `.next`, `node_modules`, `dist`, `build`, and `coverage`
- does not follow symlinks
- refuses paths outside the configured root
- applies a max depth limit

## Refreshing

After adding or removing files, click **Refresh Documents** on the dashboard. The app clears the previous local index and rebuilds it without restarting.

## Git Safety

The repo keeps only small sample fixtures under `documents`. Real synced SharePoint or client files should stay local and are ignored by Git.
