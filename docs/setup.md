# Setup

## Local

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env.local`.
3. Leave SharePoint values empty for mock-folder development, or configure them in the website at `/settings/sharepoint`.
4. Start the app with `npm run dev`.
5. Open `http://localhost:3000`.

## Production

Use `.env.production` or the hosting provider's server-side secret store for:

- `SHAREPOINT_SITE_URL`
- `SHAREPOINT_FOLDER_PATH`
- `SHAREPOINT_CLIENT_ID`
- `SHAREPOINT_TENANT_ID`
- `SHAREPOINT_CLIENT_SECRET`
- `SHAREPOINT_DOCUMENT_LIBRARY_NAME`
- `CODEX_COMMAND`
- `CODEX_EXECUTION_MODE`
- `ALLOW_MOCK_DOCUMENTS`

Set `ALLOW_MOCK_DOCUMENTS=false` in production when live SharePoint access must be mandatory.
