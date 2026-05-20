# Testing And Validation

## Automated Checks

Run:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

## Service Diagnostics

With the app running locally:

```bash
curl http://localhost:3000/api/diagnostics
```

Expected healthy services:

- SQLite database: `OK`
- Active document source: `OK`
- Recursive scanner: `OK`
- OCR: `OK`
- PDF, PPTX, XLSX, image, video, and URL extractors: `OK`
- Codex: `OK`

## Index Validation

Start indexing:

```bash
curl -X POST http://localhost:3000/api/index/run
```

Poll the returned run id:

```bash
curl http://localhost:3000/api/index/run/<runId>
```

Verify status:

```bash
curl http://localhost:3000/api/index/status
```

The index should store `DocumentSource`, `IndexedDocument`, and `DocumentChunk` records in `data/knowledge-index.sqlite`.

## Chat Validation Questions

Use domain-specific questions for the active approved folder. Good validation questions should cover:

- supported scope
- prerequisites
- setup or process steps
- licensing or access requirements
- positioning, risk, or readiness checks

Expected behavior:

- answers use SQLite indexed chunks only
- sources are returned
- confidence is returned
- question/answer history is saved when `LOG_CHAT_HISTORY=true`
- similar high-confidence questions can be reused safely
- no folder scan starts during chat
- OCR count does not change during chat
- unsupported details are refused or qualified

## Chat UI Validation

The main chat should behave like a lightweight Slackbot conversation:

- submitted questions appear as visible `You` messages
- inline `Knowledge Bot` processing appears while the request is running
- final answers appear directly below the question
- source and confidence details are available inside `Show sources and confidence`
- reused answers show `Reused from a similar previous question`
- fresh supported answers show `Answered with Codex using indexed documents`
- out-of-scope questions return a safe refusal without sources

Quick local smoke questions:

1. `What is e-invoicing?`
2. `What countries are supported for e-invoicing?`
3. `What is the weather in Madrid?`

For each question, verify:

- no index run starts during chat
- OCR processed file count does not change
- the question and answer are saved to question history
- sources and confidence are visible in the thread details when available

## Current Local Validation Snapshot

On 2026-05-20, the synced OneDrive SharePoint folder indexed successfully:

- files scanned: 96
- indexed documents: 96
- chunks: 1422
- failed files: 0
- OCR processed files: 4
- duplicate documents: 0
- duplicate chunks: 0

The local validation questions returned sources and confidence without triggering new index runs or OCR.
