import fs from "node:fs/promises";
import path from "node:path";
import type { DocumentIndexedMode } from "@/types/document";
import { extractDocxText } from "./docxExtractor";
import { extractImageMetadata } from "./imageExtractor";
import { extractPdfText } from "./pdfExtractor";
import { extractPptxText } from "./pptxExtractor";
import { extractUrlFile } from "./urlExtractor";
import { extractVideoMetadata } from "./videoMetadataExtractor";
import { extractXlsxText } from "./xlsxExtractor";
import { runPdfOcr } from "./ocrExtractor";

export interface ExtractedDocument {
  text: string;
  indexedMode: DocumentIndexedMode;
  metadata: {
    extension: string;
    pageCount?: number;
    slideCount?: number;
    sheetCount?: number;
    sheetNames?: string[];
    width?: number;
    height?: number;
    transcriptPath?: string;
    targetUrl?: string;
    ocrAttempted?: boolean;
    ocrProcessed?: boolean;
    ocrFailureReason?: string;
    extractionWarnings?: string[];
    embeddedImageCount?: number;
  };
}

export interface SkippedExtraction {
  skipped: true;
  reason: string;
}

export type ExtractionResult = ExtractedDocument | SkippedExtraction;

const TEXT_EXTENSIONS = new Set([".txt", ".md", ".markdown", ".json", ".csv"]);
const SUPPORTED_EXTENSIONS = new Set([
  ...TEXT_EXTENSIONS,
  ".pdf",
  ".docx",
  ".pptx",
  ".xlsx",
  ".png",
  ".jpg",
  ".jpeg",
  ".mp4",
  ".url"
]);

export const REGISTERED_EXTRACTORS = [
  {
    name: "pdfExtractor",
    extensions: [".pdf"]
  },
  {
    name: "ocrExtractor",
    extensions: [".pdf", ".png", ".jpg", ".jpeg"]
  },
  {
    name: "pptxExtractor",
    extensions: [".pptx"]
  },
  {
    name: "xlsxExtractor",
    extensions: [".xlsx"]
  },
  {
    name: "imageExtractor",
    extensions: [".png", ".jpg", ".jpeg"]
  },
  {
    name: "urlExtractor",
    extensions: [".url"]
  },
  {
    name: "videoMetadataExtractor",
    extensions: [".mp4"]
  },
  {
    name: "textExtractor",
    extensions: Array.from(TEXT_EXTENSIONS).sort()
  }
] as const;

export function getSupportedExtractorExtensions(): string[] {
  return Array.from(SUPPORTED_EXTENSIONS).sort();
}

export function getRegisteredExtractorNames(): string[] {
  return REGISTERED_EXTRACTORS.map((extractor) => extractor.name);
}

export function getExtractorRegistryStatus(): Array<{ name: string; extensions: string[] }> {
  return REGISTERED_EXTRACTORS.map((extractor) => ({
    name: extractor.name,
    extensions: [...extractor.extensions]
  }));
}

export async function extractTextFromFile(input: {
  filePath: string;
  fileName: string;
  relativePath: string;
  size: number;
}): Promise<ExtractionResult> {
  const extension = path.extname(input.fileName).toLowerCase();
  const metadataOnly = shouldUseMetadataOnly(extension, input.size);

  if (TEXT_EXTENSIONS.has(extension)) {
    if (metadataOnly) {
      return buildMetadataOnlyDocument(input, extension, "Text document");
    }

    return {
      text: await fs.readFile(input.filePath, "utf8"),
      indexedMode: "FULL_TEXT",
      metadata: {
        extension
      }
    };
  }

  if (extension === ".pdf") {
    if (metadataOnly) {
      return buildMetadataOnlyDocument(input, extension, "PDF document");
    }

    try {
      const extracted = await extractPdfText(input.filePath);

      if (!extracted.text.trim()) {
        return buildPdfOcrFallbackDocument(input, extension, extracted.metadata.pageCount);
      }

      return {
        text: extracted.text,
        indexedMode: "FULL_TEXT",
        metadata: {
          extension,
          pageCount: extracted.metadata.pageCount
        }
      };
    } catch (error) {
      return buildPdfOcrFallbackDocument(input, extension, undefined, cleanExtractionError(error));
    }
  }

  if (extension === ".docx") {
    const extracted = await extractDocxText({ ...input, metadataOnly });
    return {
      text: extracted.text,
      indexedMode: extracted.partial ? "PARTIAL_METADATA" : "FULL_TEXT",
      metadata: {
        extension,
        embeddedImageCount: extracted.metadata.embeddedImageCount,
        extractionWarnings: extracted.metadata.extractionWarnings
      }
    };
  }

  if (extension === ".pptx") {
    const extracted = await extractPptxText({ ...input, metadataOnly });
    return {
      text: extracted.text,
      indexedMode: extracted.partial ? "PARTIAL_METADATA" : "FULL_TEXT",
      metadata: {
        extension,
        slideCount: extracted.metadata.slideCount,
        embeddedImageCount: extracted.metadata.embeddedImageCount,
        extractionWarnings: extracted.metadata.extractionWarnings
      }
    };
  }

  if (extension === ".xlsx") {
    const extracted = await extractXlsxText({ ...input, metadataOnly });
    return {
      text: extracted.text,
      indexedMode: extracted.partial ? "PARTIAL_METADATA" : "FULL_TEXT",
      metadata: {
        extension,
        sheetCount: extracted.metadata.sheetCount,
        sheetNames: extracted.metadata.sheetNames
      }
    };
  }

  if (extension === ".png" || extension === ".jpg" || extension === ".jpeg") {
    const extracted = await extractImageMetadata(input);
    return {
      text: extracted.text,
      indexedMode: extracted.metadata.ocrProcessed ? "OCR_TEXT" : "PARTIAL_METADATA",
      metadata: {
        extension,
        width: extracted.metadata.width,
        height: extracted.metadata.height,
        ocrAttempted: extracted.metadata.ocrAttempted,
        ocrProcessed: extracted.metadata.ocrProcessed,
        ocrFailureReason: extracted.metadata.ocrFailureReason,
        extractionWarnings: extracted.metadata.extractionWarnings
      }
    };
  }

  if (extension === ".mp4") {
    const extracted = await extractVideoMetadata({ ...input, metadataOnly });
    return {
      text: extracted.text,
      indexedMode: extracted.transcriptLinked ? "TRANSCRIPT_LINKED" : "PARTIAL_METADATA",
      metadata: {
        extension,
        transcriptPath: extracted.metadata.transcriptPath
      }
    };
  }

  if (extension === ".url") {
    const extracted = await extractUrlFile(input);
    return {
      text: extracted.text,
      indexedMode: "PARTIAL_METADATA",
      metadata: {
        extension,
        targetUrl: extracted.metadata.targetUrl
      }
    };
  }

  return {
    skipped: true,
    reason: extension ? `Unsupported file type (${extension})` : "Unsupported file type"
  };
}

function shouldUseMetadataOnly(extension: string, size: number): boolean {
  if (extension === ".mp4") {
    return size > getConfiguredBytes("MAX_VIDEO_METADATA_FILE_SIZE_MB", 500);
  }

  return size > getConfiguredBytes("MAX_TEXT_EXTRACTION_FILE_SIZE_MB", 100);
}

function getConfiguredBytes(envName: string, defaultMegabytes: number): number {
  const parsed = Number.parseInt(process.env[envName] || "", 10);
  const megabytes = Number.isFinite(parsed) && parsed > 0 ? parsed : defaultMegabytes;
  return megabytes * 1024 * 1024;
}

function buildMetadataOnlyDocument(
  input: { fileName: string; relativePath: string },
  extension: string,
  label: string
): ExtractedDocument {
  return {
    text: [
      `${label} asset: ${stripExtension(input.fileName)}`,
      `File: ${input.fileName}`,
      `Path: ${input.relativePath}`,
      `Extension: ${extension}`,
      "Extraction skipped because the file exceeds the configured full-text extraction limit.",
      "TODO: add incremental indexing for large files."
    ].join("\n"),
    indexedMode: "PARTIAL_METADATA",
    metadata: {
      extension
    }
  };
}

async function buildPdfOcrFallbackDocument(
  input: { filePath: string; fileName: string; relativePath: string; size: number },
  extension: string,
  pageCount?: number,
  textExtractionFailure?: string
): Promise<ExtractedDocument> {
  const ocr = await runPdfOcr(input.filePath, input.size);
  const warning = ocr.processed
    ? undefined
    : ocr.reason || "PDF contains no extractable text or may be scanned.";
  const text = [
    `PDF document asset: ${stripExtension(input.fileName)}`,
    `File: ${input.fileName}`,
    `Path: ${input.relativePath}`,
    textExtractionFailure ? `PDF text extraction failed: ${textExtractionFailure}` : "",
    ocr.text ? `OCR text: ${ocr.text}` : "",
    warning ? `OCR note: ${warning}` : "",
    "TODO: improve scanned PDF rendering and OCR coverage."
  ]
    .filter(Boolean)
    .join("\n");

  return {
    text,
    indexedMode: ocr.processed ? "OCR_TEXT" : "PARTIAL_METADATA",
    metadata: {
      extension,
      pageCount,
      ocrAttempted: ocr.attempted,
      ocrProcessed: ocr.processed,
      ocrFailureReason: ocr.processed ? undefined : warning,
      extractionWarnings: warning ? [warning] : undefined
    }
  };
}

function cleanExtractionError(error: unknown): string {
  if (error instanceof Error) {
    return error.message.slice(0, 180);
  }

  return "Unknown extraction error";
}

function stripExtension(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "");
}
