export interface SharePointConfig {
  siteUrl: string;
  folderPath: string;
  folderUrl?: string;
  localFolderPath?: string;
  tenantId: string;
  clientId: string;
  clientSecret?: string;
  documentLibraryName?: string;
  lastConnectionStatus?: string;
  lastCheckedAt?: string;
  updatedAt?: string;
}

export interface PublicSharePointConfig {
  siteUrl: string;
  folderPath: string;
  folderUrl: string;
  localFolderPath: string;
  tenantId: string;
  clientId: string;
  clientSecretConfigured: boolean;
  clientSecretMasked: string;
  documentLibraryName: string;
  activeFolder: string;
  lastConnectionStatus: string;
  lastCheckedAt: string;
}

export type ApprovedSourceMode = "sharepoint" | "local_sync" | "mock" | "unavailable";
export type DocumentSourceType = "SHAREPOINT" | "LOCAL_SYNC" | "MOCK" | "NONE";

export interface SharePointStatus {
  available: boolean;
  message: string;
  activeFolder: string;
  mode: ApprovedSourceMode;
}

export interface DocumentSourceStatus {
  activeSource: DocumentSourceType;
  available: boolean;
  displayName: string;
  folderUrl: string | null;
  folderPath: string;
  configuredSharePointFolderUrl: string | null;
  configuredSharePointFolderPath: string;
  message: string;
}
