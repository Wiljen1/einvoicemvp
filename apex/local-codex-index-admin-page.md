# Local Codex Index Admin

This is the Oracle APEX page build kit for an admin-only page that talks to the local Node.js middleware.

Default local API base URL:

```text
http://127.0.0.1:8010
```

Use this when APEX/ORDS runs in Docker Desktop:

```text
http://host.docker.internal:8010
```

## Page

Create page:

- Page name: `Local Codex Index Admin`
- Page mode: Normal
- Access: admin-only authorization scheme
- Suggested page number: `1`, because the requested items are named `P1_QUESTION` and `P1_RESPONSE`

If page `1` already exists, create a different page and rename every `P1_...` item in the SQL file to match the actual page number.

Example authorization scheme:

- Name: `Admin Only`
- Type: PL/SQL Function Body
- Source:

```sql
return apex_util.current_user_in_group('ADMINISTRATORS')
   or apex_util.current_user_in_group('ADMIN');
```

## Items

Create these page items:

| Item | Type | Region | Notes |
| --- | --- | --- | --- |
| `P1_API_BASE_URL` | Text Field | Settings | Default `http://127.0.0.1:8010`; use `http://host.docker.internal:8010` for Docker |
| `P1_ADMIN_TOKEN` | Password | Settings | Optional; only needed when `LOCAL_API_ADMIN_TOKEN` is set |
| `P1_STATUS_SUMMARY` | Display Only | Status | Human-readable status |
| `P1_STATUS_JSON` | Textarea | Status | Raw status JSON for debugging |
| `P1_INDEX_RESULT` | Textarea | Index | Raw index run response |
| `P1_SEARCH` | Text Field | Search | Search input |
| `P1_SEARCH_JSON` | Textarea | Search | Raw search JSON for debugging |
| `P1_QUESTION` | Textarea | Ask | Question input |
| `P1_RESPONSE` | Textarea or Display Only | Ask | Answer/result output |
| `P1_ERROR` | Textarea or Display Only | Errors | Error details |

Recommended item settings:

- `P1_STATUS_JSON`, `P1_INDEX_RESULT`, `P1_SEARCH_JSON`, `P1_RESPONSE`, and `P1_ERROR`: width `100%`, rows `6` to `12`.
- `P1_ERROR`: hide by default if you prefer, but keep it on the page while testing local connectivity.
- `P1_API_BASE_URL`: default value `http://127.0.0.1:8010`.

## Regions

Create these regions:

1. `Settings`
   - Contains `P1_API_BASE_URL` and optional `P1_ADMIN_TOKEN`.
2. `Status`
   - Contains `P1_STATUS_SUMMARY` and `P1_STATUS_JSON`.
   - Calls `GET /api/status` through the `GET_STATUS` process.
   - Add a Classic Report for API status values:

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

3. `Index`
   - Contains `P1_INDEX_RESULT`.
   - Button `RUN_INDEX` calls `POST /api/index`.
4. `Indexed Files`
   - Classic Report or Interactive Report.
   - SQL source:

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

5. `Search`
   - Contains `P1_SEARCH`, `P1_SEARCH_JSON`, and button `SEARCH`.
   - Add a Classic Report or Interactive Report for search results:

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

6. `Ask`
   - Contains `P1_QUESTION`, button `ASK`, and `P1_RESPONSE`.
7. `Errors`
   - Contains `P1_ERROR`.

## Buttons

Create these buttons:

| Button | Label | Action |
| --- | --- | --- |
| `STATUS` | Status | Submit page |
| `RUN_INDEX` | Run Index | Submit page |
| `SEARCH` | Search | Submit page |
| `ASK` | Ask | Submit page |

## Processes

Use the process blocks in:

```text
apex/local-codex-index-admin-processes.sql
```

Recommended process points:

| Process | Point | Server-side condition |
| --- | --- | --- |
| `GET_STATUS` | Before Header or After Submit | Always, or button `STATUS` |
| `GET_FILES` | Before Header or After Submit | Always, and after button `RUN_INDEX` |
| `RUN_INDEX` | Processing | When button pressed `RUN_INDEX` |
| `RUN_SEARCH` | Processing | When button pressed `SEARCH` |
| `RUN_ASK` | Processing | When button pressed `ASK` |

Simple setup:

- Add `GET_STATUS` and `GET_FILES` as **Before Header** processes so the page loads with current data.
- Add `RUN_INDEX`, `RUN_SEARCH`, and `RUN_ASK` as **Processing** processes with matching button conditions.
- On `RUN_INDEX`, branch back to the same page so `GET_STATUS` and `GET_FILES` refresh.
- When pasting into an APEX process Source field, paste the `declare ... end;` block only. Do not include the trailing `/` separator.

## Dynamic Actions

The simplest local-first setup uses submit buttons and page processes. Add these dynamic actions only if you want the page to feel more responsive:

| Dynamic Action | Event | Selection | True Action |
| --- | --- | --- | --- |
| `CLEAR_ERROR_ON_SEARCH` | Change | `P1_SEARCH` | Set Value: `P1_ERROR = null` |
| `CLEAR_ERROR_ON_QUESTION` | Change | `P1_QUESTION` | Set Value: `P1_ERROR = null` |
| `CLEAR_ERROR_ON_BASE_URL` | Change | `P1_API_BASE_URL` | Set Value: `P1_ERROR = null` |

If you later convert the submit processes to AJAX callbacks, add region refresh actions for `API Status`, `Indexed Files`, and `Search Results` after the matching callback succeeds.

## REST Data Sources

You can also create REST Data Sources instead of PL/SQL for the GET endpoints:

| Name | Method | URL Pattern | Row Selector |
| --- | --- | --- | --- |
| `LOCAL_CODEX_STATUS` | GET | `/api/status` | leave blank |
| `LOCAL_CODEX_FILES` | GET | `/api/files` | `files` |

Base URL:

```text
http://127.0.0.1:8010
```

For Docker Desktop ORDS/APEX:

```text
http://host.docker.internal:8010
```

For POST actions, the PL/SQL processes are usually simpler because they build JSON from page items.

## Local Connectivity Checklist

- Start the middleware first: `npm run local-api:start`.
- Open `http://127.0.0.1:8010/api/status` from the same host.
- If ORDS/APEX runs in Docker, set `P1_API_BASE_URL` to `http://host.docker.internal:8010`.
- If the API is started with `LOCAL_API_HOST=0.0.0.0`, set `LOCAL_API_ADMIN_TOKEN` and enter the token in `P1_ADMIN_TOKEN`.
- If `APEX_WEB_SERVICE.MAKE_REST_REQUEST` cannot reach the URL, check Oracle database network ACLs and container networking.
