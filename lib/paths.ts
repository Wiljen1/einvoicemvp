import path from "node:path";

export const projectRoot = process.cwd();
export const configDirectory = path.join(projectRoot, "config");
export const guardrailsConfigPath = path.join(configDirectory, "guardrails.json");
export const sharePointConfigPath = path.join(configDirectory, "sharepoint.config.json");
export const defaultDocumentsDirectory = path.join(projectRoot, "documents");
export const artifactsDirectory = path.join(projectRoot, "artifacts");
export const codexOperatorsDirectory = path.join(artifactsDirectory, "codex-operators");
export const cacheDirectory = path.join(artifactsDirectory, "cache");

export function resolveInside(baseDirectory: string, requestedPath: string): string {
  const resolvedBase = path.resolve(baseDirectory);
  const resolvedPath = path.resolve(resolvedBase, requestedPath);

  if (resolvedPath !== resolvedBase && !resolvedPath.startsWith(`${resolvedBase}${path.sep}`)) {
    throw new Error("Path escapes the approved directory.");
  }

  return resolvedPath;
}
