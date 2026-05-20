import fs from "node:fs/promises";
import path from "node:path";
import { runImageOcr } from "@/services/ocrService";

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
    ocrAttempted?: boolean;
    ocrProcessed?: boolean;
    ocrFailureReason?: string;
    extractionWarnings?: string[];
  };
}> {
  const stats = await fs.stat(input.filePath);
  const dimensions = await readImageDimensions(input.filePath);
  const ocr = await runImageOcr(input.filePath, stats.size);
  const folder = path.dirname(input.relativePath) === "." ? "Root" : path.dirname(input.relativePath);
  const metadataText =
    dimensions.width && dimensions.height
      ? `Dimensions: ${dimensions.width} x ${dimensions.height}`
      : "";
  const ocrText = ocr.text ? `OCR text: ${ocr.text}` : "";
  const warning = ocr.reason && !ocr.processed ? ocr.reason : "";

  return {
    text: [
      `Image asset: ${stripExtension(input.fileName)}`,
      `File: ${input.fileName}`,
      `Path: ${input.relativePath}`,
      `Folder: ${folder}`,
      metadataText,
      ocrText,
      warning ? `OCR note: ${warning}` : "",
      "TODO: add thumbnail previews for image assets."
    ]
      .filter(Boolean)
      .join("\n"),
    metadata: {
      ...dimensions,
      ocrAttempted: ocr.attempted,
      ocrProcessed: ocr.processed,
      ocrFailureReason: ocr.processed ? undefined : ocr.reason,
      extractionWarnings: warning ? [warning] : undefined
    }
  };
}

async function readImageDimensions(filePath: string): Promise<{ width?: number; height?: number }> {
  const extension = path.extname(filePath).toLowerCase();

  if (extension === ".jpg" || extension === ".jpeg") {
    return readJpegDimensions(filePath);
  }

  return readPngDimensions(filePath);
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

async function readJpegDimensions(filePath: string): Promise<{ width?: number; height?: number }> {
  const buffer = await fs.readFile(filePath);

  if (buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    return {};
  }

  let offset = 2;
  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = buffer[offset + 1];
    const length = buffer.readUInt16BE(offset + 2);
    if (marker >= 0xc0 && marker <= 0xc3) {
      return {
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7)
      };
    }

    offset += 2 + length;
  }

  return {};
}

function stripExtension(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "");
}
