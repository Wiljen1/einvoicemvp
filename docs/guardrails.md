# Guardrails

Guardrails are stored in `config/guardrails.json` and can be edited from the dashboard.

Default rules:

- Answer only from approved documents.
- Include source references.
- Include confidence score.
- Do not browse the internet.
- Keep answers short.
- Do not speculate.
- Say when information is missing.
- Use business-friendly language.

The backend always locks `answerOnlyFromDocuments=true` and `allowInternetBrowsing=false`, even if a malformed request tries to change them.
