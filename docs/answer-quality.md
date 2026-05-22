# Answer Quality

The MVP improves answer quality by cleaning retrieved context before Codex writes the final answer.

## Pipeline

Chat questions use this flow:

1. Search SQLite `DocumentChunk` records for the active source.
2. Exclude documents marked `excludedFromChat`.
3. Score retrieved chunks by keyword relevance and source quality.
4. Remove duplicate chunks and merge adjacent context from the same document where useful.
5. Deprioritize low-quality metadata-only sources when stronger evidence exists.
6. Add structured source metadata to the prompt.
7. Add entity-normalization notes for country/support questions.
8. Ask local Codex to produce the final answer from the cleaned context.

Chat still does not scan folders, OCR files, browse the internet, or use external knowledge.

## Source Quality

Retrieved chunks are tagged with source quality:

- `HIGH`: full extracted text, PDF text, PPT slide text, and normal text files.
- `MEDIUM`: OCR text, image OCR, and table-derived evidence.
- `LOW`: metadata-only assets, video metadata, filename-only snippets, and partial metadata.

LOW sources are only used when no stronger evidence is available.

## Country Support Questions

For country/support questions, the prompt now includes explicit answer-format guidance:

- Use clean country names.
- Separate qualifiers, frameworks, providers, and product labels.
- Do not list combined labels like `Spain VeriFactu` as countries.
- Do not use filenames or media titles as countries.
- Do not complete truncated values from general knowledge.

Preferred answer style:

```text
The indexed documents mention the following supported countries:

NetSuite / OBN / Avalara model:
- Spain - VeriFactu
- United States - DBNA
- Denmark - PEPPOL

Notes:
- One entry appears truncated in the source and was not included.

Evidence:
- Country Support Guide.pdf - mentions Spain with VeriFactu context.

Confidence:
Medium
```

## Evidence In Thread Details

The chat thread details now show cleaner evidence:

- document name
- relative path
- source quality
- extraction mode when available
- page, slide, or sheet when available
- human-readable evidence note

This keeps the main answer business-readable while preserving traceability.
