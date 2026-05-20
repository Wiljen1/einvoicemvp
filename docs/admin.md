# Admin

The local admin area is available at `/admin`.

It includes:

- Guardrails: protected system rules, response defaults, additional guardrails, and prompt preview.
- Question History: locally stored questions, answers, confidence, sources, response time, reuse state, and Codex usage.
- Analytics: simple usage trends, most asked questions, confidence distribution, cache hit rate, and top referenced documents.
- Document Index: active indexed files and exclusion state.
- Settings: local privacy notes and history logging guidance.

No admin authentication is enabled in this MVP. Add authentication before using the admin area in a shared or hosted environment.

Question and answer history is controlled by:

```bash
LOG_CHAT_HISTORY=true
```

Set it to `false` to stop saving future chat logs.
