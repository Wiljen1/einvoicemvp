import fs from "node:fs/promises";
import { z } from "zod";
import { configDirectory, sharePointConfigPath } from "@/lib/paths";
import type { PublicSharePointConfig, SharePointConfig } from "@/types/sharepoint";

const optionalString = z
  .string()
  .trim()
  .max(2000)
  .optional()
  .default("");

const secretString = z
  .string()
  .max(4096)
  .optional()
  .default("");

const sharePointConfigSchema = z.object({
  siteUrl: optionalString,
  folderPath: optionalString,
  folderUrl: optionalString,
  localFolderPath: optionalString,
  tenantId: optionalString,
  clientId: optionalString,
  clientSecret: secretString,
  documentLibraryName: optionalString,
  lastConnectionStatus: optionalString,
  lastCheckedAt: z.string().optional(),
  updatedAt: z.string().optional()
});

export const testSharePointFolderUrl =
  "https://oracle.sharepoint.com/sites/netsuite-suitesuccess-published-assets/SuiteSuccess%20Assets/Forms/AllItems.aspx?FolderCTID=0x012000FBD7834DB23C304CA88C2ABEE32E392F&id=%2Fsites%2Fnetsuite%2Dsuitesuccess%2Dpublished%2Dassets%2FSuiteSuccess%20Assets%2FElectronic%20Invoicing";

export const emptySharePointConfig: SharePointConfig = {
  siteUrl: "",
  folderPath: "",
  folderUrl: "",
  localFolderPath: "",
  tenantId: "",
  clientId: "",
  clientSecret: "",
  documentLibraryName: "",
  lastConnectionStatus: "",
  lastCheckedAt: ""
};

export async function loadSharePointConfig(): Promise<SharePointConfig> {
  const fromFile =
    process.env.SHAREPOINT_DISABLE_LOCAL_CONFIG === "true"
      ? emptySharePointConfig
      : await loadSharePointConfigFromFile();

  return sanitizeSharePointConfig({
    siteUrl: fromFile.siteUrl || process.env.SHAREPOINT_SITE_URL || "",
    folderPath: fromFile.folderPath || fromFile.folderUrl || process.env.SHAREPOINT_FOLDER_PATH || "",
    folderUrl: fromFile.folderUrl || "",
    localFolderPath: fromFile.localFolderPath || process.env.SHAREPOINT_LOCAL_FOLDER_PATH || "",
    tenantId: fromFile.tenantId || process.env.SHAREPOINT_TENANT_ID || "",
    clientId: fromFile.clientId || process.env.SHAREPOINT_CLIENT_ID || "",
    clientSecret: fromFile.clientSecret || process.env.SHAREPOINT_CLIENT_SECRET || "",
    documentLibraryName:
      fromFile.documentLibraryName || process.env.SHAREPOINT_DOCUMENT_LIBRARY_NAME || "",
    lastConnectionStatus: fromFile.lastConnectionStatus || "",
    lastCheckedAt: fromFile.lastCheckedAt || "",
    updatedAt: fromFile.updatedAt
  });
}

export async function saveSharePointConfig(input: unknown): Promise<SharePointConfig> {
  const existing = await loadSharePointConfigFromFile();
  const next = mergeSharePointConfigInput(existing, input, true);

  validateSharePointUrls(next);
  await fs.mkdir(configDirectory, { recursive: true });
  await fs.writeFile(sharePointConfigPath, `${JSON.stringify(next, null, 2)}\n`, {
    mode: 0o600
  });

  return next;
}

export async function updateSharePointConnectionMetadata(input: {
  status: string;
  checkedAt?: string;
}): Promise<SharePointConfig> {
  const existing = await loadSharePointConfigFromFile();
  const next = sanitizeSharePointConfig({
    ...existing,
    lastConnectionStatus: input.status,
    lastCheckedAt: input.checkedAt || new Date().toISOString()
  });

  await fs.mkdir(configDirectory, { recursive: true });
  await fs.writeFile(sharePointConfigPath, `${JSON.stringify(next, null, 2)}\n`, {
    mode: 0o600
  });

  return next;
}

export async function buildDraftSharePointConfig(input: unknown): Promise<SharePointConfig> {
  const existing = await loadSharePointConfig();
  const draft = mergeSharePointConfigInput(existing, input, false);
  validateSharePointUrls(draft);
  return draft;
}

export function toPublicSharePointConfig(config: SharePointConfig): PublicSharePointConfig {
  const normalized = normalizeSharePointConfig(config);

  return {
    siteUrl: normalized.siteUrl,
    folderPath: normalized.folderPath,
    folderUrl: normalized.folderUrl || "",
    localFolderPath: normalized.localFolderPath || "",
    tenantId: normalized.tenantId,
    clientId: normalized.clientId,
    clientSecretConfigured: Boolean(normalized.clientSecret),
    clientSecretMasked: config.clientSecret ? "********" : "",
    documentLibraryName: normalized.documentLibraryName || "",
    activeFolder: getActiveFolderDisplay(normalized),
    lastConnectionStatus: normalized.lastConnectionStatus || "",
    lastCheckedAt: normalized.lastCheckedAt || ""
  };
}

export function hasCompleteSharePointCredentials(config: SharePointConfig): boolean {
  const normalized = normalizeSharePointConfig(config);
  return Boolean(
    normalized.siteUrl &&
      normalized.folderPath &&
      normalized.tenantId &&
      normalized.clientId &&
      normalized.clientSecret
  );
}

export function hasConfiguredSharePointFolder(config: SharePointConfig): boolean {
  const normalized = normalizeSharePointConfig(config);
  return Boolean(normalized.siteUrl && (normalized.folderUrl || normalized.folderPath));
}

export function getActiveFolderDisplay(config: SharePointConfig): string {
  const normalized = normalizeSharePointConfig(config);

  if (normalized.folderUrl) {
    return normalized.folderUrl;
  }

  if (!normalized.siteUrl && !normalized.folderPath) {
    return "";
  }

  if (isHttpUrl(normalized.folderPath)) {
    return normalized.folderPath;
  }

  const siteUrl = normalized.siteUrl.replace(/\/+$/, "");
  const folderPath = normalized.folderPath.replace(/^\/+/, "");

  return [siteUrl, folderPath].filter(Boolean).join("/");
}

async function loadSharePointConfigFromFile(): Promise<SharePointConfig> {
  try {
    const raw = await fs.readFile(sharePointConfigPath, "utf8");
    return sanitizeSharePointConfig(JSON.parse(raw));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return emptySharePointConfig;
    }

    throw new Error("SharePoint configuration is invalid.");
  }
}

function sanitizeSharePointConfig(input: unknown): SharePointConfig {
  const parsed = sharePointConfigSchema.parse(input);

  return normalizeSharePointConfig({
    siteUrl: parsed.siteUrl,
    folderPath: parsed.folderPath || parsed.folderUrl,
    folderUrl: parsed.folderUrl || "",
    localFolderPath: parsed.localFolderPath,
    tenantId: parsed.tenantId,
    clientId: parsed.clientId,
    clientSecret: parsed.clientSecret,
    documentLibraryName: parsed.documentLibraryName,
    lastConnectionStatus: parsed.lastConnectionStatus,
    lastCheckedAt: parsed.lastCheckedAt,
    updatedAt: parsed.updatedAt
  });
}

function mergeSharePointConfigInput(
  existing: SharePointConfig,
  input: unknown,
  includeUpdatedAt: boolean
): SharePointConfig {
  const parsed = sharePointConfigSchema.parse(input);
  const keepExistingSecret =
    parsed.clientSecret === "" || parsed.clientSecret === "********" || parsed.clientSecret === "••••••••";

  return sanitizeSharePointConfig({
    ...existing,
    ...parsed,
    clientSecret: keepExistingSecret ? existing.clientSecret : parsed.clientSecret,
    updatedAt: includeUpdatedAt ? new Date().toISOString() : existing.updatedAt
  });
}

function validateSharePointUrls(config: SharePointConfig): void {
  if (config.siteUrl && !isHttpUrl(config.siteUrl)) {
    throw new Error("SharePoint Site URL must be a valid http or https URL.");
  }

  if (config.folderPath && isProbablyUrl(config.folderPath) && !isHttpUrl(config.folderPath)) {
    throw new Error("SharePoint Folder URL must be a valid http or https URL.");
  }

  if (config.folderUrl && !isHttpUrl(config.folderUrl)) {
    throw new Error("SharePoint Folder URL must be a valid http or https URL.");
  }
}

function isProbablyUrl(value: string): boolean {
  return /^[a-z][a-z\d+\-.]*:/i.test(value);
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function normalizeSharePointConfig(config: SharePointConfig): SharePointConfig {
  const folderUrlCandidate = [config.folderUrl, config.folderPath, config.siteUrl].find((value) =>
    value ? isHttpUrl(value) && isSharePointFolderUrl(value) : false
  );
  const parsedFolder = folderUrlCandidate
    ? parseSharePointFolderUrl(folderUrlCandidate, config)
    : null;

  return {
    ...config,
    siteUrl: parsedFolder?.siteUrl || config.siteUrl,
    folderPath: parsedFolder?.folderPath || config.folderPath || config.folderUrl || "",
    folderUrl: parsedFolder?.folderUrl || config.folderUrl || (isHttpUrl(config.folderPath) ? config.folderPath : ""),
    localFolderPath: config.localFolderPath || "",
    documentLibraryName:
      parsedFolder?.documentLibraryName || config.documentLibraryName || "",
    lastConnectionStatus: config.lastConnectionStatus || "",
    lastCheckedAt: config.lastCheckedAt || ""
  };
}

function parseSharePointFolderUrl(
  folderUrl: string,
  config: SharePointConfig
): Pick<SharePointConfig, "siteUrl" | "folderPath" | "folderUrl" | "documentLibraryName"> | null {
  try {
    const url = new URL(folderUrl);
    const serverRelativeFolder = getServerRelativeFolderPath(url);
    const sitePath = getSharePointSitePath(serverRelativeFolder || url.pathname);

    if (!sitePath) {
      return null;
    }

    const decodedSitePath = decodeURIComponent(sitePath);
    const decodedFolderPath = decodeURIComponent(serverRelativeFolder || url.pathname);
    const folderRemainder = decodedFolderPath
      .replace(decodedSitePath, "")
      .replace(/^\/+/, "")
      .replace(/\/Forms\/AllItems\.aspx$/i, "");
    const pathSegments = folderRemainder.split("/").filter(Boolean);
    const documentLibraryName = pathSegments[0] || config.documentLibraryName || "";
    const folderPath = pathSegments.join("/");

    return {
      siteUrl: `${url.origin}${decodedSitePath}`,
      folderPath,
      folderUrl,
      documentLibraryName
    };
  } catch {
    return null;
  }
}

function getServerRelativeFolderPath(url: URL): string {
  const id = url.searchParams.get("id");
  if (id) {
    return id;
  }

  const rootFolder = url.searchParams.get("RootFolder");
  if (rootFolder) {
    return rootFolder;
  }

  return decodeURIComponent(url.pathname);
}

function getSharePointSitePath(serverRelativePath: string): string {
  const decoded = decodeURIComponent(serverRelativePath);
  const parts = decoded.split("/").filter(Boolean);
  const prefixIndex = parts.findIndex((part) => part === "sites" || part === "teams");

  if (prefixIndex === -1 || !parts[prefixIndex + 1]) {
    return "";
  }

  return `/${parts[prefixIndex]}/${parts[prefixIndex + 1]}`;
}

function isSharePointFolderUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.hostname.includes("sharepoint.com") &&
      (url.searchParams.has("id") ||
        url.searchParams.has("RootFolder") ||
        /\/Forms\/AllItems\.aspx$/i.test(url.pathname))
    );
  } catch {
    return false;
  }
}
