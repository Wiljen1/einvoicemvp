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

If you are already logged in to SharePoint in your browser, the local app still cannot reuse those browser cookies. Sync the approved SharePoint folder with OneDrive and paste the local synced folder path in `/settings/sharepoint`, or configure app credentials.

For local development without a SharePoint source, leave credentials incomplete and keep:

```bash
ALLOW_MOCK_DOCUMENTS=true
```

The app will use direct files in the local `documents` folder when no SharePoint folder is selected.

## Stop A Running Codex Job

Use the **Stop** button in the chat progress area. The app sends a cancel request and terminates the local Codex child process with `SIGTERM`.

## Cached Answer Appears

When the same question, guardrails, selected document chunks, and active folder match a previous completed run, the app reuses the cached response and shows **Loaded from cache**.

Delete files in `artifacts/cache` to clear the local cache.
