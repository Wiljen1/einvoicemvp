# Oracle APEX Project Workspace

Current hosted APEX project:

- workspace: `EMEAWJ`
- schema: `WKSP_EMEAWJ`
- application: `56594` / `EMEAChatbot`
- source export: `apps/f56594`
- connection manifest: `codex-apex-project.json`

Use the SSO-backed Chrome bridge from the repo root:

```bash
npm run apex:chrome:check
npm run apex:chrome:export-app -- 56594
npm run apex:app:package
npm run apex:chrome:open-import
```

Run schema SQL through APEX SQL Workshop:

```bash
npm run apex:chrome:sql -- apex/schema/<script>.sql
```

The browser bridge reuses the logged-in Chrome session on `127.0.0.1:9222`; it does not store Oracle credentials.

For the no-browser target:

```bash
cp .env.apex-deploy.example .env.apex-deploy
npm run apex:rest:sql -- apex/schema/<script>.sql
npm run apex:sqlcl:validate -- apex/apps/f56594
npm run apex:sqlcl:import -- apex/apps/f56594
```

REST Enabled SQL is enabled for `WKSP_EMEAWJ` at `https://apex.oraclecorp.com/pls/apex/emeawj/_/sql`, but direct calls still need an approved local secret. SQLcl import/export needs an approved direct database connection.

## Legacy Local Admin Pack

Start here:

1. `local-codex-index-admin-install-guide.md`
2. `local-codex-apex-support.sql`
3. `local-codex-index-admin-page.md`
4. `local-codex-index-admin-processes.sql`

Generated artifacts:

| File | Purpose |
| --- | --- |
| `local-codex-index-admin-install-guide.md` | Exact setup, validation, troubleshooting, and migration steps |
| `local-codex-index-admin-page.md` | APEX Builder page/component blueprint |
| `local-codex-index-admin-processes.sql` | Page process PL/SQL blocks using `APEX_WEB_SERVICE.MAKE_REST_REQUEST` |
| `local-codex-apex-support.sql` | Optional SQL Workshop helper package |
| `local-codex-network-acl-example.sql` | DBA-only network ACL example |
| `local-codex-index-admin-components.json` | Machine-readable component manifest |
| `local-codex-apex-export-notes.md` | Why a direct page export must be generated from the target APEX app |

The setup is local-first and admin-only. It does not use SharePoint and does not require OCI.
