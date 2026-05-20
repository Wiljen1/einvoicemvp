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
2. Start a local chat session and return a session id.
3. Check local Codex availability.
4. Check Microsoft sign-in and configured SharePoint access or approved local document folder access.
5. Load current guardrails.
6. Read only approved documents.
7. Run keyword chunk search.
8. Refuse if no supported context is found.
9. Build a bounded prompt from guardrails, sources, and question.
10. Reuse a cached answer if the stable request hash already exists.
11. Run local Codex as a read-only background operator.
12. Return answer, confidence, sources, and cache status through polling.

## Chat Session Endpoints

- `POST /api/chat/start`
- `GET /api/chat/status/:sessionId`
- `POST /api/chat/cancel/:sessionId`

The UI polls for progress and can cancel the running local Codex child process.

## Security Boundary

The chatbot never browses the internet. It only reads files from Microsoft Graph for the configured SharePoint folder with a delegated MSAL user token, or files from the resolved local documents folder when local mode is active.

Microsoft authentication uses MSAL browser/react with Authorization Code Flow and PKCE. Tokens are requested for delegated Graph permissions and are passed only to local API routes that need to validate or read the configured SharePoint folder. Tokens are not logged, returned in API responses, or saved in local config.

Local folders are scanned recursively by default with max-depth protection. The indexer does not follow symlinks or leave the configured root folder.

Local Codex is run with a read-only sandbox, no approvals, and approved document context only. The app never sends prompts to a paid cloud AI API.

## Guardrail Prompt Order

Prompts are built in this order:

1. System Guardrails
2. User Additional Guardrails
3. Document Context
4. User Question

User additional guardrails cannot override the fixed system guardrails.
