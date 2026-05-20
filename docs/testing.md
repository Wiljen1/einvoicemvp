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

The index should store `DocumentSource`, `IndexedDocument`, and `DocumentChunk` records in `data/einvoice-index.sqlite`.

## Chat Validation Questions

Use these questions after indexing:

- Which countries are supported for E-Invoicing?
- What are the prerequisites for installing E-Invoicing?
- What is the process for setting up E-Invoicing?
- Are there any licensing requirements for E-Invoicing?
- What should I check before positioning E-Invoicing to a customer?

Expected behavior:

- answers use SQLite indexed chunks only
- sources are returned
- confidence is returned
- no folder scan starts during chat
- OCR count does not change during chat
- unsupported details are refused or qualified

## Current Local Validation Snapshot

On 2026-05-20, the synced OneDrive SharePoint folder indexed successfully:

- files scanned: 96
- indexed documents: 96
- chunks: 1422
- failed files: 0
- OCR processed files: 4
- duplicate documents: 0
- duplicate chunks: 0

The five chat validation questions returned sources and confidence without triggering new index runs or OCR.
