# APEX Codex Chrome Connection

This workflow lets Codex work inside the already-authenticated Oracle APEX browser session. It does not store credentials, bypass SSO, or launch a separate browser.

## What This Connection Does

- Attaches to Chrome remote debugging on `127.0.0.1:9222`.
- Finds the logged-in APEX tab for `apex.oraclecorp.com`.
- Reuses the active Oracle SSO/APEX session.
- Opens App Builder for application `56594`.
- Runs SQL through APEX SQL Workshop > SQL Commands.

This is the right local developer bridge when direct database credentials are not available and browser SSO must remain intact.

## Start Chrome

Keep Chrome open with remote debugging enabled:

```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-address=127.0.0.1 \
  --remote-debugging-port=9222 \
  --user-data-dir="$HOME/.chrome-apex-debug"
```

Log into Oracle APEX in that Chrome window. Do not paste credentials into Codex.

## Verify The Connection

```bash
npm run apex:chrome:check
```

Expected result:

- Chrome reports a browser version.
- At least one APEX page is detected.
- The page text shows the authenticated workspace.

## Run SQL From Codex

```bash
npm run apex:chrome:sql -- apex/sql/codex_connection_smoke_test.sql
```

For ad hoc SQL:

```bash
printf "select count(*) from user_tables;" | npm run apex:chrome:sql -- -
```

The command opens or reuses SQL Commands in the existing APEX tab, submits the SQL, and prints the visible result region as JSON.

## Open The APEX Application

```bash
npm run apex:chrome:open-app -- 56594
```

The default application ID is `56594`. You can override it:

```bash
APEX_APP_ID=56594 npm run apex:chrome:open-app
```

## Export APEX Source

Pull the current APEX application into source-control-friendly APEXlang files:

```bash
npm run apex:chrome:export-app -- 56594
```

This uses the authenticated APEX export page, selects:

- application `56594`
- format `APEXlang`
- standard/development export
- split export

The downloaded zip is treated as a generated artifact and ignored by Git:

```text
apex/exports/browser/emeachatbot.zip
```

The extracted source files are written to:

```text
apex/apps/f56594
```

These extracted APEXlang files are the app source that Codex can inspect, diff, and version.

## Package APEX Source For Import

After editing `apex/apps/f56594`, package it back into an APEXlang zip:

```bash
npm run apex:app:package
```

Default output:

```text
apex/build/f56594-apexlang.zip
```

Open the APEX import screen in the authenticated session:

```bash
npm run apex:chrome:open-import
```

Then import `apex/build/f56594-apexlang.zip` through the APEX Builder import wizard.

Automatic final import/overwrite is intentionally not run by default. Importing can replace the application definition, so keep that final deployment action explicit until we have a tested non-browser deployment credential.

## Recommended Development Loop

1. Pull the latest APEX app source:

   ```bash
   npm run apex:chrome:export-app -- 56594
   ```

2. Edit local source files in:

   ```text
   apex/apps/f56594
   apex/schema
   apex/ords
   ```

3. Apply schema changes:

   ```bash
   npm run apex:chrome:sql -- apex/schema/<script>.sql
   ```

4. Import APEX app changes through a clean import path when available. In this hosted SSO workspace, use the APEX Builder import UI as the current fallback.

5. Re-export after successful changes so the repo matches APEX:

   ```bash
   npm run apex:chrome:export-app -- 56594
   ```

## Configuration

Optional environment variables:

```bash
APEX_CHROME_DEBUG_URL=http://127.0.0.1:9222
APEX_HOST_MATCH=apex.oraclecorp.com
APEX_APP_ID=56594
APEX_SQL_WAIT_MS=6000
```

No Oracle password, SSO token, or browser cookie is written to disk by this workflow.

## When To Use REST Enabled SQL Instead

Use REST Enabled SQL, SQLcl, or ORDS credentials later when you need unattended deployment, CI, or cloud automation. That path requires an approved credential or OAuth client. This Chrome-backed connection is intentionally interactive and tied to your logged-in session.

Current hosted workspace observation:

- schema: `WKSP_EMEAWJ`
- REST alias: `emeawj`
- REST SQL endpoint: `https://apex.oraclecorp.com/pls/apex/emeawj/_/sql`
- `USER_ORDS_SCHEMAS` shows `AUTO_REST_AUTH` enabled

See `docs/apex-direct-deploy-workflow.md` for the no-browser path.

## Safety Notes

- Keep the remote debugging port bound to `127.0.0.1`.
- Close the debug Chrome window when you are done.
- Do not expose port `9222` on a network interface.
- Treat SQL execution with the same care as SQL Workshop itself.
