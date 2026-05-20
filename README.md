# E-Invoice MVP

Lightweight local web app for an approved-source e-invoicing chatbot. It uses a local Codex availability check, editable guardrails, and an approved SharePoint folder or local mock folder for document search.

## Quick Start

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

## What It Does

- Shows Codex status, SharePoint connection status, and the active approved folder.
- Lets an admin edit guardrails from the dashboard.
- Lets an admin configure and test SharePoint settings at `/settings/sharepoint`.
- Searches only the configured SharePoint folder, or the approved local `documents` fallback when SharePoint credentials are incomplete.
- Refuses unsupported questions with the configured fallback message.
- Returns answer text, confidence, source references, and the answer engine mode.

## Scripts

```bash
npm run dev
npm run build
npm run test
npm run lint
npm run typecheck
```

## MVP Notes

Codex execution is separated into detection and execution. The default answer engine is a clearly marked local placeholder (`CODEX_EXECUTION_MODE=placeholder`) so the app can ship and be tested safely. Real Codex CLI execution can be enabled later behind the same service boundary.

SharePoint settings are saved server-side to `config/sharepoint.config.json`, which is ignored by Git because it can contain secrets. The frontend only receives masked secret status.
