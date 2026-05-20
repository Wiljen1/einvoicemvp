# SharePoint Setup

Open `/settings/sharepoint` in the app.

Enter:

- SharePoint Site URL
- SharePoint Folder URL or Folder Path
- Tenant ID
- Client ID
- Optional Document Library Name

The MVP uses Microsoft MSAL delegated sign-in. Do not enter or create a client secret for the local SPA flow.

Use **Save Configuration** first so the app can initialize MSAL with the Tenant ID and Client ID. Then use **Sign in with Microsoft** and **Test Connection**.

## How Access Works

Being logged into SharePoint in the browser does not automatically give this app access to files. The app must receive a delegated Microsoft Graph token through MSAL.

Flow:

1. User clicks **Sign in with Microsoft**.
2. Microsoft opens the corporate login flow.
3. Existing SSO may complete the sign-in silently or nearly silently.
4. MFA runs if the tenant requires it.
5. MSAL receives a delegated Graph token.
6. The local API uses that token to read only the configured SharePoint folder.
7. Local Codex receives only retrieved document context.

## Graph Permissions

Start with delegated permissions:

- `User.Read`
- `Files.Read.All`
- `Sites.Read.All`

TODO: evaluate least-privilege options such as delegated `Sites.Selected` once the target tenant model is confirmed.

## Document Rules

The app reads only the configured SharePoint folder. It does not scrape SharePoint HTML, browser cookies, service-account sessions, or unrelated folders.

The current Graph path supports readable `.txt`, `.md`, `.markdown`, `.csv`, `.json`, and text-based `.pdf` files. Scanned PDFs, DOCX, PPTX, XLSX, incremental indexing, and checksum/version caching are TODOs behind the document service boundary.
