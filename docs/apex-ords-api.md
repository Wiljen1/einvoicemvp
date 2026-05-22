# APEX ORDS API

Base URL:

```text
http://127.0.0.1:8181/ords/local_codex/api
```

## Required Endpoints

- `GET /channel-config/:channelId`
- `GET /knowledge-source/:id`
- `GET /guardrails/:profileId`
- `POST /analytics/event`
- `POST /question-log`
- `POST /runner/heartbeat`
- `GET /runner/available`
- `GET /system/config`

## Admin/Report Endpoints

- `GET /channels`
- `GET /knowledge-sources`
- `GET /guardrails`
- `GET /questions/history`
- `GET /analytics/summary`
- `GET /runners`
- `GET /settings`
- `GET /audit-logs`

The APIs return JSON and do not expose secrets. Local endpoints are unauthenticated for the local prototype; production should add ORDS OAuth or an approved APEX/API authorization model.
