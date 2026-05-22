# Oracle APEX Local API Integration

This project now has two local layers:

- The existing Next.js app remains the local knowledge assistant UI.
- `local_api/` is a standalone Node.js middleware service intended for Oracle APEX admin screens.

APEX should call the local middleware service. It should not call Codex directly.

## Local REST Endpoints

Default base URL:

```text
http://127.0.0.1:8010
```

Endpoints:

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/status` | Health, folder, database, index, and LLM bridge status |
| `POST` | `/api/index` | Scan/update the configured local folder |
| `GET` | `/api/files` | List indexed files and metadata |
| `POST` | `/api/search` | Search indexed local file text |
| `POST` | `/api/ask` | Retrieve relevant context and ask Codex/OpenAI/local summary |

If `LOCAL_API_ADMIN_TOKEN` is set, send it as:

```text
X-Admin-Token: your-token
```

or:

```text
Authorization: Bearer your-token
```

## Install And Start

```bash
npm run local-api:install
cp .env.example .env.local-api
npm run local-api:init-db
npm run local-api:start
```

Edit `.env.local-api` before starting:

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

Use `LOCAL_API_LLM_PROVIDER=codex` to require local Codex. Use `openai` only when you intentionally want the middleware to call the configured OpenAI-compatible endpoint. The default `auto` tries local Codex first and falls back to a local extractive answer if Codex is unavailable.

Run the validation flow:

```bash
npm run local-api:validate
```

The validation script starts the API on a temporary localhost port, indexes temporary files, checks SQLite population, searches, calls `/api/ask`, and confirms localhost reachability.

## Sample Requests

Index the configured folder:

```json
POST /api/index
{}
```

Index a specific local folder:

```json
POST /api/index
{
  "folder_path": "/Users/you/Documents/e-invoices",
  "allowed_extensions": [".pdf", ".docx", ".xlsx", ".md"],
  "force": false
}
```

Search:

```json
POST /api/search
{
  "query": "Peppol invoice validation",
  "limit": 5
}
```

Ask:

```json
POST /api/ask
{
  "question": "Which local files explain Peppol invoice validation?",
  "limit": 5
}
```

## APEX REST Data Source Setup

A complete page build kit for the admin page is available in:

```text
apex/local-codex-index-admin-install-guide.md
apex/local-codex-index-admin-page.md
apex/local-codex-index-admin-processes.sql
apex/local-codex-apex-support.sql
apex/local-codex-index-admin-components.json
```

Use the install guide first. It includes the exact Page Builder steps, SQL Workshop helper package, validation checklist, Docker/ORDS notes, network ACL troubleshooting, and OCI migration path.

In Oracle APEX:

1. Go to **Shared Components** > **REST Data Sources**.
2. Create a REST Data Source from scratch.
3. Set the base URL:
   - APEX/ORDS running directly on your machine: `http://127.0.0.1:8010`
   - APEX/ORDS running in Docker Desktop: `http://host.docker.internal:8010`
4. Add operations:
   - `GET /api/status`
   - `POST /api/index`
   - `GET /api/files`
   - `POST /api/search`
   - `POST /api/ask`
5. For POST operations, set `Content-Type` to `application/json`.
6. If `LOCAL_API_ADMIN_TOKEN` is configured, add a static request header named `X-Admin-Token`.

Recommended APEX page pattern:

- Admin-only page.
- Region for `/api/status`.
- Button to call `/api/index`.
- Interactive report over `/api/files`.
- Search item plus region calling `/api/search`.
- Question item plus response region calling `/api/ask`.

## Sample PL/SQL

Status:

```sql
declare
  l_response clob;
begin
  apex_web_service.g_request_headers.delete;
  apex_web_service.g_request_headers(1).name := 'X-Admin-Token';
  apex_web_service.g_request_headers(1).value := :P0_LOCAL_API_TOKEN;

  l_response := apex_web_service.make_rest_request(
    p_url         => 'http://127.0.0.1:8010/api/status',
    p_http_method => 'GET'
  );

  :P1_STATUS_JSON := l_response;
end;
```

Search:

```sql
declare
  l_response clob;
  l_body     clob;
begin
  l_body := json_object(
    'query' value :P1_SEARCH,
    'limit' value 5
  );

  apex_web_service.g_request_headers.delete;
  apex_web_service.g_request_headers(1).name := 'Content-Type';
  apex_web_service.g_request_headers(1).value := 'application/json';
  apex_web_service.g_request_headers(2).name := 'X-Admin-Token';
  apex_web_service.g_request_headers(2).value := :P0_LOCAL_API_TOKEN;

  l_response := apex_web_service.make_rest_request(
    p_url         => 'http://127.0.0.1:8010/api/search',
    p_http_method => 'POST',
    p_body        => l_body
  );

  :P1_SEARCH_JSON := l_response;
end;
```

Ask:

```sql
declare
  l_response clob;
  l_body     clob;
begin
  l_body := json_object(
    'question' value :P1_QUESTION,
    'limit' value 5
  );

  apex_web_service.g_request_headers.delete;
  apex_web_service.g_request_headers(1).name := 'Content-Type';
  apex_web_service.g_request_headers(1).value := 'application/json';
  apex_web_service.g_request_headers(2).name := 'X-Admin-Token';
  apex_web_service.g_request_headers(2).value := :P0_LOCAL_API_TOKEN;

  l_response := apex_web_service.make_rest_request(
    p_url         => 'http://127.0.0.1:8010/api/ask',
    p_http_method => 'POST',
    p_body        => l_body
  );

  :P1_ANSWER_JSON := l_response;
end;
```

## Docker, ORDS, And Localhost

`127.0.0.1` means "this same network namespace." If ORDS/APEX runs in Docker, `127.0.0.1` points to the container, not your Mac host.

Use this from Docker Desktop containers:

```text
http://host.docker.internal:8010
```

When a container must reach the local API, start the API on all local interfaces:

```bash
LOCAL_API_HOST=0.0.0.0 npm run local-api:start
```

Keep the admin token enabled when binding to `0.0.0.0`.

If APEX server-side calls fail:

- Check the API is running: `http://127.0.0.1:8010/api/status`.
- If ORDS is containerized, use `host.docker.internal`.
- Make sure macOS firewall allows the local Node service.
- If your Oracle database blocks outbound HTTP, configure the database network ACL for the API host and port.
- Server-side APEX calls do not need CORS. Browser-side dynamic actions do; set `LOCAL_API_CORS_ALLOW_ORIGINS` only if needed.

## Future OCI Migration

The REST contract is intentionally small so APEX can keep the same calls later.

Migration path:

- Move the Node middleware to OCI Container Instances, OKE, Functions, or Compute.
- Replace SQLite with Autonomous Database or another managed store.
- Add an OCI Object Storage file-source module beside the current local folder source.
- Put OCI API Gateway or a load balancer in front of the API.
- Replace the local admin token with OCI IAM, OAuth, or APEX credentials.
- Update only the APEX REST Data Source base URL and authentication.

No SharePoint or OCI service is required for the local setup.
