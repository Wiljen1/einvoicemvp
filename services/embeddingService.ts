import type { ApprovedDocument, SearchResult } from "@/types/document";

export interface EmbeddingSearchInput {
  question: string;
  documents: ApprovedDocument[];
  limit?: number;
}

export interface EmbeddingService {
  enabled: boolean;
  search(input: EmbeddingSearchInput): Promise<SearchResult[]>;
}

export const disabledEmbeddingService: EmbeddingService = {
  enabled: false,
  async search() {
    return [];
  }
};

export function getEmbeddingService(): EmbeddingService {
  return disabledEmbeddingService;
}
