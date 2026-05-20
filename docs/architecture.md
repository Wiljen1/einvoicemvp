# Architecture

## Shape

This is a single Next.js app with server-side API routes and local services.

- `app` contains pages and API routes.
- `components` contains React UI components.
- `services` contains Codex, SharePoint, guardrails, prompt, and document search logic.
- `types` contains shared TypeScript types.
- `config` contains guardrails and the ignored runtime SharePoint config.
- `documents` is the approved local mock folder for MVP development.

## Chat Flow

1. Validate the question.
2. Load current guardrails.
3. Check local Codex availability.
4. Check configured SharePoint access, or approved mock folder access.
5. Read only approved documents.
6. Run keyword chunk search.
7. Refuse if no supported context is found.
8. Build a bounded prompt from guardrails, sources, and question.
9. Use the Codex service placeholder or future real Codex execution.
10. Return answer, confidence, and sources.

## Security Boundary

The chatbot never browses the internet. It only reads direct files from Microsoft Graph for the configured SharePoint folder, or direct files from the local `documents` folder when mock fallback is enabled and SharePoint credentials are incomplete.

Nested folders are not explored. If the approved folder contains subfolders with other names, those subfolders are ignored.
