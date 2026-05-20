# Setup

## Local

```bash
git clone https://github.com/Wiljen1/einvoicemvp.git
cd einvoicemvp
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

Use `/settings/documents` to choose the active document source:

- `LOCAL_FOLDER`
- `SYNCED_SHAREPOINT_FOLDER`
- `MANUAL_UPLOAD`

Set `CODEX_BIN` in `.env.local` if Codex is installed somewhere the app cannot detect automatically.

## Document Environment Values

```bash
DOCUMENT_SOURCE_MODE=LOCAL_FOLDER
LOCAL_DOCUMENTS_PATH=./documents
SYNCED_SHAREPOINT_FOLDER_PATH=
LOCAL_DOCUMENTS_RECURSIVE=true
LOCAL_DOCUMENTS_MAX_DEPTH=10
MAX_TEXT_EXTRACTION_FILE_SIZE_MB=100
MAX_VIDEO_METADATA_FILE_SIZE_MB=500
ENABLE_MSAL_SHAREPOINT=false
```

`ENABLE_MSAL_SHAREPOINT=false` is intentional for this MVP. Direct Graph access needs admin-approved Microsoft setup and is documented as future work.

## Production-Style Local Build

The MVP does not require a production server. If a production-style local build is needed, use `.env.production` with the same local document and Codex settings above.
