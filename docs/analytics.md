# Analytics

The `/admin` analytics section summarizes local question history.

Current MVP analytics:

- total questions asked
- questions today and this week
- most asked questions
- similar question clusters
- average response time
- cache/reuse hit rate
- confidence distribution
- top referenced documents
- unanswered or low-confidence questions

The charts are intentionally lightweight and generated from local SQLite records. No external analytics service is used.

Analytics depends on `LOG_CHAT_HISTORY=true`. If logging is disabled, future questions are not included.
