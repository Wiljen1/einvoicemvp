import type { SearchResult, SourceReference } from "@/types/document";
import { normalizeCombinedCountryLabelsInText } from "./entityNormalizationService";

export function buildSourceReferences(
  chunks: SearchResult[],
  options?: { normalizeCountryLabels?: boolean }
): SourceReference[] {
  const sources = new Map<string, SourceReference>();

  for (const chunk of chunks) {
    const key = chunk.relativePath || chunk.fileName;
    const existing = sources.get(key);
    const snippet = options?.normalizeCountryLabels
      ? normalizeCombinedCountryLabelsInText(chunk.snippet)
      : chunk.snippet;

    if (!existing) {
      sources.set(key, {
        fileName: chunk.relativePath || chunk.fileName,
        relativePath: chunk.relativePath,
        snippet,
        webUrl: chunk.webUrl,
        pageCount: chunk.metadata?.pageCount,
        extension: chunk.extension,
        sourceQuality: chunk.sourceQuality,
        evidenceDetail: chunk.evidenceDetail,
        pageNumber: chunk.pageNumber,
        slideNumber: chunk.slideNumber,
        sheetName: chunk.sheetName
      });
      continue;
    }

    if (chunk.sourceQuality === "HIGH" && existing.sourceQuality !== "HIGH") {
      sources.set(key, {
        ...existing,
        snippet,
        sourceQuality: chunk.sourceQuality,
        evidenceDetail: chunk.evidenceDetail
      });
    }
  }

  return Array.from(sources.values());
}
