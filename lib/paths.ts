import path from "node:path";

export function getProjectRoot(): string {
  return path.resolve(/* turbopackIgnore: true */ process.cwd());
}

export function getLocalDocumentsPath(): string {
  const configuredPath = process.env.LOCAL_DOCUMENTS_PATH?.trim();
  const projectRootPath = getProjectRoot();

  if (!configuredPath) {
    return path.join(projectRootPath, "documents");
  }

  if (path.isAbsolute(configuredPath)) {
    return path.resolve(configuredPath);
  }

  return resolveInside(projectRootPath, configuredPath);
}

export const projectRoot = getProjectRoot();
export const configDirectory = path.join(projectRoot, "config");
export const guardrailsConfigPath = path.join(configDirectory, "guardrails.json");
export const documentSourceConfigPath = path.join(configDirectory, "document-source.config.json");
export const defaultDocumentsDirectory = path.join(projectRoot, "documents");
export const uploadedDocumentsDirectory = path.join(projectRoot, "uploaded-documents");
export const artifactsDirectory = path.join(projectRoot, "artifacts");
export const codexOperatorsDirectory = path.join(artifactsDirectory, "codex-operators");
export const cacheDirectory = path.join(artifactsDirectory, "cache");
export const dataDirectory = path.join(projectRoot, "data");
export const indexDatabasePath = getIndexDatabasePath();

export function getIndexDatabasePath(): string {
  return process.env.INDEX_DATABASE_PATH || path.join(dataDirectory, "knowledge-index.sqlite");
}

export function resolveInside(baseDirectory: string, requestedPath: string): string {
  const resolvedBase = path.resolve(baseDirectory);
  const resolvedPath = path.resolve(resolvedBase, requestedPath);

  if (resolvedPath !== resolvedBase && !resolvedPath.startsWith(`${resolvedBase}${path.sep}`)) {
    throw new Error("Path escapes the approved directory.");
  }

  return resolvedPath;
}
