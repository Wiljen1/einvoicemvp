# Knowledge Assistant MVP

Lightweight local web app for an approved-source knowledge assistant. It runs on each colleague's machine, uses that machine's local Codex installation, and searches only the active local document source.

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
ENABLE_LOCAL_OCR=true
OCR_LANGUAGE=eng
OCR_MAX_FILE_SIZE_MB=50
AUTO_INDEX_ON_STARTUP=true
INDEX_DATABASE_PATH=
LOG_CHAT_HISTORY=true
ENABLE_MSAL_SHAREPOINT=false
CODEX_ENABLE_SEARCH=false
```

Indexed text is stored in a local SQLite database under `data/knowledge-index.sqlite` by default. OCR and file extraction run during indexing only; chat questions search saved database chunks and do not rescan or OCR documents.

## Question History And Reuse

When `LOG_CHAT_HISTORY=true`, the app stores questions, answers, confidence, sources, response time, cache-hit status, and active source metadata in SQLite. Before calling Codex, the app checks previous questions for the same active source.

Previous answers are reused only when:

- the question is an exact or high-similarity match
- the active document source is unchanged
- the document index has not changed since the prior answer
- referenced source documents are still active
- the prior answer was not low confidence

Main chat clearly marks reused answers and offers **Run fresh search**. Admins can clear local question history from `/admin`.

## Admin

Open `/admin` for:

- protected and additional guardrails
- prompt structure preview
- question history
- analytics and trend cards
- document index overview
- local privacy/settings notes

No admin authentication is enabled in this local MVP. Add authentication before using the admin area in a shared environment.

## Codex Setup

The app detects local Codex in this order:

1. `CODEX_BIN` in `.env.local`
2. macOS: `/Applications/Codex.app/Contents/Resources/codex`
3. Windows common install paths under `%LOCALAPPDATA%`, `%PROGRAMFILES%`, and `%PROGRAMFILES(X86)%`
4. `codex` from the system path

`CODEX_ENABLE_SEARCH=false` is the default so local Codex does not receive the internet search flag.

## Supported Files

- `.txt`
- `.md` / `.markdown`
- `.json`
- `.csv`
- text-based `.pdf`
- `.docx`
- `.pptx`
- `.xlsx`
- `.png`
- `.jpg` / `.jpeg`
- `.mp4`
- `.url`

## Scripts

```bash
npm run dev
npm run build
npm run test
npm run lint
npm run typecheck
```

See also:

- `docs/admin.md`
- `docs/question-history.md`
- `docs/answer-reuse.md`
- `docs/guardrails.md`
- `docs/analytics.md`
- `docs/local-indexing.md`
- `docs/testing.md`
- `docs/synced-sharepoint-folder.md`
- `docs/ocr-limitations.md`
- `docs/future-sharepoint-integration.md`
- `docs/troubleshooting.md`
