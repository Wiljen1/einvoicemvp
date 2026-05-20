import fs from "node:fs/promises";
import path from "node:path";

export interface UrlExtractionInput {
  filePath: string;
  fileName: string;
  relativePath: string;
}

export async function extractUrlFile(input: UrlExtractionInput): Promise<{
  text: string;
  metadata: {
    targetUrl?: string;
  };
}> {
  const raw = await fs.readFile(input.filePath, "utf8");
  const targetUrl = parseUrlTarget(raw);
  const folder = path.dirname(input.relativePath) === "." ? "Root" : path.dirname(input.relativePath);

  return {
    text: [
      `Reference link: ${stripExtension(input.fileName)}`,
      `File: ${input.fileName}`,
      `Path: ${input.relativePath}`,
      `Folder: ${folder}`,
      targetUrl ? `URL: ${targetUrl}` : "",
      "TODO: add safe internal-link validation and metadata refresh."
    ]
      .filter(Boolean)
      .join("\n"),
    metadata: {
      targetUrl
    }
  };
}

function parseUrlTarget(raw: string): string | undefined {
  const match = raw.match(/^URL=(.+)$/im);
  return match?.[1]?.trim();
}

function stripExtension(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "");
}
