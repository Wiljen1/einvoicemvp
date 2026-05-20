# Chat Validation Report

Date/time: 2026-05-20 19:51 CEST

Validation artifact: `artifacts/validation/updated-chat-validation-1779299373386.json`

## Active Source

- Source type: `SYNCED_SHAREPOINT_FOLDER`
- Source path: `/Users/wiljan.h/Library/CloudStorage/OneDrive-OracleCorporation/NetSuite Go-to-Market - Electronic Invoicing`
- Source id: `b1b1c32c-52e2-4b23-9114-8c58dec2022c`
- Index status: `FRESH`
- Last indexed: `2026-05-20T16:50:23.174Z`
- Indexed documents: 96
- Active-for-chat documents: 69
- Chat-excluded documents: 27
- Indexed chunks: 1422
- Active chunks: 1233
- OCR enabled: yes
- OCR processed documents: 4
- Failed extractions: 0

## Noisy File Exclusion Check

The default chat exclusion migration was applied and verified.

| Extension | Indexed | Excluded from chat |
| --- | ---: | ---: |
| `.xlsx` | 5 | 5 |
| `.mp4` | 22 | 22 |
| `.pdf` | 51 | 0 |
| `.pptx` | 5 | 0 |
| `.png` / `.jpeg` | 4 | 0 |
| `.url` | 9 | 0 |

Result: **PASS**. Spreadsheet and video files remain visible in the index but were not searched, cited, or sent to Codex during validation.

## Updated 12-Question Validation

- Result: **PASS**
- Questions tested: 12
- QuestionAnswerLog rows added: 12
- ChatMessage rows added: 24
- Average response time: 9947 ms
- Fresh supported questions using Codex: 9 / 9
- Out-of-scope refusals using Codex: 0 / 3
- Chat-triggered indexing: 0
- Chat-triggered OCR: 0
- Results citing excluded spreadsheet/video sources: 0

| # | Category | Question | Answer source | Codex used | Sources | Noisy sources | Response time |
| ---: | --- | --- | --- | --- | ---: | ---: | ---: |
| 1 | Easy | What is e-invoicing? | Indexed documents | Yes | 5 | 0 | 15134 ms |
| 2 | Easy | What are the prerequisites for e-invoicing? | Indexed documents | Yes | 5 | 0 | 9483 ms |
| 3 | Easy | What documents explain the setup process? | Indexed documents | Yes | 5 | 0 | 14968 ms |
| 4 | Country/support | Which countries are supported for e-invoicing? | Indexed documents | Yes | 5 | 0 | 9994 ms |
| 5 | Country/support | Which documents mention country support or licensing? | Indexed documents | Yes | 5 | 0 | 10680 ms |
| 6 | Country/support | What should I verify before discussing country availability with a customer? | Indexed documents | Yes | 5 | 0 | 11039 ms |
| 7 | Difficult | What are the main implementation risks for e-invoicing? | Indexed documents | Yes | 5 | 0 | 16581 ms |
| 8 | Difficult | What information appears incomplete or needs SME confirmation? | Indexed documents | Yes | 5 | 0 | 14320 ms |
| 9 | Difficult | What would be a good discovery checklist before positioning e-invoicing? | Indexed documents | Yes | 5 | 0 | 14987 ms |
| 10 | Out of scope | What is the weather in Madrid? | Refusal | No | 0 | 0 | 725 ms |
| 11 | Out of scope | Who won the Champions League? | Refusal | No | 0 | 0 | 727 ms |
| 12 | Out of scope | Compare NetSuite to SAP using public reviews. | Refusal | No | 0 | 0 | 725 ms |

## Answer-Quality Correction

During validation, the country-support answer correctly avoided spreadsheet/video sources, but the first run still phrased solution labels such as `US DBNA` and `Denmark PEPPOL` as if they were country names.

Fix applied: prompt quality rules now instruct Codex to separate actual countries, regions, and locations from product names, provider labels, mandates, file names, sheet names, and media titles.

Targeted rerun result:

- Question: `Which countries are supported for e-invoicing?`
- Answer source: indexed documents
- Codex used: yes
- Sources returned: 5
- Spreadsheet/video sources returned: 0
- Result: returned clean names such as `Spain`, `US`, and `Denmark`, with `Veri*Factu`, `DBNA`, and `PEPPOL` kept as supporting labels.

## UI Validation

Validated in the local app:

- Main page order is now status pills, chat, guardrails, then compact document source status.
- Document Source Status no longer dominates the top of the chat page.
- Document settings page shows file filters, file-type filters, filename/path search, counts, and bulk include/exclude actions.
- Question History shows 5 records per page.
- Question History supports sortable headers for created date, confidence, response time, cache hit, and Codex usage.
- Row/View action opens a details dialog with full question, full answer, confidence, sources, retrieved chunks, Codex usage, reuse status, and response time.

## Admin Analytics

Observed after validation:

- Total questions: 127
- Cache hit rate: 13%
- Average response time: 8974 ms
- Low-confidence/unanswered rows: 25
- Similar question clusters: 10
- Top referenced documents: 10

## Automated Checks

All passed after the fixes:

- `npm run lint`
- `npm run typecheck`
- `npm run test` (13 files, 80 tests)
- `npm run build`

## Known Limitations

- Confidence is still based on retrieval strength, so it may remain high even when the answer text says the retrieved context is incomplete.
- Semantic embeddings are still future work; retrieval remains keyword/chunk based.
- OCR text can be noisy for image-heavy assets, though OCR now runs only during indexing.
- The SQLite database and validation artifacts are local runtime files and are intentionally excluded from Git.
