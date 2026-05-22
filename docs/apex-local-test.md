# APEX Local Test

Local validation completed against Oracle APEX 26.1 on `http://127.0.0.1:8181/ords`.

## Checks

- APEX app `56594` imported into workspace `LOCAL_CODEX`.
- APEX pages exist for Dashboard, Channels, Knowledge Sources, Guardrails, Question History, Analytics, Runner Management, Settings, and Audit Logs.
- Core tables exist for channels, channel configs, knowledge sources, bundle versions, guardrails, question logs, answer logs, source usage, analytics events, runner pools, runners, system settings, and audit logs.
- Package `KB_REST_API` compiles.
- Views `KB_CHANNEL_CONFIG_V`, `KB_DASHBOARD_V`, `KB_QUESTION_HISTORY_V`, `KB_RUNNER_STATUS_V`, and `KB_ANALYTICS_SUMMARY_V` compile.
- Seed config exists for `EMEA-E-invoice`, `E-Invoice Knowledge Bundle`, `Strict Document Only`, and `Default Codex Runner Pool`.

## API Smoke Tests

```bash
curl http://127.0.0.1:8181/ords/local_codex/api/channel-config/emea-e-invoice
curl http://127.0.0.1:8181/ords/local_codex/api/system/config
curl http://127.0.0.1:8181/ords/local_codex/api/runner/available
```

POST checks:

```bash
curl -X POST http://127.0.0.1:8181/ords/local_codex/api/analytics/event \
  -H 'content-type: application/json' \
  -d '{"eventType":"VALIDATION","channelId":"emea-e-invoice","question":"test","answer":"ok"}'
```

## APEX URL

Open the local app:

```text
http://127.0.0.1:8181/ords/r/local_codex/emeachatbot/dashboard
```

It redirects to the local APEX login when no APEX session exists.
