# Microsoft MSAL Setup

## Why MSAL Is Required

A user may already be logged into SharePoint, Microsoft 365, Entra ID, Okta-federated Microsoft login, Oracle SSO, or an MFA-protected Microsoft session. That browser session is not automatically available to this local app.

The MVP uses MSAL to request a delegated Microsoft Graph token for the signed-in user. SharePoint files are read through Graph as that user, using only permissions the user already has.

Do not use browser cookie scraping, SharePoint HTML scraping, password flow, service-account scraping, or app-only client-secret access for the MVP.

## Entra App Registration

Create a Microsoft Entra App Registration.

Configure:

- Platform: Single-page application
- Redirect URI: `http://localhost:3000`
- Supported account type: choose the tenant policy your organization requires
- Client ID: copy into SharePoint Settings or `.env.local`
- Tenant ID: copy into SharePoint Settings or `.env.local`

No client secret is required for Authorization Code Flow with PKCE.

## Delegated Graph Permissions

Add delegated Microsoft Graph permissions:

- `User.Read`
- `Files.Read.All`
- `Sites.Read.All`

An admin may need to grant consent depending on tenant policy.

TODO: evaluate least-privilege delegated access later, including `Sites.Selected` if the tenant supports the desired operating model.

## Local Environment

You can configure Tenant ID and Client ID in the website under `/settings/sharepoint`, or set:

```bash
NEXT_PUBLIC_MSAL_CLIENT_ID=
NEXT_PUBLIC_MSAL_TENANT_ID=
NEXT_PUBLIC_MSAL_REDIRECT_URI=http://localhost:3000
```

The SharePoint settings page still needs the approved Site URL and Folder URL or Folder Path.

## User Experience

1. Open `http://localhost:3000`.
2. Click **Sign in with Microsoft**.
3. Complete SSO/MFA if required.
4. Confirm the dashboard shows **Microsoft signed in**.
5. Test the SharePoint connection.
6. Ask questions in the chat.

If Microsoft sign-in expires, sign in again. Tokens are handled by MSAL and are not logged or returned from server responses.
