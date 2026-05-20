# Synced SharePoint Folder Setup

The current MVP does not connect directly to SharePoint. Use OneDrive to sync the approved SharePoint folder to your machine, then point the app at that local synced folder.

## Steps

1. Open the approved SharePoint folder in Microsoft 365.
2. Use OneDrive **Sync** for that folder.
3. Wait until the files are available locally.
4. Open `http://localhost:3000/settings/documents`.
5. Select **Synced SharePoint Folder**.
6. Enter the local OneDrive path, for example:

```text
/Users/name/OneDrive - Company/Electronic Invoicing
```

7. Save settings.
8. Click **Refresh / Reindex**.

The chatbot reads only the configured local synced folder. It does not browse SharePoint, reuse browser sessions, scrape pages, or read unrelated OneDrive folders.

## Why This Mode Exists

Direct SharePoint API access requires Microsoft Graph permissions and an admin-approved Entra app registration. The local synced folder mode works with the user's existing SharePoint access without asking the MVP to handle Microsoft tokens.

See `docs/future-sharepoint-integration.md` for the future enterprise integration path.
