import path from "node:path";
import type { ApprovedDocument } from "@/types/document";
import type { DocumentSourceStatus, SharePointConfig, SharePointStatus } from "@/types/sharepoint";
import { extractPdfTextFromBuffer } from "./documentExtractors/pdfExtractor";
import {
  getLocalApprovedDocuments,
  getLocalDocumentIndexStatus
} from "./documentIndexService";
import {
  getActiveFolderDisplay,
  hasCompleteSharePointCredentials,
  loadSharePointConfig
} from "./sharepointConfigService";

const READABLE_EXTENSIONS = new Set([".txt", ".md", ".markdown", ".csv", ".json", ".pdf"]);
const MAX_DOCUMENT_BYTES = 250_000;
const MAX_SHAREPOINT_DOCUMENTS = 50;
const GRAPH_TIMEOUT_MS = 10_000;

interface SharePointAccessOptions {
  accessToken?: string | null;
  forceRefresh?: boolean;
  metadataOnly?: boolean;
}

interface GraphSiteResponse {
  id: string;
}

interface GraphDriveResponse {
  id: string;
  name?: string;
}

interface GraphDriveItem {
  id?: string;
  name: string;
  file?: unknown;
  folder?: unknown;
  webUrl?: string;
  size?: number;
  lastModifiedDateTime?: string;
  "@microsoft.graph.downloadUrl"?: string;
}

interface GraphChildrenResponse {
  value?: GraphDriveItem[];
  "@odata.nextLink"?: string;
}

class GraphFetchError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

export async function checkSharePointAccess(
  config?: SharePointConfig,
  options?: SharePointAccessOptions
): Promise<SharePointStatus> {
  const effectiveConfig = config || (await loadSharePointConfig());

  if (hasCompleteSharePointCredentials(effectiveConfig)) {
    if (!options?.accessToken) {
      return {
        available: false,
        message: "Microsoft sign-in is required to access the configured SharePoint folder.",
        activeFolder: getActiveFolderDisplay(effectiveConfig),
        mode: "auth_required"
      };
    }

    try {
      await listSharePointDocuments(effectiveConfig, {
        accessToken: options.accessToken,
        metadataOnly: true
      });
      return {
        available: true,
        message: "SharePoint folder connected",
        activeFolder: getActiveFolderDisplay(effectiveConfig),
        mode: "sharepoint"
      };
    } catch (error) {
      const denied = isAccessDenied(error);

      return {
        available: false,
        message: denied
          ? "You do not currently have access to this SharePoint folder."
          : `The configured SharePoint folder could not be accessed with your current permissions. ${cleanError(error)}`,
        activeFolder: getActiveFolderDisplay(effectiveConfig),
        mode: denied ? "access_denied" : "unavailable"
      };
    }
  }

  if (allowMockDocuments()) {
    const mockStatus = await checkMockDocumentsAccess();
    if (mockStatus.available) {
      return mockStatus;
    }
  }

  return {
    available: false,
    message: "SharePoint folder not accessible",
    activeFolder: getActiveFolderDisplay(effectiveConfig),
    mode: "unavailable"
  };
}

export async function getDocumentSourceStatus(
  config?: SharePointConfig,
  options?: SharePointAccessOptions
): Promise<DocumentSourceStatus> {
  const status = await checkSharePointAccess(config, options);

  if (status.mode === "sharepoint") {
    const effectiveConfig = config || (await loadSharePointConfig());
    const graphFiles = await listSharePointDocuments(effectiveConfig, {
      accessToken: options?.accessToken,
      metadataOnly: true
    });

    return {
      activeSource: "GRAPH_SHAREPOINT",
      available: true,
      displayName: "SharePoint folder",
      folderUrl: getActiveFolderDisplay(effectiveConfig) || null,
      folderPath: effectiveConfig.folderPath,
      configuredSharePointFolderUrl: getActiveFolderDisplay(effectiveConfig) || null,
      configuredSharePointFolderPath: effectiveConfig.folderPath,
      fileCount: graphFiles.length,
      skippedFileCount: 0,
      indexedCount: graphFiles.length,
      skippedCount: 0,
      supportedExtensions: [...READABLE_EXTENSIONS].sort(),
      lastIndexedAt: new Date().toISOString(),
      indexedFiles: graphFiles.map((file) => ({
        id: file.id || file.relativePath || file.fileName,
        fileName: file.fileName,
        relativePath: file.relativePath || file.fileName,
        absolutePath: file.webUrl || "",
        extension: file.extension || path.extname(file.fileName).toLowerCase(),
        path: file.webUrl || file.sourcePath,
        size: file.metadata?.size || 0,
        lastModified: file.metadata?.lastModified || "",
        sourceType: "GRAPH_SHAREPOINT" as const,
        metadata: {
          size: file.metadata?.size || 0,
          lastModified: file.metadata?.lastModified || "",
          pageCount: file.metadata?.pageCount
        }
      })),
      skippedFiles: [],
      message: "SharePoint folder connected"
    };
  }

  if (status.mode === "mock") {
    const effectiveConfig = config || (await loadSharePointConfig());
    const localStatus = await getLocalDocumentIndexStatus({ force: true });
    return {
      activeSource: localStatus.activeSource,
      available: localStatus.available,
      displayName:
        localStatus.activeSource === "LOCAL_SYNCED_FOLDER"
          ? "Local synced documents"
          : "Local documents",
      folderUrl: null,
      folderPath: localStatus.folderPath,
      configuredSharePointFolderUrl: getActiveFolderDisplay(effectiveConfig) || null,
      configuredSharePointFolderPath: effectiveConfig.folderPath,
      fileCount: localStatus.fileCount,
      skippedFileCount: localStatus.skippedFileCount,
      indexedCount: localStatus.indexedCount,
      skippedCount: localStatus.skippedCount,
      recursive: localStatus.recursive,
      maxDepth: localStatus.maxDepth,
      supportedExtensions: localStatus.supportedExtensions,
      lastIndexedAt: localStatus.lastIndexedAt,
      indexedFiles: localStatus.indexedFiles,
      skippedFiles: localStatus.skippedFiles,
      message: status.message.includes("SharePoint unavailable")
        ? status.message
        : localStatus.message
    };
  }

  return {
    activeSource: "NONE",
    available: false,
    displayName: "No document source",
    folderUrl: null,
    folderPath: status.activeFolder || "",
    configuredSharePointFolderUrl: status.activeFolder || null,
    configuredSharePointFolderPath: (config || (await loadSharePointConfig())).folderPath,
    message: status.message || "No document source is currently available."
  };
}

export async function listApprovedDocuments(
  config?: SharePointConfig,
  options?: SharePointAccessOptions
): Promise<ApprovedDocument[]> {
  const effectiveConfig = config || (await loadSharePointConfig());

  if (hasCompleteSharePointCredentials(effectiveConfig)) {
    if (!options?.accessToken) {
      return [];
    }

    return listSharePointDocuments(effectiveConfig, {
      accessToken: options.accessToken,
      metadataOnly: options.metadataOnly
    });
  }

  if (allowMockDocuments()) {
    return getLocalApprovedDocuments({ force: options?.forceRefresh ?? true });
  }

  return [];
}

async function checkMockDocumentsAccess(): Promise<SharePointStatus> {
  const status = await getLocalDocumentIndexStatus({ force: true });

  if (status.available) {
    return {
      available: true,
      message: status.message,
      activeFolder: status.folderPath,
      mode: "mock"
    };
  }

  return {
    available: false,
    message: status.message,
    activeFolder: status.folderPath,
    mode: "unavailable"
  };
}

async function listSharePointDocuments(
  config: SharePointConfig,
  options: SharePointAccessOptions
): Promise<ApprovedDocument[]> {
  if (!options.accessToken) {
    throw new Error("Microsoft sign-in is required to access the configured SharePoint folder.");
  }

  const token = options.accessToken;
  const site = await getGraphSite(config, token);
  const drive = await getGraphDrive(site.id, config, token);
  const children = await getGraphFolderChildren(drive.id, config, token);
  const readableFiles = children.filter((item) => {
    const extension = path.extname(item.name).toLowerCase();
    // Only direct files in the configured folder are approved. Nested folders are ignored.
    return item.file && READABLE_EXTENSIONS.has(extension);
  });

  if (options.metadataOnly) {
    return readableFiles.slice(0, MAX_SHAREPOINT_DOCUMENTS).map((item) =>
      toApprovedGraphDocument(config, item, "")
    );
  }

  const documents: ApprovedDocument[] = [];
  for (const item of readableFiles.slice(0, MAX_SHAREPOINT_DOCUMENTS)) {
    const downloadUrl = item["@microsoft.graph.downloadUrl"];
    if (!downloadUrl) {
      continue;
    }

    const content = await fetchDocumentContent(downloadUrl, token, path.extname(item.name).toLowerCase());
    if (!content.text) {
      continue;
    }

    documents.push(toApprovedGraphDocument(config, item, content.text, content.metadata));
  }

  return documents;
}

async function getGraphSite(config: SharePointConfig, token: string): Promise<GraphSiteResponse> {
  const siteUrl = new URL(config.siteUrl);
  const sitePath = siteUrl.pathname.replace(/\/+$/, "");
  const endpoint = `https://graph.microsoft.com/v1.0/sites/${siteUrl.hostname}:${sitePath}`;
  return fetchGraphJson<GraphSiteResponse>(endpoint, token);
}

async function getGraphDrive(
  siteId: string,
  config: SharePointConfig,
  token: string
): Promise<GraphDriveResponse> {
  if (!config.documentLibraryName) {
    return fetchGraphJson<GraphDriveResponse>(
      `https://graph.microsoft.com/v1.0/sites/${encodeURIComponent(siteId)}/drive`,
      token
    );
  }

  const drives = await fetchGraphJson<{ value?: GraphDriveResponse[] }>(
    `https://graph.microsoft.com/v1.0/sites/${encodeURIComponent(siteId)}/drives`,
    token
  );
  const drive = drives.value?.find(
    (candidate) => candidate.name?.toLowerCase() === config.documentLibraryName?.toLowerCase()
  );

  if (!drive) {
    throw new Error("Configured document library was not found.");
  }

  return drive;
}

async function getGraphFolderChildren(
  driveId: string,
  config: SharePointConfig,
  token: string
): Promise<GraphDriveItem[]> {
  const folderPath = normalizeFolderPath(config);
  const encodedPath = folderPath
    .split("/")
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join("/");
  let endpoint = encodedPath
    ? `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(driveId)}/root:/${encodedPath}:/children`
    : `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(driveId)}/root/children`;

  const items: GraphDriveItem[] = [];
  while (endpoint && items.length < MAX_SHAREPOINT_DOCUMENTS) {
    const page = await fetchGraphJson<GraphChildrenResponse>(endpoint, token);
    items.push(...(page.value || []));
    endpoint = page["@odata.nextLink"] || "";
  }

  return items.slice(0, MAX_SHAREPOINT_DOCUMENTS);
}

function toApprovedGraphDocument(
  config: SharePointConfig,
  item: GraphDriveItem,
  content: string,
  metadata?: ApprovedDocument["metadata"]
): ApprovedDocument {
  const extension = path.extname(item.name).toLowerCase();

  return {
    id: item.id,
    fileName: item.name,
    relativePath: item.name,
    extension,
    content: content.slice(0, MAX_DOCUMENT_BYTES),
    sourcePath: getActiveFolderDisplay(config),
    webUrl: item.webUrl,
    sourceType: "GRAPH_SHAREPOINT",
    metadata: {
      size: item.size,
      lastModified: item.lastModifiedDateTime,
      ...metadata
    }
  };
}

async function fetchDocumentContent(
  downloadUrl: string,
  token: string,
  extension: string
): Promise<{ text: string; metadata?: ApprovedDocument["metadata"] }> {
  const response = await fetchWithTimeout(downloadUrl, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (!response.ok) {
    throw new Error(`Unable to download document content: ${response.status}.`);
  }

  if (extension === ".pdf") {
    try {
      const bytes = Buffer.from(await response.arrayBuffer());
      const pdf = await extractPdfTextFromBuffer(bytes);

      if (!pdf.text) {
        return { text: "" };
      }

      return {
        text: pdf.text,
        metadata: pdf.metadata
      };
    } catch {
      return { text: "" };
    }
  }

  return { text: await response.text() };
}

async function fetchGraphJson<T>(url: string, token: string): Promise<T> {
  const response = await fetchWithTimeout(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new GraphFetchError(`Microsoft Graph returned ${response.status}.`, response.status);
  }

  return response.json() as Promise<T>;
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GRAPH_TIMEOUT_MS);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeFolderPath(config: SharePointConfig): string {
  let folderPath = config.folderPath;

  if (isHttpUrl(folderPath)) {
    const folderUrl = new URL(folderPath);
    const siteUrl = new URL(config.siteUrl);
    folderPath = decodeURIComponent(folderUrl.pathname);
    const sitePath = decodeURIComponent(siteUrl.pathname).replace(/\/+$/, "");
    if (folderPath.startsWith(sitePath)) {
      folderPath = folderPath.slice(sitePath.length);
    }
  }

  folderPath = folderPath.replace(/^\/+|\/+$/g, "");

  const libraryNames = [
    config.documentLibraryName,
    "Shared Documents",
    "Documents",
    "Documentos compartidos"
  ].filter(Boolean) as string[];

  for (const libraryName of libraryNames) {
    const normalizedLibrary = libraryName.replace(/^\/+|\/+$/g, "").toLowerCase();
    if (folderPath.toLowerCase() === normalizedLibrary) {
      return "";
    }

    if (folderPath.toLowerCase().startsWith(`${normalizedLibrary}/`)) {
      return folderPath.slice(libraryName.length + 1);
    }
  }

  return folderPath;
}

function allowMockDocuments(): boolean {
  return process.env.ALLOW_MOCK_DOCUMENTS !== "false";
}

function cleanError(error: unknown): string {
  if (error instanceof Error) {
    return error.message.replace(/client_secret=[^&\s]+/gi, "client_secret=REDACTED");
  }

  return "Unknown error.";
}

function isAccessDenied(error: unknown): boolean {
  return error instanceof GraphFetchError && (error.status === 401 || error.status === 403);
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}
