# Local Sharing

This MVP is designed for no-cost local sharing.

Each colleague runs their own copy:

```bash
git clone https://github.com/Wiljen1/einvoicemvp.git
cd einvoicemvp
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

## What Is Not Required

- GitHub Codespaces
- Paid hosting
- Paid cloud AI APIs
- Centralized production server
- Complex Docker setup
- Entra app registration for the current local MVP

## What Each User Needs

- Node.js and npm
- Local Codex app or CLI
- Approved local documents, a OneDrive-synced SharePoint folder, or demo uploads
- Local `.env.local` configuration when automatic detection is not enough

For SharePoint content, sync the approved folder locally with OneDrive and select that path under `/settings/documents`.
