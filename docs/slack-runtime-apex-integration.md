# Slack Runtime APEX Integration

APEX is now the backend/admin/governance source of truth.

The Slack runtime should use:

```env
BACKEND_MODE=APEX
APEX_API_BASE_URL=http://127.0.0.1:8181/ords/local_codex/api
APEX_API_TOKEN=
```

In APEX mode, the Slack runtime calls ORDS for:

- channel config
- knowledge source metadata
- guardrails profile metadata
- analytics events
- question logs
- runner availability status

The Slack runtime still owns only what APEX should not handle locally:

- Slack Socket Mode
- real-time Slack message handling
- local runner job routing
- Codex execution through a runner

Local fallback config remains available only for `BACKEND_MODE=LOCAL`.
