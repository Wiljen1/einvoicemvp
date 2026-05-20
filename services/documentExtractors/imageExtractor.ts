import fs from "node:fs/promises";
import path from "node:path";

export interface ImageExtractionInput {
  filePath: string;
  fileName: string;
  relativePath: string;
}

export async function extractImageMetadata(input: ImageExtractionInput): Promise<{
  text: string;
  metadata: {
    width?: number;
    height?: number;
  };
}> {
  const dimensions = await readPngDimensions(input.filePath);
  const folder = path.dirname(input.relativePath) === "." ? "Root" : path.dirname(input.relativePath);
  const metadataText =
    dimensions.width && dimensions.height
      ? `Dimensions: ${dimensions.width} x ${dimensions.height}`
      : "";

  return {
    text: [
      `Image asset: ${stripExtension(input.fileName)}`,
      `File: ${input.fileName}`,
      `Path: ${input.relativePath}`,
      `Folder: ${folder}`,
      metadataText,
      "TODO: add OCR and thumbnail previews for image assets."
    ]
      .filter(Boolean)
      .join("\n"),
    metadata: dimensions
  };
}

async function readPngDimensions(filePath: string): Promise<{ width?: number; height?: number }> {
  const handle = await fs.open(filePath, "r");

  try {
    const buffer = Buffer.alloc(24);
    await handle.read(buffer, 0, 24, 0);

    if (buffer.toString("ascii", 1, 4) !== "PNG") {
      return {};
    }

    return {
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20)
    };
  } catch {
    return {};
  } finally {
    await handle.close();
  }
}

function stripExtension(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "");
}
