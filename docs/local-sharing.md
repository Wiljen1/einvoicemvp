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

## What Each User Needs

- Node.js and npm
- Local Codex app or CLI
- Access to the approved SharePoint folder
- Either a local OneDrive-synced copy of that approved folder or SharePoint app credentials
- Local `.env.local` configuration when automatic detection is not enough

SharePoint secrets stay on each user's machine in `config/sharepoint.config.json`, which is ignored by Git.
