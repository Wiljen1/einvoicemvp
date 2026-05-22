# Knowledge Assistant MVP

## Direction Update

The intended target is now APEX-first: Oracle APEX + Autonomous Database should be the main backend, admin UI, analytics, governance, configuration, reporting, audit, and ORDS API layer. Custom Node code should stay limited to the small Slack runtime and future Codex runner orchestration.

Start with `docs/apex-first-architecture.md` for the corrected architecture. The existing Next.js admin and `local_api` middleware are transitional prototype pieces and should not be expanded as duplicate admin/backend systems.

For direct Codex work in the authenticated Oracle APEX Builder session, use the Chrome-backed connection in `docs/apex-codex-chrome-connection.md`. It attaches to the existing debug Chrome profile on `127.0.0.1:9222`, reuses Oracle SSO, and can run SQL through APEX SQL Workshop without storing credentials.

For the no-browser deployment target, use `docs/apex-direct-deploy-workflow.md`. REST Enabled SQL is enabled for the hosted workspace schema and can deploy schema SQL once an approved local secret is configured; SQLcl direct import/export still requires approved database connectivity.

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

## Oracle APEX Local Middleware

Deprecated direction: the `local_api/` middleware was created as a local bridge for an APEX admin page, but the corrected architecture moves backend/admin/governance ownership into APEX/Autonomous Database. Keep this middleware only as a temporary harness while designing APEX/ORDS APIs.

The intended production shape is Slack runtime -> APEX/ORDS APIs -> future Codex runner, with APEX as the system of record.

Install and start the local API:

```bash
npm run local-api:install
cp .env.example .env.local-api
npm run local-api:init-db
npm run local-api:start
```

Default API URL:

```text
http://127.0.0.1:8010
```

APEX-facing endpoints:

- `GET /api/status`
- `POST /api/index`
- `GET /api/files`
- `POST /api/search`
- `POST /api/ask`

Configure the indexed folder and local API in `.env.local-api`:

```bash
LOCAL_API_HOST=127.0.0.1
LOCAL_API_PORT=8010
LOCAL_API_DOCUMENT_ROOT=./documents
LOCAL_API_DATABASE_PATH=./data/apex-middleware.sqlite
LOCAL_API_ALLOWED_EXTENSIONS=.txt,.md,.markdown,.csv,.json,.pdf,.docx,.xlsx,.pptx,.url
LOCAL_API_ADMIN_TOKEN=
LOCAL_API_LLM_PROVIDER=auto
CODEX_BIN=codex
OPENAI_API_KEY=
OPENAI_BASE_URL=
OPENAI_MODEL=gpt-4.1-mini
```

`LOCAL_API_LLM_PROVIDER=auto` tries the local Codex CLI first and falls back to a local extractive answer if Codex is unavailable. Use `codex` to require Codex, or `openai` to call the configured OpenAI-compatible endpoint.

Validate the complete local REST flow:

```bash
npm run local-api:validate
```

Oracle APEX REST Data Source setup:

- Base URL for local ORDS/APEX: `http://127.0.0.1:8010`
- Base URL when ORDS/APEX runs in Docker Desktop: `http://host.docker.internal:8010`
- Add `Content-Type: application/json` for POST operations.
- If `LOCAL_API_ADMIN_TOKEN` is set, add header `X-Admin-Token`.

Sample APEX PL/SQL:

```sql
declare
  l_response clob;
begin
  apex_web_service.g_request_headers.delete;
  apex_web_service.g_request_headers(1).name := 'Content-Type';
  apex_web_service.g_request_headers(1).value := 'application/json';
  apex_web_service.g_request_headers(2).name := 'X-Admin-Token';
  apex_web_service.g_request_headers(2).value := :P0_LOCAL_API_TOKEN;

  l_response := apex_web_service.make_rest_request(
    p_url         => 'http://127.0.0.1:8010/api/ask',
    p_http_method => 'POST',
    p_body        => json_object('question' value :P1_QUESTION, 'limit' value 5)
  );

  :P1_ANSWER_JSON := l_response;
end;
```

Troubleshooting:

- `127.0.0.1` works only when APEX/ORDS and the API run in the same host context.
- From Docker Desktop, use `host.docker.internal:8010`.
- If a container must call the API, start it with `LOCAL_API_HOST=0.0.0.0` and set `LOCAL_API_ADMIN_TOKEN`.
- If `APEX_WEB_SERVICE.MAKE_REST_REQUEST` fails, check Oracle network ACLs, ORDS container networking, macOS firewall, and whether the API is actually listening on the expected port.
- Browser-side APEX calls may need `LOCAL_API_CORS_ALLOW_ORIGINS`; server-side PL/SQL calls do not.

Future OCI migration:

- Keep the same APEX REST operations and move the Node middleware behind OCI API Gateway, Container Instances, OKE, Functions, or Compute.
- Replace SQLite with Autonomous Database or another managed database.
- Add OCI Object Storage as another file-source module while keeping the local folder source.
- Replace the local admin token with OCI IAM, OAuth, or APEX credentials.

See `docs/apex-local-api.md` for the full APEX setup guide.
The admin page install pack starts at `apex/local-codex-index-admin-install-guide.md`; it includes the page kit, PL/SQL processes, SQL Workshop helper package, network ACL example, and component manifest.

## Local Oracle APEX Runtime

The downloaded APEX bundle at `$HOME/Downloads/apex-latest/apex` is Oracle APEX 26.1. It contains the database installer scripts and APEX static images, but it is not a standalone local server. A local APEX runtime also needs Oracle Database, ORDS, Java, and SQLcl or SQL*Plus.

Check local readiness:

```bash
npm run local-apex:check
```

Open, start, or stop the installed local stack:

```bash
npm run local-apex:open
npm run local-apex:start
npm run local-apex:stop
```

These commands start/stop the local Oracle Database/APEX/ORDS developer environment only. They do not start the deprecated local middleware.

Local desktop launch notes are in `docs/local-apex-desktop.md`. Local install notes are in `docs/local-apex-install.md`. The recommended local-first route is Docker/Colima with the full Oracle Database Free ARM64 image, APEX installed from the downloaded bundle, and ORDS standalone on port `8181`.

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
