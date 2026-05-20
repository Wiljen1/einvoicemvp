import fs from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";

export interface DocxExtractionInput {
  filePath: string;
  fileName: string;
  relativePath: string;
  metadataOnly?: boolean;
}

export interface DocxExtractionResult {
  text: string;
  metadata: {
    embeddedImageCount?: number;
    extractionWarnings?: string[];
  };
  partial: boolean;
}

export async function extractDocxText(input: DocxExtractionInput): Promise<DocxExtractionResult> {
  if (input.metadataOnly) {
    return {
      text: buildDocumentAssetText(input, 0),
      metadata: {},
      partial: true
    };
  }

  try {
    const zip = await JSZip.loadAsync(await fs.readFile(input.filePath));
    const documentFiles = Object.keys(zip.files).filter((name) =>
      /^word\/(document|footnotes|endnotes|comments|header\d+|footer\d+)\.xml$/.test(name)
    );
    const embeddedImageCount = Object.keys(zip.files).filter(
      (name) => /^word\/media\//.test(name) && !zip.files[name].dir
    ).length;
    const sections: string[] = [];

    for (const fileName of documentFiles) {
      const xml = await zip.files[fileName].async("text");
      const text = extractOpenXmlText(xml);

      if (text) {
        sections.push(text);
      }
    }

    const warnings = embeddedImageCount > 0 ? ["Embedded images were not OCR-indexed yet."] : [];

    return {
      text: sections.length
        ? [...sections, ...warnings].join("\n")
        : buildDocumentAssetText(input, embeddedImageCount),
      metadata: {
        embeddedImageCount,
        extractionWarnings: warnings.length ? warnings : undefined
      },
      partial: sections.length === 0
    };
  } catch {
    return {
      text: buildDocumentAssetText(input, 0),
      metadata: {},
      partial: true
    };
  }
}

function buildDocumentAssetText(input: DocxExtractionInput, embeddedImageCount: number): string {
  return [
    `Word document asset: ${stripExtension(input.fileName)}`,
    `File: ${input.fileName}`,
    `Path: ${input.relativePath}`,
    `Folder: ${path.dirname(input.relativePath) === "." ? "Root" : path.dirname(input.relativePath)}`,
    embeddedImageCount > 0 ? "Embedded images were not OCR-indexed yet." : "",
    "TODO: add embedded image OCR for DOCX files."
  ]
    .filter(Boolean)
    .join("\n");
}

function extractOpenXmlText(xml: string): string {
  const textNodes = Array.from(xml.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g))
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
