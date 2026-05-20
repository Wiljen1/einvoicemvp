# Future SharePoint Integration

Direct SharePoint/Graph access is disabled in the current local-first MVP because it requires Microsoft Entra app registration and, in many enterprise tenants, admin consent.

The current user does not have sufficient privileges to create or use the required app registration. The MVP therefore supports local folders, OneDrive-synced SharePoint folders, and manual uploads.

## Important Constraints

- A browser SharePoint login alone is not enough for this app to read files.
- The app cannot safely reuse browser cookies.
- Scraping SharePoint pages is not acceptable.
- Microsoft Graph/API access requires an approved setup.
- Tokens must not be logged, exposed, or stored insecurely.

## Future Production Options

1. Admin-approved Entra App Registration with delegated Microsoft Graph permissions.
2. Server-side Graph connector managed by IT.
3. Approved enterprise app similar to managed GPT connectors.
4. Service-level integration with a scoped enterprise identity and governance.
5. SharePoint export or sync pipeline that lands approved documents in a controlled local or network folder.

## Possible Future Graph Mode

`GRAPH_SHAREPOINT` is intentionally disabled unless `ENABLE_MSAL_SHAREPOINT=true` and a secure implementation is restored. A future build should evaluate least-privilege access, admin consent requirements, token storage, audit logging, folder scoping, and file versioning before enabling it.
