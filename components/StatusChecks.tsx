"use client";

import {
  Activity,
  BookOpen,
  FileSearch,
  RefreshCw,
  ServerCog,
  ShieldCheck
} from "lucide-react";
import { useEffect, useState } from "react";
import type { ChatSessionStatus } from "@/types/chat";
import type { DocumentIndexStatus } from "@/types/document";
import { ProcessingProgressBar } from "./ProcessingProgressBar";

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

interface StatusChecksProps {
  refreshKey: number;
  processingStatus: ChatSessionStatus;
  onRefresh: () => void;
}

export function StatusChecks({
  refreshKey,
  processingStatus,
  onRefresh
}: StatusChecksProps) {
  const [status, setStatus] = useState<StatusResponse["data"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshingDocuments, setRefreshingDocuments] = useState(false);
  const [showSetup, setShowSetup] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadStatus() {
      setLoading(true);
      const response = await fetch("/api/status", { cache: "no-store" });
      const payload = (await response.json()) as StatusResponse;

      if (!cancelled) {
        setStatus(payload.data);
        setLoading(false);
      }
    }

    loadStatus().catch(() => {
      if (!cancelled) {
        setStatus(null);
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const codexAvailable = status?.codex.available;
  const documentsAvailable = status?.documents.available;
  const indexedFileCount = status?.documents.fileCount ?? 0;
  const skippedFileCount = status?.documents.skippedFileCount ?? 0;
  const indexedFiles = status?.documents.indexedFiles || [];
  const skippedFiles = status?.documents.skippedFiles || [];

  async function refreshDocuments() {
    setRefreshingDocuments(true);
    try {
      await fetch("/api/documents/refresh", {
        method: "POST"
      });
      onRefresh();
    } finally {
      setRefreshingDocuments(false);
    }
  }

  return (
    <section className="status-grid" aria-label="System status checks">
      <div className="status-card">
        <div className="status-heading">
          <span>Codex Status</span>
          <ServerCog aria-hidden="true" size={17} />
        </div>
        <p className="status-value">
          <span className={`status-dot ${loading ? "pending" : codexAvailable ? "ok" : ""}`} />{" "}
          {loading ? "Checking Codex" : status?.codex.message || "Codex not found / not available"}
        </p>
        <span className="status-meta">{status?.codex.binaryPath || "No binary detected"}</span>
        {!loading && !codexAvailable && status?.codex.setupInstructions ? (
          <span className="status-meta">{status.codex.setupInstructions}</span>
        ) : null}
      </div>

      <div className="status-card">
        <div className="status-heading">
          <span>Active Document Source</span>
          <ShieldCheck aria-hidden="true" size={17} />
        </div>
        <p className="status-value">
          <span className={`status-dot ${loading ? "pending" : documentsAvailable ? "ok" : ""}`} />{" "}
          {loading
            ? "Checking document source"
            : status?.documents.message || "No document source is currently available."}
        </p>
        <span className="status-meta">
          Active Source: {status?.documents.displayName || "None"}
        </span>
        <p className="folder-path">
          Folder: {status?.documents.folderPath || "No folder available"}
        </p>
        <span className="status-meta">Indexed files: {indexedFileCount}</span>
        <span className="status-meta">Skipped files: {skippedFileCount}</span>
        <span className="status-meta">
          Last Indexed: {status?.documents.lastIndexedAt || "Not indexed yet"}
        </span>
        <span className="status-meta">
          Recursive Scan: {status?.documents.recursive === false ? "Disabled" : "Enabled"}
        </span>
        <span className="status-meta">
          Supported:{" "}
          {(
            status?.documents.supportedExtensions || [
              ".txt",
              ".md",
              ".json",
              ".csv",
              ".pdf",
              ".pptx",
              ".xlsx",
              ".png",
              ".mp4",
              ".url"
            ]
          ).join(", ")}
        </span>
        {indexedFileCount > 0 ? (
          <details className="document-file-list">
            <summary>Indexed files ({indexedFileCount})</summary>
            <ul>
              {indexedFiles.slice(0, 20).map((file) => (
                <li key={file.path}>
                  {file.relativePath || file.fileName} - {getIndexedModeLabel(file.indexedMode)}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
        {skippedFileCount > 0 ? (
          <details className="document-file-list">
            <summary>Skipped files ({skippedFileCount})</summary>
            <ul>
              {skippedFiles.slice(0, 20).map((file) => (
                <li key={file.path}>
                  {file.relativePath || file.fileName} - {file.reason}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
        {!loading && indexedFileCount === 0 ? (
          <p className="folder-path">
            No readable documents are currently indexed. Please add documents or refresh the
            document index.
          </p>
        ) : null}
        <div className="status-actions">
          <button className="button secondary" type="button" onClick={onRefresh}>
            <RefreshCw aria-hidden="true" size={16} />
            Refresh
          </button>
          <button className="button secondary" type="button" onClick={refreshDocuments}>
            <FileSearch aria-hidden="true" size={16} />
            {refreshingDocuments ? "Refreshing" : "Refresh Documents"}
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
            Use a local folder, a OneDrive-synced SharePoint folder, or manual uploads. The app
            reads .txt, .md, .json, .csv, and text-based PDF files, scans nested folders, and skips
            unsupported or unreadable files with visible reasons.
          </p>
        ) : null}
      </div>

      <div className="status-card">
        <div className="status-heading">
          <span>Processing Status</span>
          <Activity aria-hidden="true" size={17} />
        </div>
        <ProcessingProgressBar compact status={processingStatus} />
      </div>
    </section>
  );
}

function getIndexedModeLabel(mode?: string): string {
  if (mode === "FULL_TEXT") {
    return "Fully indexed";
  }

  if (mode === "TRANSCRIPT_LINKED") {
    return "Transcript linked";
  }

  if (mode === "PARTIAL_METADATA") {
    return "Metadata indexed only";
  }

  return "Indexed";
}
