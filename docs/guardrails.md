# Guardrails

Guardrails are stored in `config/guardrails.json` and can be edited from the dashboard.

The backend protects fixed system guardrails. The UI only saves the freeform `userGuardrails` field.

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
