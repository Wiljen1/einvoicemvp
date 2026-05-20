import fs from "node:fs/promises";
import path from "node:path";
import { defaultDocumentsDirectory, resolveInside } from "@/lib/paths";
import type { ApprovedDocument } from "@/types/document";
import type { SharePointConfig, SharePointStatus } from "@/types/sharepoint";
import {
  getActiveFolderDisplay,
  hasCompleteSharePointCredentials,
  loadSharePointConfig
} from "./sharepointConfigService";

const READABLE_EXTENSIONS = new Set([".txt", ".md", ".markdown", ".csv", ".json"]);
const MAX_DOCUMENTS = 50;
const MAX_DOCUMENT_BYTES = 250_000;
const GRAPH_TIMEOUT_MS = 10_000;

interface GraphTokenResponse {
  access_token?: string;
}

interface GraphSiteResponse {
  id: string;
}

interface GraphDriveResponse {
  id: string;
  name?: string;
}

interface GraphDriveItem {
  name: string;
  file?: unknown;
  folder?: unknown;
  webUrl?: string;
  "@microsoft.graph.downloadUrl"?: string;
}

interface GraphChildrenResponse {
  value?: GraphDriveItem[];
  "@odata.nextLink"?: string;
}

export async function checkSharePointAccess(config?: SharePointConfig): Promise<SharePointStatus> {
  const effectiveConfig = config || (await loadSharePointConfig());

  if (hasCompleteSharePointCredentials(effectiveConfig)) {
    try {
      await listSharePointDocuments(effectiveConfig, { metadataOnly: true });
      return {
        available: true,
        message: "SharePoint folder connected",
        activeFolder: getActiveFolderDisplay(effectiveConfig),
        mode: "sharepoint"
      };
    } catch (error) {
      return {
        available: false,
        message: `Unable to access SharePoint folder: ${cleanError(error)}`,
        activeFolder: getActiveFolderDisplay(effectiveConfig),
        mode: "unavailable"
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

export async function listApprovedDocuments(config?: SharePointConfig): Promise<ApprovedDocument[]> {
  const effectiveConfig = config || (await loadSharePointConfig());

  if (hasCompleteSharePointCredentials(effectiveConfig)) {
    return listSharePointDocuments(effectiveConfig);
  }

  if (allowMockDocuments()) {
    return listMockDocuments();
  }

  return [];
}

async function checkMockDocumentsAccess(): Promise<SharePointStatus> {
  try {
    const stats = await fs.stat(defaultDocumentsDirectory);
    if (!stats.isDirectory()) {
      throw new Error("Mock documents path is not a directory.");
    }

    return {
      available: true,
      message: "Local approved mock folder connected",
      activeFolder: defaultDocumentsDirectory,
      mode: "mock"
    };
  } catch {
    return {
      available: false,
      message: "SharePoint folder not accessible",
      activeFolder: defaultDocumentsDirectory,
      mode: "unavailable"
    };
  }
}

async function listMockDocuments(): Promise<ApprovedDocument[]> {
  const documents: ApprovedDocument[] = [];
  const queue = [defaultDocumentsDirectory];

  while (queue.length > 0 && documents.length < MAX_DOCUMENTS) {
    const currentDirectory = queue.shift() as string;
    const entries = await fs.readdir(currentDirectory, { withFileTypes: true });

    for (const entry of entries) {
      if (documents.length >= MAX_DOCUMENTS) {
        break;
      }

      const absolutePath = resolveInside(defaultDocumentsDirectory, path.relative(defaultDocumentsDirectory, path.join(currentDirectory, entry.name)));
      const stats = await fs.lstat(absolutePath);

      if (stats.isSymbolicLink()) {
        continue;
      }

      if (stats.isDirectory()) {
        queue.push(absolutePath);
        continue;
      }

      if (!stats.isFile() || stats.size > MAX_DOCUMENT_BYTES) {
        continue;
      }

      const extension = path.extname(entry.name).toLowerCase();
      if (!READABLE_EXTENSIONS.has(extension)) {
        continue;
      }

      documents.push({
        fileName: path.relative(defaultDocumentsDirectory, absolutePath),
        content: await fs.readFile(absolutePath, "utf8"),
        sourcePath: absolutePath
      });
    }
  }

  return documents;
}

async function listSharePointDocuments(
  config: SharePointConfig,
  options?: { metadataOnly?: boolean }
): Promise<ApprovedDocument[]> {
  const token = await getGraphAccessToken(config);
  const site = await getGraphSite(config, token);
  const drive = await getGraphDrive(site.id, config, token);
  const children = await getGraphFolderChildren(drive.id, config, token);
  const readableFiles = children.filter((item) => {
    const extension = path.extname(item.name).toLowerCase();
    return item.file && READABLE_EXTENSIONS.has(extension);
  });

  if (options?.metadataOnly) {
    return [];
  }

  const documents: ApprovedDocument[] = [];
  for (const item of readableFiles.slice(0, MAX_DOCUMENTS)) {
    const downloadUrl = item["@microsoft.graph.downloadUrl"];
    if (!downloadUrl) {
      continue;
    }

    const content = await fetchText(downloadUrl, token);
    documents.push({
      fileName: item.name,
      content: content.slice(0, MAX_DOCUMENT_BYTES),
      sourcePath: getActiveFolderDisplay(config),
      webUrl: item.webUrl
    });
  }

  return documents;
}

async function getGraphAccessToken(config: SharePointConfig): Promise<string> {
  const response = await fetchWithTimeout(
    `https://login.microsoftonline.com/${encodeURIComponent(config.tenantId)}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret || "",
        grant_type: "client_credentials",
        scope: "https://graph.microsoft.com/.default"
      })
    }
  );

  if (!response.ok) {
    throw new Error(`Microsoft identity returned ${response.status}.`);
  }

  const body = (await response.json()) as GraphTokenResponse;
  if (!body.access_token) {
    throw new Error("Microsoft identity did not return an access token.");
  }

  return body.access_token;
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
  while (endpoint && items.length < MAX_DOCUMENTS) {
    const page = await fetchGraphJson<GraphChildrenResponse>(endpoint, token);
    items.push(...(page.value || []));
    endpoint = page["@odata.nextLink"] || "";
  }

  return items.slice(0, MAX_DOCUMENTS);
}

async function fetchText(downloadUrl: string, token: string): Promise<string> {
  const response = await fetchWithTimeout(downloadUrl, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (!response.ok) {
    throw new Error(`Unable to download document content: ${response.status}.`);
  }

  return response.text();
}

async function fetchGraphJson<T>(url: string, token: string): Promise<T> {
  const response = await fetchWithTimeout(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`Microsoft Graph returned ${response.status}.`);
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

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}
