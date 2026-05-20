import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  configDirectory,
  defaultDocumentsDirectory,
  documentSourceConfigPath,
  getProjectRoot,
  uploadedDocumentsDirectory
} from "@/lib/paths";
import type { ActiveDocumentSourceType, DocumentSourceConfig, DocumentSourceType } from "@/types/document";

const activeSourceModes = ["LOCAL_FOLDER", "SYNCED_SHAREPOINT_FOLDER", "MANUAL_UPLOAD"] as const;
const allSourceModes = [...activeSourceModes, "GRAPH_SHAREPOINT", "NONE"] as const;

const configSchema = z.object({
  mode: z.enum(allSourceModes).optional().default("LOCAL_FOLDER"),
  localFolderPath: z.string().trim().max(2000).optional().default(""),
  syncedFolderPath: z.string().trim().max(2000).optional().default(""),
  updatedAt: z.string().optional()
});

export const defaultDocumentSourceConfig: DocumentSourceConfig = {
  mode: "LOCAL_FOLDER",
  localFolderPath: defaultDocumentsDirectory,
  syncedFolderPath: "",
  updatedAt: ""
};

export async function loadDocumentSourceConfig(): Promise<DocumentSourceConfig> {
  if (process.env.DOCUMENT_SOURCE_DISABLE_LOCAL_CONFIG === "true") {
    return normalizeDocumentSourceConfig(readEnvironmentDefaults());
  }

  const fromFile = await readDocumentSourceConfigFile();

  if (fromFile) {
    return normalizeDocumentSourceConfig(fromFile);
  }

  return normalizeDocumentSourceConfig(readEnvironmentDefaults());
}

export async function saveDocumentSourceConfig(input: unknown): Promise<DocumentSourceConfig> {
  const existing = await loadDocumentSourceConfigFromFile();
  const parsed = configSchema.parse(input);
  const next = normalizeDocumentSourceConfig({
    ...existing,
    ...parsed,
    updatedAt: new Date().toISOString()
  });

  await fs.mkdir(configDirectory, { recursive: true });
  await fs.writeFile(documentSourceConfigPath, `${JSON.stringify(next, null, 2)}\n`, {
    mode: 0o600
  });

  return next;
}

export async function getActiveDocumentSourceConfig(): Promise<{
  mode: ActiveDocumentSourceType;
  folderPath: string;
  displayName: string;
}> {
  const config = await loadDocumentSourceConfig();

  if (config.mode === "SYNCED_SHAREPOINT_FOLDER") {
    return {
      mode: "SYNCED_SHAREPOINT_FOLDER",
      folderPath: config.syncedFolderPath || config.localFolderPath,
      displayName: "Synced SharePoint Folder"
    };
  }

  if (config.mode === "MANUAL_UPLOAD") {
    return {
      mode: "MANUAL_UPLOAD",
      folderPath: uploadedDocumentsDirectory,
      displayName: "Manual Upload"
    };
  }

  return {
    mode: "LOCAL_FOLDER",
    folderPath: config.localFolderPath || defaultDocumentsDirectory,
    displayName: "Local Folder"
  };
}

export function isGraphSharePointEnabled(): boolean {
  return process.env.ENABLE_MSAL_SHAREPOINT === "true";
}

export function isSupportedActiveDocumentSourceMode(
  mode: DocumentSourceType
): mode is ActiveDocumentSourceType {
  return activeSourceModes.includes(mode as ActiveDocumentSourceType);
}

async function loadDocumentSourceConfigFromFile(): Promise<DocumentSourceConfig> {
  return (await readDocumentSourceConfigFile()) || defaultDocumentSourceConfig;
}

async function readDocumentSourceConfigFile(): Promise<DocumentSourceConfig | null> {
  try {
    const raw = await fs.readFile(documentSourceConfigPath, "utf8");
    return normalizeDocumentSourceConfig(JSON.parse(raw));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }

    throw new Error("Document source configuration is invalid.");
  }
}

function readEnvironmentDefaults(): DocumentSourceConfig {
  return {
    mode: (process.env.DOCUMENT_SOURCE_MODE || "LOCAL_FOLDER") as DocumentSourceType,
    localFolderPath: process.env.LOCAL_DOCUMENTS_PATH || defaultDocumentsDirectory,
    syncedFolderPath: process.env.SYNCED_SHAREPOINT_FOLDER_PATH || "",
    updatedAt: ""
  };
}

function normalizeDocumentSourceConfig(input: unknown): DocumentSourceConfig {
  const parsed = configSchema.parse(input);
  let mode = parsed.mode;

  if (mode === "GRAPH_SHAREPOINT" && !isGraphSharePointEnabled()) {
    mode = "LOCAL_FOLDER";
  }

  if (mode === "NONE") {
    mode = "LOCAL_FOLDER";
  }

  return {
    mode,
    localFolderPath: resolveConfiguredFolder(parsed.localFolderPath || defaultDocumentsDirectory),
    syncedFolderPath: parsed.syncedFolderPath
      ? resolveConfiguredFolder(parsed.syncedFolderPath)
      : "",
    updatedAt: parsed.updatedAt || ""
  };
}

function resolveConfiguredFolder(value: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    return defaultDocumentsDirectory;
  }

  if (path.isAbsolute(trimmed)) {
    return path.resolve(trimmed);
  }

  return path.resolve(getProjectRoot(), trimmed);
}
