export interface SharePointConfig {
  siteUrl: string;
  folderPath: string;
  tenantId: string;
  clientId: string;
  clientSecret?: string;
  documentLibraryName?: string;
  updatedAt?: string;
}

export interface PublicSharePointConfig {
  siteUrl: string;
  folderPath: string;
  tenantId: string;
  clientId: string;
  clientSecretConfigured: boolean;
  clientSecretMasked: string;
  documentLibraryName: string;
  activeFolder: string;
}

export type ApprovedSourceMode = "sharepoint" | "mock" | "unavailable";

export interface SharePointStatus {
  available: boolean;
  message: string;
  activeFolder: string;
  mode: ApprovedSourceMode;
}
