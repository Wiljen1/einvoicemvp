export interface SharePointConfig {
  siteUrl: string;
  folderPath: string;
  folderUrl?: string;
  tenantId: string;
  clientId: string;
  /**
   * Kept only for backwards compatibility with older local config files.
   * The MVP uses MSAL delegated SPA auth and does not require a client secret.
   */
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
  tenantId: string;
  clientId: string;
  documentLibraryName: string;
  activeFolder: string;
  lastConnectionStatus: string;
  lastCheckedAt: string;
}

export type ApprovedSourceMode = "sharepoint" | "mock" | "auth_required" | "access_denied" | "unavailable";
export type DocumentSourceType = "MOCK_FOLDER" | "LOCAL_SYNCED_FOLDER" | "GRAPH_SHAREPOINT" | "NONE";

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
  fileCount?: number;
  skippedFileCount?: number;
  indexedCount?: number;
  skippedCount?: number;
  recursive?: boolean;
  maxDepth?: number;
  supportedExtensions?: string[];
  lastIndexedAt?: string;
  indexedFiles?: Array<{
    id?: string;
    fileName: string;
    relativePath?: string;
    absolutePath?: string;
    extension?: string;
    path: string;
    size: number;
    lastModified: string;
    sourceType?: "LOCAL_FOLDER" | "GRAPH_SHAREPOINT";
    metadata?: {
      size: number;
      lastModified: string;
      pageCount?: number;
    };
  }>;
  skippedFiles?: Array<{
    fileName: string;
    relativePath?: string;
    absolutePath?: string;
    extension?: string;
    path: string;
    reason: string;
  }>;
  message: string;
}
