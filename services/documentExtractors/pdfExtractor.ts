import fs from "node:fs/promises";
import path from "node:path";
import { PDFParse } from "pdf-parse";

export interface PdfExtractionResult {
  text: string;
  metadata: {
    pageCount?: number;
  };
}

let pdfWorkerDataUrl: string | null = null;

export async function extractPdfText(filePath: string): Promise<PdfExtractionResult> {
  const data = await fs.readFile(filePath);
  return extractPdfTextFromBuffer(data);
}

export async function extractPdfTextFromBuffer(
  data: Buffer | Uint8Array
): Promise<PdfExtractionResult> {
  PDFParse.setWorker(await getPdfWorkerDataUrl());
  const parser = new PDFParse({ data });

  try {
    const result = await parser.getText();
    const text = result.text.replace(/\s+/g, " ").trim();

    return {
      text,
      metadata: {
        pageCount: result.total
      }
    };
  } finally {
    await parser.destroy();
  }
}

async function getPdfWorkerDataUrl(): Promise<string> {
  if (pdfWorkerDataUrl) {
    return pdfWorkerDataUrl;
  }

  const workerPath = path.resolve(
    /* turbopackIgnore: true */ process.cwd(),
    "node_modules",
    "pdf-parse",
    "dist",
    "worker",
    "pdf.worker.mjs"
  );
  const workerBytes = await fs.readFile(workerPath);
  pdfWorkerDataUrl = `data:text/javascript;base64,${workerBytes.toString("base64")}`;
  return pdfWorkerDataUrl;
}
