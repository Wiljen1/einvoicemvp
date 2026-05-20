export const microsoftGraphScopes = ["User.Read", "Files.Read.All", "Sites.Read.All"] as const;

export interface MicrosoftAuthConfig {
  configured: boolean;
  clientId: string;
  tenantId: string;
  authority: string;
  redirectUri: string;
  scopes: string[];
}

export type MicrosoftAuthState =
  | "CONFIG_MISSING"
  | "SIGNED_OUT"
  | "SIGNED_IN"
  | "SESSION_EXPIRED"
  | "ACCESS_DENIED";
