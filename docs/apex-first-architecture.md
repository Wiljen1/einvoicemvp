# APEX-First Architecture

This is the corrected target architecture.

Oracle APEX and Autonomous Database should be the main backend, admin UI, analytics platform, governance layer, and configuration store. Custom Node services should stay small and exist only where APEX/ORDS cannot realistically replace them, such as Slack Socket Mode and Codex runner orchestration.

## Target Flow

```text
Slack
  -> Slackbot Runtime, small Node service
  -> Oracle APEX + Autonomous Database through ORDS APIs
       - admin UI
       - channel configs
       - guardrails
       - analytics
       - question history
       - governance
       - knowledge bundle management
       - source management
       - audit logs
       - REST APIs
  -> Codex Runner in OCI, future
  -> Slack response
```

## Responsibility Split

### APEX / Autonomous Database

APEX and the Oracle database own business state and governance:

- Slack workspace and channel registry
- channel-specific configuration
- guardrail policy management
- knowledge source metadata
- knowledge bundle management
- approved source lists
- question history
- answer history
- analytics and dashboards
- audit logs
- admin users and authorization
- reporting and exports
- ORDS REST APIs consumed by Slack runtime and future runners

### Slack Runtime

The Slack runtime should be deliberately small:

- Slack Socket Mode connection
- Slack event verification and dispatch
- thread and message formatting
- calls to APEX/ORDS APIs for configuration, history, governance, and logging
- calls to Codex runner when APEX authorizes the request
- response posting back to Slack

It should not own long-lived business data, admin screens, dashboards, channel governance, analytics, or source policy.

### Codex Runtime

The Codex runtime should be a reasoning/execution service:

- future OCI-hosted Codex execution
- bounded prompt/context processing
- returns answer, citations, confidence, and execution metadata

It should not become the governance database or admin platform.

## Current Project Review

### A. Keep

These pieces still make sense, either as product concepts or as code that can be refactored into the small Slack/Codex runtime:

- `services/codexService.ts`: local Codex invocation concepts.
- `services/chatPromptService.ts`: prompt construction ideas, once policies come from APEX.
- `services/chatSafetyService.ts`: request safety concepts, once rules come from APEX.
- `services/sourceReferenceService.ts`: citation/source formatting ideas.
- `services/entityNormalizationService.ts`: reusable text normalization.
- `components/SlackStyleChat.tsx`: Slack-style UX prototype concepts.
- `types/chat.ts`, `types/document.ts`, `types/guardrails.ts`: useful shared shape references, but ownership should shift to APEX table/API contracts.
- `scripts/local-apex-check.sh`, `scripts/local-apex-start.sh`, `scripts/local-apex-stop.sh`: useful local APEX developer environment helpers.
- local Oracle Database Free + APEX + ORDS setup: useful for learning/building APEX locally.

### B. Move To APEX

These responsibilities should be modeled as Oracle tables, APEX pages, and ORDS modules:

- `/admin` dashboard
- `components/AdminDashboard.tsx`
- `components/GuardrailsPanel.tsx`
- `components/GuardrailsSummary.tsx`
- `services/adminAnalyticsService.ts`
- `services/guardrailsService.ts`
- `services/chatCacheService.ts`
- `services/answerReuseService.ts`
- `services/questionSimilarityService.ts`
- `app/api/admin/*`
- `app/api/guardrails/*`
- question history and answer reuse persistence
- analytics summaries and trend cards
- document/source management screens
- knowledge bundle admin
- audit history
- user and role management
- operational reporting

The APEX/Autonomous DB schema should become the source of truth for this data.

### C. Remove Or Deprecate

These pieces are now transitional and should not be expanded:

- `local_api/`: created as a local APEX middleware, but it duplicates backend ownership. Keep only as a temporary harness if needed while APEX APIs are being designed.
- `apex/local-codex-index-admin-*`: page kit focused on APEX calling the custom local middleware. Do not continue as the main architecture.
- `scripts/local-api-*` and `scripts/validate_local_api.mjs`: keep only while validating the old local middleware; remove once APEX/ORDS APIs replace it.
- Next.js admin APIs under `app/api/admin/*`: should not be the production admin backend.
- Next.js document indexing endpoints under `app/api/index/*`: should be replaced by APEX metadata and a minimal external indexing/runner job only if APEX cannot perform that work directly.
- SQLite as governance storage: replace with Autonomous Database/APEX tables.

Do not delete these immediately while work is in progress. Mark them deprecated, stop adding features to them, and migrate behavior into APEX in controlled steps.

## APEX Data Model Draft

Start with Oracle tables like:

- `SLACK_WORKSPACES`
- `SLACK_CHANNELS`
- `CHANNEL_CONFIGS`
- `GUARDRAIL_POLICIES`
- `GUARDRAIL_RULES`
- `KNOWLEDGE_SOURCES`
- `KNOWLEDGE_BUNDLES`
- `KNOWLEDGE_BUNDLE_ITEMS`
- `QUESTION_EVENTS`
- `ANSWER_EVENTS`
- `CODEX_RUNS`
- `AUDIT_EVENTS`
- `API_CLIENTS`

APEX pages should manage these tables directly. ORDS modules should expose only the APIs needed by Slack runtime and Codex runtime.

## ORDS API Draft

The Slack runtime should call APEX/ORDS APIs such as:

- `GET /ords/local_codex/slack/channel-config?team_id=...&channel_id=...`
- `POST /ords/local_codex/slack/events`
- `POST /ords/local_codex/questions`
- `POST /ords/local_codex/codex-runs`
- `PATCH /ords/local_codex/codex-runs/:id`
- `POST /ords/local_codex/audit-events`

APEX should validate the channel, load guardrails, decide whether the request is allowed, record the question, and return the configuration needed by the Slack runtime.

## Local APEX Developer Environment

The local Oracle Database Free + APEX + ORDS setup is still useful, but its purpose is now narrower:

- learn APEX Builder
- create APEX tables, pages, and ORDS modules
- prototype the admin/governance application
- export APEX artifacts for later import into cloud APEX

It is not intended to become a separate production backend.

Current local endpoints:

- APEX/ORDS: `http://127.0.0.1:8181/ords`
- local workspace sign-in: `http://127.0.0.1:8181/ords/r/apex/workspace-sign-in/oracle-apex-sign-in`
- local workspace: `LOCAL_CODEX`

## Oracle Account And SSO

Local APEX does not automatically use an Oracle corporate SSO account. It uses local APEX workspace users unless an authentication scheme is configured against an external identity provider.

For the cloud target, the preferred route is:

1. Use Oracle Autonomous Database or Oracle-hosted APEX.
2. Build/import the APEX application there.
3. Configure the application authentication against the approved Oracle identity provider or OCI Identity Domain.
4. Keep governance and data in Autonomous Database.
5. Host the small Slack runtime and future Codex runner in OCI.

APEX supports external identity providers through authentication schemes such as Social Sign-In with OpenID Connect/OAuth2-capable providers. Autonomous Database also has IAM authentication features, but Oracle documentation notes that APEX is not supported for IAM database users in that specific database-login sense; application SSO should be handled through APEX authentication schemes and the approved identity provider.

## Migration Plan

1. Freeze custom admin/backend expansion outside APEX.
2. Use local APEX only as a developer environment.
3. Create the APEX schema tables for channels, policies, knowledge bundles, events, and audits.
4. Build APEX admin pages over those tables.
5. Add ORDS modules for Slack runtime.
6. Refactor Node to a minimal Slack runtime that calls ORDS.
7. Move Codex execution behind a runner interface.
8. Deploy APEX to Autonomous Database or Oracle-hosted APEX.
9. Deploy Slack runtime and Codex runner to OCI.
10. Remove deprecated Next.js/local middleware admin features.

## Non-Goals

- Do not build a second custom admin portal in React/Next.js.
- Do not make SQLite the governance database.
- Do not make the Slack runtime own channel policy or analytics.
- Do not keep expanding `local_api` as the main backend.
- Do not require SharePoint for this architecture.

## References

- Oracle APEX install and ORDS setup: https://docs.oracle.com/en/database/oracle/apex/26.1/htmig/installing-and-configuring-apex-and-ords.html
- ORDS 26.1 documentation: https://docs.oracle.com/en/database/oracle/oracle-rest-data-services/26.1/ordig/index.html
- APEX Social Sign-In / OIDC-capable providers: https://docs.oracle.com/en/database/oracle/apex/26.1/aeadm/editing-social-sign-in.html
- Autonomous Database IAM authentication notes: https://docs.oracle.com/en-us/iaas/autonomous-database-serverless/doc/iam-tools-notes.html
