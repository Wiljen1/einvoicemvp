# Manual Test Checklist

Use this checklist before sharing the MVP with colleagues.

## Startup

- Clone the repo.
- Run `npm install`.
- Copy `.env.example` to `.env.local`.
- Run `npm run dev`.
- Open `http://localhost:3000`.
- Confirm the dashboard loads without console errors.

## Codex Detection

- Confirm **Codex detected and operational** appears when local Codex is installed.
- Temporarily set `CODEX_FORCE_UNAVAILABLE=true` and confirm the unavailable message appears.
- Ask a supported question and confirm a chat run starts.
- Confirm the progress bar advances through processing stages.
- Start a run and click **Stop** to confirm the request is cancelled.

## Local Document Indexing

- Confirm the dashboard shows the absolute local folder path.
- Add `.txt`, `.md`, `.json`, or `.csv` files and click **Refresh Documents**.
- Add a text-based PDF and confirm it appears under indexed files.
- Add a scanned/image-only PDF and confirm it is skipped with a clear reason.
- Add files inside nested subfolders and confirm relative paths appear in indexed files and chat sources.
- Add unsupported files such as `.pptx`, `.xlsx`, or `.mp4` and confirm skipped reasons are visible.

## Microsoft Sign-In And SharePoint

- Configure Tenant ID, Client ID, SharePoint Site URL, and approved Folder URL.
- Confirm no client secret is required.
- Click **Sign in with Microsoft**.
- Complete SSO/MFA if required.
- Confirm **Microsoft signed in** appears.
- Click **Test Connection**.
- Confirm **SharePoint folder connected** appears when the signed-in user has access.
- Confirm access-denied and sign-in-required states are clear when permissions or session are missing.
- Confirm the dashboard shows **Active Source: SharePoint** and does not show the local mock folder as active.

## Guardrails

- Confirm fixed system guardrails are visible.
- Add freeform additional guardrails and save.
- Refresh guardrails and confirm the additional text reloads.
- Add a conflicting instruction and confirm protected system rules still win.

## Chat Flow

- Ask a question supported by the active document source.
- Confirm the answer includes confidence and sources.
- Confirm source references use relative paths for local nested files.
- Ask an unsupported question and confirm the app refuses instead of speculating.
- Confirm the chatbot does not browse the internet or cite external sources.

## GitHub Push Verification

- Run `git status`.
- Confirm `.env.local`, `node_modules`, `.next`, artifacts, cache files, and real local documents are not staged.
- Run `npm run lint`.
- Run `npm run typecheck`.
- Run `npm run test`.
- Run `npm run build`.
- Push with `git push` and confirm GitHub receives the branch.
