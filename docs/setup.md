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

Leave SharePoint values empty for mock-folder development, or configure them in the website at `/settings/sharepoint`.

Set `CODEX_BIN` in `.env.local` if Codex is installed somewhere the app cannot detect automatically.

## Production

The MVP does not require a production server. If a production-style local build is needed, use `.env.production` for:

- `SHAREPOINT_SITE_URL`
- `SHAREPOINT_FOLDER_PATH`
- `SHAREPOINT_CLIENT_ID`
- `SHAREPOINT_TENANT_ID`
- `SHAREPOINT_CLIENT_SECRET`
- `SHAREPOINT_DOCUMENT_LIBRARY_NAME`
- `CODEX_BIN`
- `CODEX_EXECUTION_MODE`
- `ALLOW_MOCK_DOCUMENTS`

Set `ALLOW_MOCK_DOCUMENTS=false` in production when live SharePoint access must be mandatory.
