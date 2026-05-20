# Guardrails

Guardrails are stored in `config/guardrails.json` and can be edited from `/admin`.

The backend protects fixed system guardrails. Admins can edit additional guardrails and response preference defaults, but protected document-only rules cannot be weakened.

## System Guardrails

System guardrails always win:

- Answer only from the provided document context.
- Do not browse the internet.
- Do not speculate.
- Say when information is missing from the approved document source.
- Include evidence and confidence.
- Use business-friendly language.

## Additional Guardrails

Users can add freeform instructions in **Additional Guardrails**. These are appended after the system guardrails in the prompt.

Additional guardrails are additive only. If a user instruction conflicts with system guardrails, the system guardrail remains authoritative and the conflicting user line is ignored.

## Response Defaults

The admin screen includes checkbox defaults for response style, such as concise answers and business-friendly language. These defaults are included in the prompt after protected safety rules.

Settings that would weaken safety, evidence, confidence, or document-only behavior remain protected by the system guardrails.
