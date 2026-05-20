# SharePoint Setup

Open `/settings/sharepoint` in the app.

Enter:

- SharePoint Site URL
- SharePoint Folder URL or Folder Path
- Tenant ID
- Client ID
- Client Secret
- Optional Document Library Name

Use **Test Connection** to verify folder access without saving the draft values. Use **Save Configuration** to persist settings server-side.

Secrets are stored in `config/sharepoint.config.json`, which is ignored by Git. API responses only return whether a secret is configured.

## Supported MVP Document Types

The MVP extracts readable content from direct files in the configured folder:

- `.txt`
- `.md`
- `.markdown`
- `.csv`
- `.json`

Subfolders are ignored. To approve a different folder, update the active folder in `/settings/sharepoint`.

PDF and Word extraction can be added later behind the existing SharePoint/document service boundary.
