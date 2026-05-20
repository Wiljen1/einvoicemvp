export interface ApprovedDocument {
  id?: string;
  fileName: string;
  relativePath?: string;
  absolutePath?: string;
  extension?: string;
  content: string;
  sourcePath: string;
  webUrl?: string;
  sourceType?: "LOCAL_FOLDER" | "GRAPH_SHAREPOINT";
  metadata?: {
    size?: number;
    lastModified?: string;
    pageCount?: number;
  };
}

export type DocumentSourceType = "MOCK_FOLDER" | "LOCAL_SYNCED_FOLDER" | "GRAPH_SHAREPOINT" | "NONE";

export interface IndexedDocumentFile {
  id: string;
  fileName: string;
  relativePath: string;
  absolutePath: string;
  extension: string;
  path: string;
  size: number;
  lastModified: string;
  sourceType: "LOCAL_FOLDER";
  metadata: {
    size: number;
    lastModified: string;
    pageCount?: number;
  };
}

export interface SkippedDocumentFile {
  fileName: string;
  relativePath: string;
  absolutePath: string;
  extension: string;
  path: string;
  reason: string;
}

export interface DocumentIndexStatus {
  activeSource: DocumentSourceType;
  folderPath: string;
  exists: boolean;
  available: boolean;
  recursive: boolean;
  maxDepth: number;
  supportedExtensions: string[];
  indexedFiles: IndexedDocumentFile[];
  skippedFiles: SkippedDocumentFile[];
  fileCount: number;
  skippedFileCount: number;
  indexedCount: number;
  skippedCount: number;
  lastIndexedAt: string;
  message: string;
}

export interface DocumentIndex extends DocumentIndexStatus {
  documents: ApprovedDocument[];
}

export interface DocumentChunk {
  fileName: string;
  relativePath?: string;
  metadata?: ApprovedDocument["metadata"];
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
  relativePath?: string;
  snippet: string;
  webUrl?: string;
  pageCount?: number;
}
