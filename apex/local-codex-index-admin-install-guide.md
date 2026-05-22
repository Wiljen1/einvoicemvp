# Local Codex Index Admin Installation Guide

This guide completes the Oracle APEX setup for the local Node.js middleware.

The setup remains fully local-first:

- No SharePoint.
- No OCI requirement.
- SQLite stays in the local middleware.
- APEX calls the local REST API through `APEX_WEB_SERVICE.MAKE_REST_REQUEST`.
- The page is intended for admin-only use.

## Generated Files

| File | Purpose |
| --- | --- |
| `apex/local-codex-index-admin-page.md` | Page layout, items, reports, buttons, and dynamic action setup |
| `apex/local-codex-index-admin-processes.sql` | Copy-paste APEX page processes using `APEX_WEB_SERVICE.MAKE_REST_REQUEST` |
| `apex/local-codex-apex-support.sql` | Optional SQL Workshop-installable helper package |
| `apex/local-codex-network-acl-example.sql` | Optional DBA network ACL example |
| `apex/local-codex-index-admin-components.json` | Machine-readable page/component manifest |
| `apex/local-codex-apex-export-notes.md` | Why direct page export is target-specific and how to generate it after first build |

## 1. Start And Validate The Local Middleware

From the project root:

```bash
npm run local-api:start
```

In another terminal:

```bash
curl http://127.0.0.1:8010/api/status
curl -X POST http://127.0.0.1:8010/api/index -H 'Content-Type: application/json' -d '{}'
curl -X POST http://127.0.0.1:8010/api/ask -H 'Content-Type: application/json' -d '{"question":"What files are indexed?"}'
```

Expected result:

- `/api/status` returns JSON with `"ok": true`.
- `/api/index` returns an indexing run JSON payload.
- `/api/ask` returns JSON with `answer` and `sources`.

## 2. Decide The APEX Base URL

Use this when APEX/ORDS and the browser/server are running directly on the same machine:

```text
http://127.0.0.1:8010
```

Use this when APEX/ORDS runs inside Docker Desktop:

```text
http://host.docker.internal:8010
```

The APEX page item `P1_API_BASE_URL` stores this value, so you can switch without changing code.

## 3. Optional SQL Workshop Install

In APEX SQL Workshop > SQL Scripts:

1. Upload or paste `apex/local-codex-apex-support.sql`.
2. Run it in the APEX parsing schema.
3. Confirm the package `LOCAL_CODEX_APEX` compiles.

This helper package is optional. The page process file also contains standalone process blocks that do not require the package.

Quick SQL Workshop validation:

```sql
select dbms_lob.substr(
         local_codex_apex.get_status('http://127.0.0.1:8010'),
         4000,
         1
       ) as status_json
from dual;
```

If ORDS/APEX runs in Docker Desktop, use `http://host.docker.internal:8010` in that call.

## 4. Create Admin Authorization

In Shared Components > Security > Authorization Schemes:

- Name: `Admin Only`
- Type: PL/SQL Function Body
- Source:

```sql
return apex_util.current_user_in_group('ADMINISTRATORS')
   or apex_util.current_user_in_group('ADMIN');
```

Use your real admin group names if they differ.

## 5. Create The Page

In Page Builder:

1. Create a new blank page.
2. Name it `Local Codex Index Admin`.
3. Apply the `Admin Only` authorization scheme.
4. Use page number `1` if available. If not, replace all `P1_...` names in the scripts with your page number.

Create page items:

- `P1_API_BASE_URL`
- `P1_ADMIN_TOKEN`
- `P1_STATUS_SUMMARY`
- `P1_STATUS_JSON`
- `P1_INDEX_RESULT`
- `P1_SEARCH`
- `P1_SEARCH_JSON`
- `P1_QUESTION`
- `P1_RESPONSE`
- `P1_ERROR`

Set `P1_API_BASE_URL` default to:

```text
http://127.0.0.1:8010
```

## 6. Create Regions And Reports

Create static regions:

- `Settings`
- `Status`
- `Index`
- `Search`
- `Ask`
- `Errors`

Create report region `API Status` with SQL:

```sql
select
  seq_id,
  c001 as metric,
  c002 as value,
  c003 as detail
from apex_collections
where collection_name = 'LOCAL_CODEX_STATUS'
order by seq_id
```

Create report region `Indexed Files` with SQL:

```sql
select
  seq_id,
  c001 as relative_path,
  c002 as file_name,
  c003 as extension,
  c004 as index_status,
  n001 as size_bytes,
  c005 as modified_at,
  c006 as file_path,
  c007 as error_message
from apex_collections
where collection_name = 'LOCAL_CODEX_FILES'
order by c001
```

Create report region `Search Results` with SQL:

```sql
select
  seq_id,
  c001 as relative_path,
  c002 as file_name,
  c003 as extension,
  n001 as score,
  c004 as snippet,
  c005 as file_path
from apex_collections
where collection_name = 'LOCAL_CODEX_SEARCH_RESULTS'
order by n001 desc nulls last, seq_id
```

## 7. Create Buttons

Create submit buttons:

- `STATUS`
- `RUN_INDEX`
- `SEARCH`
- `ASK`

## 8. Create Page Processes

Open `apex/local-codex-index-admin-processes.sql`.

Create these APEX page processes:

| Process | Process Point | Server-side condition |
| --- | --- | --- |
| `GET_STATUS` | Before Header | Always |
| `GET_FILES` | Before Header | Always |
| `RUN_INDEX` | Processing | When Button Pressed = `RUN_INDEX` |
| `RUN_SEARCH` | Processing | When Button Pressed = `SEARCH` |
| `RUN_ASK` | Processing | When Button Pressed = `ASK` |

Paste only the `declare ... end;` block for each process into APEX. Do not paste the trailing `/` separator.

The POST processes set:

```text
Content-Type: application/json
```

If `P1_ADMIN_TOKEN` has a value, the processes also set:

```text
X-Admin-Token: <P1_ADMIN_TOKEN>
```

## 9. Add Dynamic Actions

Optional, useful dynamic actions:

| Name | Event | Selection | True Action |
| --- | --- | --- | --- |
| `CLEAR_ERROR_ON_SEARCH` | Change | `P1_SEARCH` | Set Value: `P1_ERROR = null` |
| `CLEAR_ERROR_ON_QUESTION` | Change | `P1_QUESTION` | Set Value: `P1_ERROR = null` |
| `CLEAR_ERROR_ON_BASE_URL` | Change | `P1_API_BASE_URL` | Set Value: `P1_ERROR = null` |

For the first local version, keep `STATUS`, `RUN_INDEX`, `SEARCH`, and `ASK` as submit buttons. The reports refresh after submit because the page reloads and the collections are rebuilt.

## 10. Validate In APEX

1. Open the page.
2. Confirm `P1_API_BASE_URL` is correct.
3. Press `STATUS`.
4. Confirm the API Status report shows service, database, folder, active files, latest index run, and LLM provider.
5. Press `RUN_INDEX`.
6. Confirm the Indexed Files report populates.
7. Enter text in `P1_SEARCH` and press `SEARCH`.
8. Confirm Search Results populates.
9. Enter a question in `P1_QUESTION` and press `ASK`.
10. Confirm `P1_RESPONSE` displays the returned answer.

Errors are displayed in `P1_ERROR` and in the APEX inline notification area.

## Export / Import Artifact

A direct executable APEX page export is not safely generated from this repo alone because APEX exports contain target-specific internal IDs: application ID, workspace security group ID, parsing schema, theme/template IDs, and APEX version-specific `wwv_flow_imp_page` calls.

Use this generated component manifest as the stable source of truth:

```text
apex/local-codex-index-admin-components.json
```

After building the page once in the target APEX app, export the page from APEX Builder. That exported SQL file becomes the production-safe page import artifact for the same APEX version and theme family.

See:

```text
apex/local-codex-apex-export-notes.md
```

## Troubleshooting

### ORDS In Docker

If ORDS/APEX runs in Docker Desktop, `127.0.0.1` points to the container, not the Mac host.

Use:

```text
http://host.docker.internal:8010
```

If needed, start the local middleware with:

```bash
LOCAL_API_HOST=0.0.0.0 npm run local-api:start
```

Set `LOCAL_API_ADMIN_TOKEN` when binding to `0.0.0.0`.

### Network ACL Issues

If you see `ORA-24247: network access denied by access control list`, a DBA must grant outbound HTTP access from the APEX parsing schema to the local host and port.

Use `apex/local-codex-network-acl-example.sql` as a DBA starting point.

### Localhost Connectivity

Test from the machine running the database/ORDS, not only from your browser:

```bash
curl http://127.0.0.1:8010/api/status
curl http://host.docker.internal:8010/api/status
```

If one works and the other does not, update `P1_API_BASE_URL`.

### CORS

`APEX_WEB_SERVICE.MAKE_REST_REQUEST` is server-side PL/SQL and does not require CORS.

CORS matters only if you later call the local API directly from browser JavaScript. In that case configure:

```bash
LOCAL_API_CORS_ALLOW_ORIGINS=<your-apex-origin>
```

## Startup Checklist

1. Start local API: `npm run local-api:start`.
2. Validate local endpoints: `/api/status`, `/api/index`, `/api/ask`.
3. Open APEX page `Local Codex Index Admin`.
4. Set `P1_API_BASE_URL`.
5. Press `STATUS`.
6. Press `RUN_INDEX`.
7. Review Indexed Files.
8. Run `SEARCH`.
9. Run `ASK`.

## OCI Migration Readiness

Keep the APEX page pointed at `P1_API_BASE_URL`. Later, replace the local URL with an OCI API Gateway, load balancer, or service URL.

Recommended future migration path:

- Move the Node middleware to OCI Compute, Container Instances, OKE, or Functions.
- Replace the local SQLite DB with Autonomous Database or another managed persistence layer.
- Keep `/api/status`, `/api/index`, `/api/files`, `/api/search`, and `/api/ask` stable.
- Replace `X-Admin-Token` with OAuth, OCI IAM, or APEX credentials.
- Add OCI Object Storage as another modular file source.

The APEX page should not need structural changes if the REST contract stays stable.
