export interface ApprovedDocument {
  id?: string;
  fileName: string;
  relativePath?: string;
  absolutePath?: string;
  extension?: string;
  content: string;
  searchableText?: string;
  sourcePath: string;
  webUrl?: string;
  sourceType?: ActiveDocumentSourceType;
  indexedMode?: DocumentIndexedMode;
  metadata?: {
    size?: number;
    lastModified?: string;
    pageCount?: number;
    slideCount?: number;
    sheetCount?: number;
    sheetNames?: string[];
    width?: number;
    height?: number;
    transcriptPath?: string;
    targetUrl?: string;
  };
}

export type ActiveDocumentSourceType =
  | "LOCAL_FOLDER"
  | "SYNCED_SHAREPOINT_FOLDER"
  | "MANUAL_UPLOAD";

export type DocumentSourceType = ActiveDocumentSourceType | "GRAPH_SHAREPOINT" | "NONE";

export interface DocumentSourceConfig {
  mode: DocumentSourceType;
  localFolderPath: string;
  syncedFolderPath: string;
  updatedAt?: string;
}

export interface IndexedDocumentFile {
  id: string;
  fileName: string;
  relativePath: string;
  absolutePath: string;
  extension: string;
  path: string;
  size: number;
  lastModified: string;
  sourceType: ActiveDocumentSourceType;
  indexedMode: DocumentIndexedMode;
  metadata: {
    size: number;
    lastModified: string;
    pageCount?: number;
    slideCount?: number;
    sheetCount?: number;
    sheetNames?: string[];
    width?: number;
    height?: number;
    transcriptPath?: string;
    targetUrl?: string;
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
  displayName: string;
  folderPath: string;
  folderUrl?: string | null;
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

export type DocumentIndexedMode = "FULL_TEXT" | "PARTIAL_METADATA" | "TRANSCRIPT_LINKED";
