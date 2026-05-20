# E-Invoice MVP

Lightweight local web app for an approved-source e-invoicing chatbot. It runs on each colleague's machine, uses that machine's local Codex installation, and searches only the active local document source.

No paid hosting, centralized production server, cloud Codex API, or paid GPT API is required for the MVP.

## Clone And Run

```bash
git clone https://github.com/Wiljen1/einvoicemvp.git
cd einvoicemvp
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

## Local Sharing Model

- Code lives in GitHub repo `einvoicemvp`.
- Colleagues clone the repo locally.
- Each colleague runs the app on their own machine.
- Each colleague uses their own local Codex app or CLI.
- Each colleague chooses an approved local document source.
- No GitHub Codespaces, paid hosting, paid cloud AI API, centralized server, or complex Docker setup is required.

## Document Sources

Open `/settings/documents` to choose the active source:

- **Local Folder**: reads a configured local folder.
- **Synced SharePoint Folder**: reads a SharePoint folder that the user has synced locally with OneDrive.
- **Manual Upload**: stores demo documents under `uploaded-documents`.

The app does not currently read SharePoint directly through Microsoft Graph. That future path requires an admin-approved Entra app registration; see `docs/future-sharepoint-integration.md`.

Default local config:

```bash
DOCUMENT_SOURCE_MODE=LOCAL_FOLDER
LOCAL_DOCUMENTS_PATH=./documents
SYNCED_SHAREPOINT_FOLDER_PATH=
LOCAL_DOCUMENTS_RECURSIVE=true
LOCAL_DOCUMENTS_MAX_DEPTH=10
ENABLE_MSAL_SHAREPOINT=false
```

The dashboard shows the active source, resolved folder path, indexed file count, skipped file count, supported file types, and last indexed time. Use **Refresh Documents** after adding or removing files.

Supported MVP files:

- `.txt`
- `.md` / `.markdown`
- `.json`
- `.csv`
- text-based `.pdf`
- `.pptx`
- `.xlsx`
- `.png`
- `.mp4`
- `.url`

PPTX slide text and speaker notes are extracted when available. XLSX sheet names and cell text are extracted. PNG, MP4, and URL shortcut files are indexed as searchable assets, and MP4 files link nearby `.txt` or `.vtt` transcripts. Scanned PDFs are skipped without OCR. DOCX extraction is future work.

## Codex Setup

The app detects local Codex in this order:

1. `CODEX_BIN` in `.env.local`
2. macOS: `/Applications/Codex.app/Contents/Resources/codex`
3. Windows common install paths under `%LOCALAPPDATA%`, `%PROGRAMFILES%`, and `%PROGRAMFILES(X86)%`
4. `codex` from the system path

To set it manually:

```bash
CODEX_BIN=/Applications/Codex.app/Contents/Resources/codex
```

Windows example:

```bash
CODEX_BIN=C:\Users\you\AppData\Local\Programs\Codex\codex.exe
```

The health check runs `codex --version`. If Codex is not found, the dashboard shows setup help.

## Chat Behavior

- Shows progress while processing.
- Lets the user stop a running local Codex job.
- Caches completed answers in `artifacts/cache`.
- Writes local Codex prompt/output artifacts to `artifacts/codex-operators`.
- Answers only from active approved document context.
- Applies fixed safety guardrails plus additive user guardrails.
- Refuses unsupported questions with the configured fallback message.

## Scripts

```bash
npm run dev
npm run build
npm run test
npm run lint
npm run typecheck
```

See also:

- `docs/local-sharing.md`
- `docs/codex-detection.md`
- `docs/local-documents.md`
- `docs/sharepoint-setup.md`
- `docs/future-sharepoint-integration.md`
- `docs/troubleshooting.md`
- `docs/manual-test-checklist.md`
