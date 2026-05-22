# APEX Direct Deploy Workflow

This is the target no-browser deployment lane for the hosted Oracle APEX workspace.

## Current Project

- Workspace: `EMEAWJ`
- Schema: `WKSP_EMEAWJ`
- Application: `56594` / `EMEAChatbot`
- APEX source: `apex/apps/f56594`
- REST SQL endpoint: `https://apex.oraclecorp.com/pls/apex/emeawj/_/sql`

REST is enabled for the schema with `AUTO_REST_AUTH` enabled. Anonymous REST SQL calls return `401 Unauthorized`, which is expected.

Oracle documents REST Enabled SQL as a HTTPS POST service that requires the target schema to be REST-enabled and authenticated through a SQL Developer role path: schema authentication, first-party/basic ORDS user authentication, or OAuth 2 client credentials.

## Credential Rule

Codex must not store Oracle credentials or SSO tokens.

Copy the deploy env template locally:

```bash
cp .env.apex-deploy.example .env.apex-deploy
```

Then use either direct environment variables or a local secret command such as macOS Keychain:

```bash
security add-generic-password -a "$USER" -s apex-rest-sql-wksp-emeawj -w
```

Use this in `.env.apex-deploy`:

```bash
APEX_REST_SQL_PASSWORD_CMD=security find-generic-password -a "$USER" -s apex-rest-sql-wksp-emeawj -w
```

## No-Browser SQL Deploy

Use REST Enabled SQL for schema changes:

```bash
npm run apex:rest:sql -- apex/schema/<script>.sql
```

Smoke test:

```bash
npm run apex:rest:sql -- apex/sql/codex_connection_smoke_test.sql
```

This is the clean path for tables, views, packages, seed data, and ORDS setup scripts.

## No-Browser APEX App Deploy

For APEX application source import/export without a browser, SQLcl needs a direct database connection:

```bash
APEX_SQLCL_CONNECT=<host/service-or-wallet-connect-name>
APEX_SQLCL_USER=WKSP_EMEAWJ
APEX_SQLCL_PASSWORD_CMD=security find-generic-password -a "$USER" -s apex-sqlcl-wksp-emeawj -w
```

Validate APEXlang:

```bash
npm run apex:sqlcl:validate -- apex/apps/f56594
```

Import APEXlang:

```bash
npm run apex:sqlcl:import -- apex/apps/f56594
```

Export APEXlang:

```bash
npm run apex:sqlcl:export -- 56594 apex/apps/f56594
```

If direct DB connectivity is not available for `apex.oraclecorp.com`, keep using the authenticated browser bridge for APEX app import/export while REST SQL handles schema changes.

## Practical Development Loop

1. Export app source:

   ```bash
   npm run apex:chrome:export-app -- 56594
   ```

2. Edit local source:

   ```text
   apex/apps/f56594
   apex/schema
   apex/ords
   ```

3. Deploy schema changes without browser:

   ```bash
   npm run apex:rest:sql -- apex/schema/<script>.sql
   ```

4. Package app source:

   ```bash
   npm run apex:app:package
   ```

5. Deploy the APEX app:

   - preferred final state: `npm run apex:sqlcl:import -- apex/apps/f56594`
   - current fallback if direct DB is unavailable: `npm run apex:chrome:open-import`

## What Is Still Needed To Remove The Browser Completely

REST SQL alone is enough for database/schema changes. Full no-browser APEX app import/export needs one approved SQLcl path:

- direct DB host/service credentials
- Autonomous Database wallet and schema credentials
- an approved deployment account with import/export permissions

Until that exists, the browser bridge remains the fallback for APEX Builder import/export only.

## References

- Oracle ORDS REST Enabled SQL Service: https://docs.oracle.com/en/database/oracle/oracle-rest-data-services/25.2/orddg/rest-enabled-sql-service.html
