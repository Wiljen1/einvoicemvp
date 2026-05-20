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
  tenantId: optionalString,
  clientId: optionalString,
  clientSecret: secretString,
  documentLibraryName: optionalString,
  lastConnectionStatus: optionalString,
  lastCheckedAt: z.string().optional(),
  updatedAt: z.string().optional()
});

export const emptySharePointConfig: SharePointConfig = {
  siteUrl: "",
  folderPath: "",
  folderUrl: "",
  tenantId: "",
  clientId: "",
  clientSecret: "",
  documentLibraryName: "",
  lastConnectionStatus: "",
  lastCheckedAt: ""
};

export async function loadSharePointConfig(): Promise<SharePointConfig> {
  const fromFile = await loadSharePointConfigFromFile();

  return sanitizeSharePointConfig({
    siteUrl: fromFile.siteUrl || process.env.SHAREPOINT_SITE_URL || "",
    folderPath: fromFile.folderPath || fromFile.folderUrl || process.env.SHAREPOINT_FOLDER_PATH || "",
    folderUrl: fromFile.folderUrl || "",
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
  return {
    siteUrl: config.siteUrl,
    folderPath: config.folderPath,
    tenantId: config.tenantId,
    clientId: config.clientId,
    clientSecretConfigured: Boolean(config.clientSecret),
    clientSecretMasked: config.clientSecret ? "********" : "",
    documentLibraryName: config.documentLibraryName || "",
    activeFolder: getActiveFolderDisplay(config),
    lastConnectionStatus: config.lastConnectionStatus || "",
    lastCheckedAt: config.lastCheckedAt || ""
  };
}

export function hasCompleteSharePointCredentials(config: SharePointConfig): boolean {
  return Boolean(
    config.siteUrl &&
      config.folderPath &&
      config.tenantId &&
      config.clientId &&
      config.clientSecret
  );
}

export function getActiveFolderDisplay(config: SharePointConfig): string {
  if (!config.siteUrl && !config.folderPath) {
    return "";
  }

  if (isHttpUrl(config.folderPath)) {
    return config.folderPath;
  }

  const siteUrl = config.siteUrl.replace(/\/+$/, "");
  const folderPath = config.folderPath.replace(/^\/+/, "");

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

  return {
    siteUrl: parsed.siteUrl,
    folderPath: parsed.folderPath || parsed.folderUrl,
    folderUrl: parsed.folderUrl || "",
    tenantId: parsed.tenantId,
    clientId: parsed.clientId,
    clientSecret: parsed.clientSecret,
    documentLibraryName: parsed.documentLibraryName,
    lastConnectionStatus: parsed.lastConnectionStatus,
    lastCheckedAt: parsed.lastCheckedAt,
    updatedAt: parsed.updatedAt
  };
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
