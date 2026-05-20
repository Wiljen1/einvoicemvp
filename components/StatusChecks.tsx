"use client";

import { Activity, BookOpen, FileSearch, RefreshCw, ServerCog, ShieldCheck, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { ChatSessionStatus } from "@/types/chat";
import type { ActiveDocumentSourceType, DocumentIndexStatus, IndexedDocumentFile } from "@/types/document";

interface StatusResponse {
  ok: true;
  data: {
    codex: {
      available: boolean;
      message: string;
      executionMode: "placeholder" | "operator";
      binaryPath: string;
      setupInstructions?: string;
    };
    documents: DocumentIndexStatus;
  };
}

interface IndexStatusResponse {
  ok: true;
  data: IndexStatus;
}

interface IndexDocumentsResponse {
  ok: true;
  data: {
    documents: IndexedDocumentFile[];
  };
}

interface IndexSourceStatus {
  id: string;
  type: ActiveDocumentSourceType;
  displayName: string;
  rootPath: string;
  normalizedRootPath: string;
  sourceKey: string;
  lastScannedAt: string | null;
}

interface IndexStatus {
  source: IndexSourceStatus;
  activeSource: IndexSourceStatus;
  knownSources: KnownDocumentSource[];
  index: {
    status: "FRESH" | "STALE" | "EMPTY";
    lastIndexedAt: string | null;
    indexedDocuments: number;
    indexedChunks: number;
    activeDocuments: number;
    activeChunks: number;
    needsUpdate: boolean;
    newFiles: number;
    changedFiles: number;
    deletedFiles: number;
    chatExcludedDocuments: number;
    indexExcludedDocuments: number;
    failedDocuments: number;
    skippedDocuments: number;
    ocrEnabled: boolean;
    startupValidation: DocumentIndexStatus["startupValidation"];
    lastRun: IndexRunProgress | null;
  };
}

interface KnownDocumentSource {
  id: string;
  type: ActiveDocumentSourceType;
  displayName: string;
  rootPath: string;
  normalizedRootPath: string;
  sourceKey: string;
  lastScannedAt: string | null;
  indexedDocuments: number;
  activeDocuments: number;
  excludedFromChat: number;
  excludedFromIndexing: number;
  needsUpdate: boolean;
  newFiles: number;
  changedFiles: number;
  deletedFiles: number;
  exists: boolean;
}

interface IndexRunProgress {
  id: string;
  sourceId: string;
  status: "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";
  progress: number;
  currentFile: string | null;
  currentAction: string;
  completedAt: string | null;
  filesScanned: number;
  filesIndexed: number;
  filesUpdated: number;
  filesSkipped: number;
  filesFailed: number;
  ocrProcessed: number;
  error: string | null;
}

interface StatusChecksProps {
  refreshKey: number;
  processingStatus: ChatSessionStatus;
  onRefresh: () => void;
  showDetails?: boolean;
}

export function StatusChecks({
  refreshKey,
  processingStatus,
  onRefresh,
  showDetails = true
}: StatusChecksProps) {
  const [status, setStatus] = useState<StatusResponse["data"] | null>(null);
  const [indexStatus, setIndexStatus] = useState<IndexStatus | null>(null);
  const [indexedDocuments, setIndexedDocuments] = useState<IndexedDocumentFile[]>([]);
  const [indexRun, setIndexRun] = useState<IndexRunProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSetup, setShowSetup] = useState(false);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const [statusResponse, indexResponse, documentsResponse] = await Promise.all([
          fetch("/api/status", { cache: "no-store" }),
          fetch("/api/index/status", { cache: "no-store" }),
          fetch("/api/index/documents", { cache: "no-store" })
        ]);
        const [statusPayload, indexPayload, documentsPayload] = (await Promise.all([
          statusResponse.json(),
          indexResponse.json(),
          documentsResponse.json()
        ])) as [StatusResponse, IndexStatusResponse, IndexDocumentsResponse];

        if (!cancelled) {
          setStatus(statusPayload.data);
          setIndexStatus(indexPayload.data);
          setIndexedDocuments(documentsPayload.data.documents);
          setIndexRun(indexPayload.data.index.lastRun);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load().catch(() => {
      if (!cancelled) {
        setStatus(null);
        setIndexStatus(null);
        setIndexedDocuments([]);
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  useEffect(() => {
    return () => {
      if (pollTimer.current) {
        clearTimeout(pollTimer.current);
      }
    };
  }, []);

  const codexAvailable = status?.codex.available;
  const documents = status?.documents;
  const activeRun = indexRun?.status === "QUEUED" || indexRun?.status === "RUNNING";
  const indexLabel = loading ? "Checking" : titleCase(indexStatus?.index.status || "EMPTY");
  const startupWarnings = getStartupWarnings(documents, indexStatus);
  const registeredExtractors =
    indexStatus?.index.startupValidation.extractors.registered ||
    documents?.startupValidation.extractors.registered ||
    [];
  const processingLabel =
    processingStatus.status === "RUNNING"
      ? "Running"
      : processingStatus.status === "FAILED"
        ? "Error"
        : "Idle";

  async function reloadStatus() {
    onRefresh();
  }

  async function startIndexRun() {
    const response = await fetch("/api/index/run", { method: "POST" });
    const payload = await response.json();

    if (payload.ok) {
      const run = payload.data as IndexRunProgress;
      setIndexRun(run);
      pollIndexRun(run.id);
    }
  }

  async function pollIndexRun(runId: string) {
    const response = await fetch(`/api/index/run/${encodeURIComponent(runId)}`, {
      cache: "no-store"
    });
    const payload = await response.json();

    if (!payload.ok) {
      return;
    }

    const run = payload.data as IndexRunProgress;
    setIndexRun(run);

    if (run.status === "QUEUED" || run.status === "RUNNING") {
      pollTimer.current = setTimeout(() => pollIndexRun(runId), 800);
      return;
    }

    onRefresh();
  }

  async function cancelIndexRun() {
    if (!indexRun?.id || !activeRun) {
      return;
    }

    if (pollTimer.current) {
      clearTimeout(pollTimer.current);
    }

    const response = await fetch(`/api/index/run/${encodeURIComponent(indexRun.id)}/cancel`, {
      method: "POST"
    });
    const payload = await response.json();

    if (payload.ok) {
      setIndexRun(payload.data as IndexRunProgress);
      onRefresh();
    }
  }

  return (
    <section className="status-shell" aria-label="System status checks">
      <div className="status-pills">
        <StatusPill
          icon={<ServerCog aria-hidden="true" size={15} />}
          label="Codex"
          tone={loading ? "pending" : codexAvailable ? "ok" : "danger"}
          value={loading ? "Checking" : codexAvailable ? "Online" : "Offline"}
        />
        <StatusPill
          icon={<Activity aria-hidden="true" size={15} />}
          label="Processing"
          tone={processingStatus.status === "FAILED" ? "danger" : processingStatus.status === "RUNNING" ? "pending" : "ok"}
          value={processingLabel}
        />
        <StatusPill
          icon={<ShieldCheck aria-hidden="true" size={15} />}
          label="Source"
          tone={documents?.available ? "ok" : "danger"}
          value={documents?.displayName || "None"}
        />
        <StatusPill
          icon={<FileSearch aria-hidden="true" size={15} />}
          label="Index"
          tone={indexStatus?.index.status === "FRESH" ? "ok" : indexStatus?.index.status === "STALE" ? "warning" : "pending"}
          value={indexLabel}
        />
      </div>

      {showDetails ? <details className="index-details">
        <summary>Document Index Details</summary>
        <div className="index-detail-grid">
          <span>Active source</span>
          <strong>{documents?.displayName || "None"}</strong>
          <span>Root folder</span>
          <strong className="folder-path">{indexStatus?.source.rootPath || documents?.folderPath || "No folder available"}</strong>
          <span>Indexed documents</span>
          <strong>{indexStatus?.index.indexedDocuments ?? documents?.fileCount ?? 0}</strong>
          <span>Active documents</span>
          <strong>{indexStatus?.index.activeDocuments ?? documents?.activeFileCount ?? 0}</strong>
          <span>Chat excluded</span>
          <strong>{indexStatus?.index.chatExcludedDocuments ?? documents?.chatExcludedFileCount ?? 0}</strong>
          <span>Index excluded</span>
          <strong>{indexStatus?.index.indexExcludedDocuments ?? documents?.indexExcludedFileCount ?? 0}</strong>
          <span>Indexed chunks</span>
          <strong>{indexStatus?.index.indexedChunks ?? 0}</strong>
          <span>Skipped / failed</span>
          <strong>
            {indexStatus
              ? `${indexStatus.index.skippedDocuments} skipped, ${indexStatus.index.failedDocuments} failed`
              : `${documents?.skippedFileCount ?? 0} skipped`}
          </strong>
          <span>OCR</span>
          <strong>{documents?.ocrEnabled ? "Enabled" : "Disabled"}</strong>
          <span>OCR processed</span>
          <strong>{documents?.ocrProcessedCount ?? 0}</strong>
          <span>Failed extractions</span>
          <strong>{documents?.failedFileCount ?? indexStatus?.index.failedDocuments ?? 0}</strong>
          <span>Supported files</span>
          <strong>{documents?.supportedExtensions?.join(", ") || "Unknown"}</strong>
          <span>Extractors</span>
          <strong>{registeredExtractors.length ? registeredExtractors.join(", ") : "Unknown"}</strong>
          <span>Last indexed</span>
          <strong>{indexStatus?.index.lastIndexedAt || documents?.lastIndexedAt || "Not indexed yet"}</strong>
          <span>Updates</span>
          <strong>{formatUpdateSummary(indexStatus)}</strong>
        </div>

        {activeRun ? (
          <div className="index-progress" aria-live="polite">
            <div className="processing-row">
              <div className="processing-label">
                <span>{indexRun.currentAction || "Indexing documents"}</span>
              </div>
              <strong>{Math.max(0, Math.min(100, indexRun.progress))}%</strong>
            </div>
            <div className="progress-track" aria-label="Document index progress">
              <div className="progress-fill" style={{ width: `${Math.max(0, Math.min(100, indexRun.progress))}%` }} />
            </div>
            <span className="status-meta">
              {indexRun.currentFile || "Preparing files"} - scanned {indexRun.filesScanned}, indexed{" "}
              {indexRun.filesIndexed}, updated {indexRun.filesUpdated}, skipped {indexRun.filesSkipped}, failed{" "}
              {indexRun.filesFailed}, OCR {indexRun.ocrProcessed}
            </span>
            <button className="button secondary stop-button" type="button" onClick={cancelIndexRun}>
              <Square aria-hidden="true" size={14} />
              Stop indexing
            </button>
          </div>
        ) : null}

        {indexRun?.status === "FAILED" ? <div className="notice error">{indexRun.error || "Index run failed."}</div> : null}
        {indexRun?.status === "CANCELLED" ? <div className="notice error">Index run cancelled.</div> : null}
        {startupWarnings.length ? (
          <div className="notice warning">
            {startupWarnings.map((warning) => (
              <div key={warning}>{warning}</div>
            ))}
          </div>
        ) : null}

        <div className="status-actions">
          <button className="button secondary" type="button" onClick={reloadStatus}>
            <RefreshCw aria-hidden="true" size={16} />
            Refresh Status
          </button>
          <button className="button" disabled={activeRun} type="button" onClick={startIndexRun}>
            <FileSearch aria-hidden="true" size={16} />
            Scan / Update Document Index
          </button>
          <button
            className="button secondary"
            type="button"
            onClick={() => setShowSetup((current) => !current)}
          >
            <BookOpen aria-hidden="true" size={16} />
            Open Setup Instructions
          </button>
        </div>

        {showSetup ? (
          <p className="folder-path">
            Add files to the configured local or OneDrive-synced folder, then run Scan / Update
            Document Index. Chat questions use the saved local index and do not rescan or OCR files.
          </p>
        ) : null}

        {!loading && (indexStatus?.index.indexedDocuments || 0) === 0 ? (
          <p className="folder-path">
            No documents are indexed yet. Add supported files, then click Scan / Update Document
            Index.
          </p>
        ) : null}

        {indexedDocuments.length > 0 ? (
          <details className="document-file-list">
            <summary>Indexed files ({indexedDocuments.length})</summary>
            <ul>
              {indexedDocuments.slice(0, 40).map((file) => (
                <li key={file.path}>
                  {file.relativePath || file.fileName} - {getIndexedModeLabel(file.indexedMode)}
                  {" - "}
                  {getExclusionBadgeText(file)}
                  {file.metadata.extractionWarnings?.length
                    ? ` - ${file.metadata.extractionWarnings.join(" ")}`
                    : ""}
                </li>
              ))}
            </ul>
          </details>
        ) : null}

        {documents?.skippedFiles?.length ? (
          <details className="document-file-list">
            <summary>Skipped files ({documents.skippedFileCount})</summary>
            <ul>
              {documents.skippedFiles.slice(0, 40).map((file) => (
                <li key={file.path}>
                  {file.relativePath || file.fileName} - {file.reason}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </details> : null}
    </section>
  );
}

function StatusPill({
  icon,
  label,
  tone,
  value
}: {
  icon: ReactNode;
  label: string;
  tone: "ok" | "pending" | "warning" | "danger";
  value: string;
}) {
  return (
    <span className={`status-pill ${tone}`}>
      {icon}
      <span>{label}:</span>
      <strong>{value}</strong>
    </span>
  );
}

function formatUpdateSummary(status: IndexStatus | null): string {
  if (!status) {
    return "Unknown";
  }

  if (!status.index.needsUpdate) {
    return "Fresh";
  }

  return `${status.index.newFiles} new, ${status.index.changedFiles} changed, ${status.index.deletedFiles} deleted`;
}

function getStartupWarnings(
  documents: DocumentIndexStatus | undefined,
  indexStatus: IndexStatus | null
): string[] {
  return Array.from(
    new Set([
      ...(documents?.startupValidation.warnings || []),
      ...(indexStatus?.index.startupValidation.warnings || [])
    ])
  );
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

function getIndexedModeLabel(mode?: string): string {
  if (mode === "FULL_TEXT") {
    return "Full text";
  }

  if (mode === "OCR_TEXT") {
    return "OCR text";
  }

  if (mode === "TRANSCRIPT_LINKED") {
    return "Transcript linked";
  }

  if (mode === "PARTIAL_METADATA") {
    return "Metadata only";
  }

  return "Indexed";
}

function getExclusionBadgeText(file: IndexedDocumentFile): string {
  if (file.excludedFromChat && file.excludedFromIndexing) {
    return "Chat and indexing excluded";
  }

  if (file.excludedFromChat) {
    return "Chat excluded";
  }

  if (file.excludedFromIndexing) {
    return "Indexing excluded";
  }

  return "Active";
}
