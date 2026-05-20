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

For SharePoint access, create a Microsoft Entra SPA app registration with redirect URI `http://localhost:3000`, then save the Tenant ID, Client ID, Site URL, and Folder URL in the app. No client secret is required for the MSAL delegated flow.

Set `CODEX_BIN` in `.env.local` if Codex is installed somewhere the app cannot detect automatically.

## Production

The MVP does not require a production server. If a production-style local build is needed, use `.env.production` for:

- `SHAREPOINT_SITE_URL`
- `SHAREPOINT_FOLDER_PATH`
- `LOCAL_DOCUMENTS_PATH`
- `LOCAL_DOCUMENTS_RECURSIVE`
- `LOCAL_DOCUMENTS_MAX_DEPTH`
- `SHAREPOINT_CLIENT_ID`
- `SHAREPOINT_TENANT_ID`
- `SHAREPOINT_DOCUMENT_LIBRARY_NAME`
- `NEXT_PUBLIC_MSAL_CLIENT_ID`
- `NEXT_PUBLIC_MSAL_TENANT_ID`
- `NEXT_PUBLIC_MSAL_REDIRECT_URI`
- `CODEX_BIN`
- `CODEX_EXECUTION_MODE`
- `ALLOW_MOCK_DOCUMENTS`

Set `ALLOW_MOCK_DOCUMENTS=false` in production when live SharePoint access must be mandatory.
