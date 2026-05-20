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

For local development, leave credentials incomplete and keep:

```bash
ALLOW_MOCK_DOCUMENTS=true
```

The app will use direct files in the local `documents` folder.

## Stop A Running Codex Job

Use the **Stop** button in the chat progress area. The app sends a cancel request and terminates the local Codex child process with `SIGTERM`.

## Cached Answer Appears

When the same question, guardrails, selected document chunks, and active folder match a previous completed run, the app reuses the cached response and shows **Loaded from cache**.

Delete files in `artifacts/cache` to clear the local cache.
