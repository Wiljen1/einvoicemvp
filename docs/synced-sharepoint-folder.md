# Synced SharePoint Folder

Use this mode when direct Microsoft Graph access is not available.

1. Open the approved SharePoint folder in Microsoft 365.
2. Sync it locally with OneDrive.
3. Open `/settings/documents`.
4. Select **Synced SharePoint Folder**.
5. Enter the local OneDrive folder path.
6. Save settings and click **Scan / Update Index**.

The app reads only that configured local folder and its allowed subfolders. It does not browse SharePoint, scrape browser sessions, call Microsoft Graph, or read unrelated OneDrive folders.

OCR and Office extraction work the same as local folder mode. Scanned PDFs/images remain local and are never sent to cloud OCR services. Extraction runs during indexing, then chat searches the saved local SQLite chunks.

## Validation

Before scanning, check `/api/diagnostics`. Expected healthy values are `OK` for database, active source, recursive scanner, OCR, extractors, and Codex.

After **Scan / Update Index**, `GET /api/index/status` should show:

- active source: `SYNCED_SHAREPOINT_FOLDER`
- the local OneDrive root path
- indexed document count
- indexed chunk count
- failed/skipped count
- last indexed timestamp

Run a second scan to confirm unchanged files are skipped. Chat questions should not trigger new index runs or OCR counts.
