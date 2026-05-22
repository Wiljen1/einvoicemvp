# Entity Normalization

The chatbot uses a lightweight normalization layer before sending retrieved chunks to Codex.

The goal is not to build a full named-entity system. The MVP only cleans common business labels that appear in document text so answers stay readable.

## Configuration

Normalization config lives in:

```text
config/entity-normalization.json
```

Current fields:

- `countryAliases`: maps common country aliases or alternate spellings to clean display names.
- `knownQualifiers`: labels that should be preserved separately from country names.
- `ignoredLabels`: product, app, or internal labels that should not be treated as country names.

Example:

```json
{
  "countryAliases": {
    "US": "United States",
    "USA": "United States",
    "U.S.": "United States",
    "Brasil": "Brazil"
  },
  "knownQualifiers": ["PEPPOL", "VeriFactu", "DBNA", "OBN", "Avalara"]
}
```

## Country Label Handling

When retrieved chunks contain combined labels, the service separates country names from qualifiers:

| Raw label | Clean display | Qualifier |
| --- | --- | --- |
| `Spain VeriFactu` | `Spain` | `VeriFactu` |
| `Denmark PEPPOL` | `Denmark` | `PEPPOL` |
| `US DBNA` | `United States` | `DBNA` |
| `Brasil` | `Brazil` | |

The raw value is preserved as evidence, but Codex is instructed not to present the combined label as the country name.

## Truncated Values

Truncated values are not guessed.

Example:

```text
Ger...
```

This is marked as unknown/truncated. The assistant should say one entry appears truncated rather than completing it as Germany from general knowledge.

## Scope

This layer is intentionally small and configurable. It is useful for recurring labels in indexed business documents, but it is not a substitute for semantic extraction or a curated country-support database.
