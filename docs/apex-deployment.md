# APEX Deployment

Use `apex/codex-apex-project.json` and deploy this project to APEX.

The local deployment target is:

- ORDS/APEX: `http://127.0.0.1:8181/ords`
- Workspace: `LOCAL_CODEX`
- Parsing schema: `LOCAL_CODEX`
- Application ID: `56594`
- Application name: `EMEAChatbot`

## Local Deploy Order

1. Start local APEX with `npm run local-apex:start`.
2. Deploy schema objects:
   `apex/schema/001_knowledge_bot_core.sql`
3. Deploy ORDS APIs:
   `apex/schema/002_knowledge_bot_ords.sql`
4. Import the APEX source from `apex/apps/f56594`.
5. Deploy APEX console pages:
   `apex/schema/003_knowledge_bot_apex_pages.sql`

The page script is intentionally idempotent and creates the APEX-first console modules after import.

## Local Console Modules

- Dashboard
- Channel Management
- Knowledge Sources
- Guardrails
- Question History
- Analytics
- Runner Management
- Settings
- Audit Logs

## Notes

The local deployment uses a throwaway local schema password outside the repository. Do not commit local credentials, APEX tokens, or ORDS secrets.
