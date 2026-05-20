# SharePoint Setup

Open `/settings/sharepoint` in the app.

Enter:

- SharePoint Site URL
- SharePoint Folder URL or Folder Path
- Local Synced SharePoint Folder Path
- Tenant ID
- Client ID
- Client Secret
- Optional Document Library Name

Use **Test Connection** to verify folder access without saving the draft values. Use **Save Configuration** to persist settings server-side.

Secrets are stored in `config/sharepoint.config.json`, which is ignored by Git. API responses only return whether a secret is configured.

The dashboard reads the active document source from `GET /api/status`. It shows **Active Source: SharePoint** only when the configured SharePoint folder is connected through app credentials. It shows **Active Source: Local synced SharePoint folder** when a local synced path is readable. If no SharePoint source is selected and mock mode is enabled, it shows **Active Source: Mock documents**.

## No-Credential Local Access

The app cannot read SharePoint documents just because the SharePoint page is open in your browser. Browser login cookies are isolated from the local Next.js server.

For the no-secret MVP path:

1. Sync the approved SharePoint folder to your machine with OneDrive.
2. Paste the local synced folder path into **Local Synced SharePoint Folder Path**.
3. Keep the SharePoint folder URL saved so the approved source remains visible.

The chatbot will read only direct files from that local synced folder. It will not walk into subfolders.

## Supported MVP Document Types

The MVP extracts readable content from direct files in the configured folder:

- `.txt`
- `.md`
- `.markdown`
- `.csv`
- `.json`

Subfolders are ignored. To approve a different folder, update the active folder in `/settings/sharepoint`.

PDF and Word extraction can be added later behind the existing SharePoint/document service boundary.
