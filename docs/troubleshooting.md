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

## SharePoint Not Connected

Open `/settings/sharepoint`, check the configured folder, and use **Test Connection**.

If the app says Microsoft sign-in is required, click **Sign in with Microsoft**. A normal SharePoint browser session is not enough; the app needs its own delegated Graph token through MSAL.

If access is denied, confirm:

- the user can access the configured folder in SharePoint
- the Entra app has delegated `User.Read`, `Files.Read.All`, and `Sites.Read.All`
- tenant admin consent has been granted if required
- the redirect URI is `http://localhost:3000`

For local document development, leave SharePoint Tenant ID or Client ID incomplete and keep:

```bash
ALLOW_MOCK_DOCUMENTS=true
```

The app will use direct files in the local `documents` folder.

## Local Documents Not Showing

Check the **Document Source** card on the dashboard. It shows the resolved folder path, indexed file count, skipped file count, and last indexed time.

Supported local MVP file types are `.txt`, `.md`, `.json`, `.csv`, and text-based `.pdf`. Scanned PDFs, Office files, symbolic links, hidden/system folders, and oversized files are skipped with a visible reason. Add readable files directly to the shown folder or nested subfolders, then click **Refresh Documents**.

Set `LOCAL_DOCUMENTS_PATH=/absolute/path/to/documents` in `.env.local` to use a different approved local folder.

## Stop A Running Codex Job

Use the **Stop** button in the chat progress area. The app sends a cancel request and terminates the local Codex child process with `SIGTERM`.

## Cached Answer Appears

When the same question, guardrails, selected document chunks, and active folder match a previous completed run, the app reuses the cached response and shows **Loaded from cache**.

Delete files in `artifacts/cache` to clear the local cache.
