import crypto from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const DEFAULT_OCR_MAX_FILE_SIZE_MB = 50;
const DEFAULT_OCR_PDF_MAX_PAGES = 3;

export interface OcrConfig {
  enabled: boolean;
  language: string;
  maxFileSizeMb: number;
  pdfMaxPages: number;
}

export interface OcrResult {
  attempted: boolean;
  processed: boolean;
  text: string;
  reason?: string;
}

export function getOcrConfig(): OcrConfig {
  return {
    enabled: process.env.ENABLE_LOCAL_OCR !== "false",
    language: process.env.OCR_LANGUAGE || "eng",
    maxFileSizeMb: getPositiveIntegerEnv("OCR_MAX_FILE_SIZE_MB", DEFAULT_OCR_MAX_FILE_SIZE_MB),
    pdfMaxPages: getPositiveIntegerEnv("OCR_PDF_MAX_PAGES", DEFAULT_OCR_PDF_MAX_PAGES)
  };
}

export function isLocalOcrEnabled(): boolean {
  return getOcrConfig().enabled;
}

export async function runImageOcr(filePath: string, size: number): Promise<OcrResult> {
  const config = getOcrConfig();

  if (!config.enabled) {
    return {
      attempted: false,
      processed: false,
      text: "",
      reason: "OCR is disabled."
    };
  }

  if (size > config.maxFileSizeMb * 1024 * 1024) {
    return {
      attempted: true,
      processed: false,
      text: "",
      reason: `File exceeds OCR limit of ${config.maxFileSizeMb} MB.`
    };
  }

  return recognizeImage(filePath, config.language);
}

export async function runPdfOcr(filePath: string, size: number): Promise<OcrResult> {
  const config = getOcrConfig();

  if (!config.enabled) {
    return {
      attempted: false,
      processed: false,
      text: "",
      reason: "OCR is disabled."
    };
  }

  if (size > config.maxFileSizeMb * 1024 * 1024) {
    return {
      attempted: true,
      processed: false,
      text: "",
      reason: `File exceeds OCR limit of ${config.maxFileSizeMb} MB.`
    };
  }

  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "knowledge-assistant-ocr-"));

  try {
    const images = await renderPdfPagesToImages(filePath, tempDirectory, config.pdfMaxPages);
    if (images.length === 0) {
      return {
        attempted: true,
        processed: false,
        text: "",
        reason: "PDF OCR renderer did not produce page images."
      };
    }

    const pageTexts: string[] = [];
    for (const imagePath of images) {
      const stats = await fs.stat(imagePath);
      const result = await runImageOcr(imagePath, stats.size);
      if (result.text.trim()) {
        pageTexts.push(result.text.trim());
      }
    }

    const text = pageTexts.join("\n").replace(/\s+/g, " ").trim();
    return {
      attempted: true,
      processed: text.length > 0,
      text,
      reason: text ? undefined : "OCR completed but did not find readable text."
    };
  } catch (error) {
    return {
      attempted: true,
      processed: false,
      text: "",
      reason: `PDF OCR failed: ${cleanOcrError(error)}`
    };
  } finally {
    await fs.rm(tempDirectory, { recursive: true, force: true });
  }
}

async function recognizeImage(filePath: string, language: string): Promise<OcrResult> {
  try {
    const { recognize } = await import("tesseract.js");
    const result = await recognize(filePath, language);
    const text = result.data.text.replace(/\s+/g, " ").trim();

    return {
      attempted: true,
      processed: text.length > 0,
      text,
      reason: text ? undefined : "OCR completed but did not find readable text."
    };
  } catch (error) {
    return {
      attempted: true,
      processed: false,
      text: "",
      reason: `OCR failed: ${cleanOcrError(error)}`
    };
  }
}

async function renderPdfPagesToImages(
  filePath: string,
  tempDirectory: string,
  maxPages: number
): Promise<string[]> {
  const prefix = path.join(
    /* turbopackIgnore: true */ tempDirectory,
    crypto.createHash("sha1").update(filePath).digest("hex").slice(0, 12)
  );

  await execFileAsync("pdftoppm", [
    "-png",
    "-f",
    "1",
    "-l",
    String(maxPages),
    filePath,
    prefix
  ]);

  const entries = await fs.readdir(tempDirectory);
  return entries
    .filter((entry) => entry.startsWith(path.basename(prefix)) && entry.endsWith(".png"))
    .sort((a, b) => a.localeCompare(b))
    .map((entry) => path.join(/* turbopackIgnore: true */ tempDirectory, entry));
}

function getPositiveIntegerEnv(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name] || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function cleanOcrError(error: unknown): string {
  if (error instanceof Error) {
    return error.message.slice(0, 180);
  }

  return "Unknown OCR error";
}
