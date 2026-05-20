# E-Invoice MVP

Lightweight local web app for an approved-source e-invoicing chatbot. It runs on each colleague's machine, uses that machine's local Codex installation, and searches only the configured SharePoint folder or the approved local mock `documents` folder.

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
- Each colleague connects to the approved SharePoint folder.
- No GitHub Codespaces, paid hosting, paid cloud AI API, centralized server, or complex Docker setup is required.

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

## SharePoint Setup

Open `/settings/sharepoint` and enter:

- SharePoint Site URL
- SharePoint Folder URL or Folder Path
- Tenant ID
- Client ID
- Client Secret
- Optional Document Library Name

Secrets are stored only server-side in `config/sharepoint.config.json`, which is ignored by Git. The browser only receives masked secret status.

## Mock Documents

If SharePoint credentials are incomplete and `ALLOW_MOCK_DOCUMENTS=true`, the app uses direct files in the local `documents` folder. Nested folders are ignored.

## Chat Behavior

- Shows progress while processing.
- Lets the user stop a running local Codex job.
- Caches completed answers in `artifacts/cache`.
- Writes local Codex prompt/output artifacts to `artifacts/codex-operators`.
- Answers only from approved SharePoint/mock document context.
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
- `docs/sharepoint-setup.md`
- `docs/troubleshooting.md`
