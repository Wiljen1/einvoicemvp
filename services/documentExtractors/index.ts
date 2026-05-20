import fs from "node:fs/promises";
import path from "node:path";
import { extractPdfText } from "./pdfExtractor";

export interface ExtractedDocument {
  text: string;
  metadata: {
    extension: string;
    pageCount?: number;
  };
}

export interface SkippedExtraction {
  skipped: true;
  reason: string;
}

export type ExtractionResult = ExtractedDocument | SkippedExtraction;

const TEXT_EXTENSIONS = new Set([".txt", ".md", ".markdown", ".json", ".csv"]);
const SUPPORTED_EXTENSIONS = new Set([...TEXT_EXTENSIONS, ".pdf"]);

export function getSupportedExtractorExtensions(): string[] {
  return Array.from(SUPPORTED_EXTENSIONS).sort();
}

export async function extractTextFromFile(filePath: string): Promise<ExtractionResult> {
  const extension = path.extname(filePath).toLowerCase();

  if (TEXT_EXTENSIONS.has(extension)) {
    return {
      text: await fs.readFile(filePath, "utf8"),
      metadata: {
        extension
      }
    };
  }

  if (extension === ".pdf") {
    try {
      const extracted = await extractPdfText(filePath);

      if (!extracted.text.trim()) {
        return {
          skipped: true,
          reason: "PDF contains no extractable text or may be scanned."
        };
      }

      return {
        text: extracted.text,
        metadata: {
          extension,
          pageCount: extracted.metadata.pageCount
        }
      };
    } catch (error) {
      return {
        skipped: true,
        reason: `Unable to extract PDF text: ${cleanExtractionError(error)}`
      };
    }
  }

  return {
    skipped: true,
    reason: extension ? `Unsupported file type (${extension})` : "Unsupported file type"
  };
}

function cleanExtractionError(error: unknown): string {
  if (error instanceof Error) {
    return error.message.slice(0, 180);
  }

  return "Unknown extraction error";
}
