export interface ApprovedDocument {
  fileName: string;
  content: string;
  sourcePath: string;
  webUrl?: string;
}

export interface DocumentChunk {
  fileName: string;
  snippet: string;
  sourcePath: string;
  webUrl?: string;
  chunkIndex: number;
}

export interface SearchResult extends DocumentChunk {
  score: number;
  confidence: number;
}

export interface SourceReference {
  fileName: string;
  snippet: string;
  webUrl?: string;
}
