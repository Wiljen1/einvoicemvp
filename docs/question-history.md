# Question History

When `LOG_CHAT_HISTORY=true`, each completed chat answer is stored in the local SQLite database.

Saved fields include:

- question and normalized question
- answer
- confidence score and level
- source references
- retrieved chunk ids
- response time
- whether Codex was used
- whether the answer was reused or cached
- active document source
- index snapshot timestamp

The history is local to the user's machine. It is not sent to a hosted service.

Use `/admin` to review or clear history. Clearing history removes `QuestionAnswerLog`, `ChatMessage`, and `ChatSession` records from the local database.

Avoid intentionally entering secrets into chat. Local logging can be disabled with:

```bash
LOG_CHAT_HISTORY=false
```
