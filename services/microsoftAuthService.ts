import { loadSharePointConfig } from "./sharepointConfigService";
import { microsoftGraphScopes, type MicrosoftAuthConfig } from "@/types/microsoftAuth";

export function getBearerToken(request: Request): string | null {
  const authorization = request.headers.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export async function getMicrosoftAuthConfig(origin: string): Promise<MicrosoftAuthConfig> {
  const sharePointConfig = await loadSharePointConfig();
  const clientId =
    process.env.NEXT_PUBLIC_MSAL_CLIENT_ID ||
    process.env.MSAL_CLIENT_ID ||
    process.env.SHAREPOINT_CLIENT_ID ||
    sharePointConfig.clientId ||
    "";
  const tenantId =
    process.env.NEXT_PUBLIC_MSAL_TENANT_ID ||
    process.env.MSAL_TENANT_ID ||
    process.env.SHAREPOINT_TENANT_ID ||
    sharePointConfig.tenantId ||
    "";
  const redirectUri =
    process.env.NEXT_PUBLIC_MSAL_REDIRECT_URI ||
    process.env.MSAL_REDIRECT_URI ||
    origin.replace(/\/+$/, "");
  const normalizedTenant = tenantId || "organizations";

  return {
    configured: Boolean(clientId && tenantId),
    clientId,
    tenantId,
    authority: `https://login.microsoftonline.com/${encodeURIComponent(normalizedTenant)}`,
    redirectUri,
    scopes: [...microsoftGraphScopes]
  };
}
