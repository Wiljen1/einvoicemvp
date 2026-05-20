import fs from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";

export interface PptxExtractionInput {
  filePath: string;
  fileName: string;
  relativePath: string;
  metadataOnly?: boolean;
}

export interface PptxExtractionResult {
  text: string;
  metadata: {
    slideCount?: number;
  };
  partial: boolean;
}

export async function extractPptxText(input: PptxExtractionInput): Promise<PptxExtractionResult> {
  if (input.metadataOnly) {
    return {
      text: buildPresentationAssetText(input),
      metadata: {},
      partial: true
    };
  }

  try {
    const zip = await JSZip.loadAsync(await fs.readFile(input.filePath));
    const slideFiles = sortOfficeXmlFiles(
      Object.keys(zip.files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    );
    const noteFiles = sortOfficeXmlFiles(
      Object.keys(zip.files).filter((name) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(name))
    );
    const sections: string[] = [];

    for (const [index, fileName] of slideFiles.entries()) {
      const xml = await zip.files[fileName].async("text");
      const text = extractOpenXmlText(xml);

      if (text) {
        sections.push(`Slide ${index + 1}: ${text}`);
      }
    }

    for (const [index, fileName] of noteFiles.entries()) {
      const xml = await zip.files[fileName].async("text");
      const text = extractOpenXmlText(xml);

      if (text) {
        sections.push(`Speaker notes ${index + 1}: ${text}`);
      }
    }

    return {
      text: sections.length ? sections.join("\n") : buildPresentationAssetText(input),
      metadata: {
        slideCount: slideFiles.length || undefined
      },
      partial: sections.length === 0
    };
  } catch {
    return {
      text: buildPresentationAssetText(input),
      metadata: {},
      partial: true
    };
  }
}

function buildPresentationAssetText(input: PptxExtractionInput): string {
  return [
    `Presentation asset: ${stripExtension(input.fileName)}`,
    `File: ${input.fileName}`,
    `Path: ${input.relativePath}`,
    `Folder: ${path.dirname(input.relativePath) === "." ? "Root" : path.dirname(input.relativePath)}`,
    "TODO: add slide image extraction for visual-only presentations."
  ].join("\n");
}

function sortOfficeXmlFiles(files: string[]): string[] {
  return [...files].sort((a, b) => getOfficeXmlNumber(a) - getOfficeXmlNumber(b));
}

function getOfficeXmlNumber(fileName: string): number {
  const match = fileName.match(/(\d+)\.xml$/);
  return match ? Number.parseInt(match[1], 10) : 0;
}

function extractOpenXmlText(xml: string): string {
  const textNodes = Array.from(xml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g))
    .map((match) => decodeXml(match[1]))
    .join(" ");

  return textNodes.replace(/\s+/g, " ").trim();
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function stripExtension(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "");
}
