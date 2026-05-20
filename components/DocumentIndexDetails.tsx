"use client";

import { FileSearch, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ActiveDocumentSourceType, DocumentIndexStatus } from "@/types/document";

interface StatusPayload {
  ok: true;
  data: {
    documents: DocumentIndexStatus;
  };
}

interface IndexStatusPayload {
  ok: true;
  data: {
    source: {
      id: string;
      type: ActiveDocumentSourceType;
      displayName: string;
      rootPath: string;
      lastScannedAt: string | null;
    };
    index: {
      status: "FRESH" | "STALE" | "EMPTY";
      lastIndexedAt: string | null;
      indexedDocuments: number;
      activeDocuments: number;
      chatExcludedDocuments: number;
      failedDocuments: number;
      indexedChunks: number;
      activeChunks: number;
      ocrEnabled: boolean;
      lastRun: IndexRunProgress | null;
    };
  };
}

interface IndexRunProgress {
  id: string;
  status: "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";
  progress: number;
  currentFile: string | null;
  currentAction: string;
  filesScanned: number;
  filesIndexed: number;
  filesUpdated: number;
  filesSkipped: number;
  filesFailed: number;
  ocrProcessed: number;
  error: string | null;
}

export function DocumentIndexDetails() {
  const [status, setStatus] = useState<StatusPayload["data"]["documents"] | null>(null);
  const [indexStatus, setIndexStatus] = useState<IndexStatusPayload["data"] | null>(null);
  const [indexRun, setIndexRun] = useState<IndexRunProgress | null>(null);
  const [message, setMessage] = useState("");
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void load();

    return () => {
      if (pollTimer.current) {
        clearTimeout(pollTimer.current);
      }
    };
  }, []);

  async function load() {
    const [statusResponse, indexResponse] = await Promise.all([
      fetch("/api/status", { cache: "no-store" }),
      fetch("/api/index/status", { cache: "no-store" })
    ]);
    const [statusPayload, indexPayload] = (await Promise.all([
      statusResponse.json(),
      indexResponse.json()
    ])) as [StatusPayload, IndexStatusPayload];

    if (statusPayload.ok) {
      setStatus(statusPayload.data.documents);
    }

    if (indexPayload.ok) {
      setIndexStatus(indexPayload.data);
      setIndexRun(indexPayload.data.index.lastRun);
    }
  }

  async function startIndexRun() {
    setMessage("");
    const response = await fetch("/api/index/run", { method: "POST" });
    const payload = await response.json();

    if (!payload.ok) {
      setMessage(payload.error || "Unable to start document indexing.");
      return;
    }

    const run = payload.data as IndexRunProgress;
    setIndexRun(run);
    pollIndexRun(run.id);
  }

  async function pollIndexRun(runId: string) {
    const response = await fetch(`/api/index/run/${encodeURIComponent(runId)}`, { cache: "no-store" });
    const payload = await response.json();

    if (!payload.ok) {
      setMessage(payload.error || "Unable to read index progress.");
      return;
    }

    const run = payload.data as IndexRunProgress;
    setIndexRun(run);

    if (run.status === "QUEUED" || run.status === "RUNNING") {
      pollTimer.current = setTimeout(() => pollIndexRun(runId), 800);
      return;
    }

    await load();
  }

  const activeRun = indexRun?.status === "QUEUED" || indexRun?.status === "RUNNING";

  return (
    <details className="index-details compact-index-details">
      <summary>Document Source Status</summary>
      <div className="index-detail-grid">
        <span>Active source</span>
        <strong>{status?.displayName || indexStatus?.source.displayName || "None"}</strong>
        <span>Folder</span>
        <strong className="folder-path">{indexStatus?.source.rootPath || status?.folderPath || "No folder available"}</strong>
        <span>Index</span>
        <strong>{indexStatus?.index.status || "Unknown"}</strong>
        <span>Indexed files</span>
        <strong>{indexStatus?.index.indexedDocuments ?? status?.fileCount ?? 0}</strong>
        <span>Active for chat</span>
        <strong>{indexStatus?.index.activeDocuments ?? status?.activeFileCount ?? 0}</strong>
        <span>Excluded from chat</span>
        <strong>{indexStatus?.index.chatExcludedDocuments ?? status?.chatExcludedFileCount ?? 0}</strong>
        <span>Chunks</span>
        <strong>{indexStatus?.index.activeChunks ?? 0} active / {indexStatus?.index.indexedChunks ?? 0} total</strong>
        <span>OCR</span>
        <strong>{indexStatus?.index.ocrEnabled ? "Enabled" : "Disabled"}</strong>
        <span>Last indexed</span>
        <strong>{indexStatus?.index.lastIndexedAt || status?.lastIndexedAt || "Not indexed yet"}</strong>
      </div>

      {activeRun ? (
        <div className="index-progress">
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
        </div>
      ) : null}

      {message ? <div className="notice warning">{message}</div> : null}

      <div className="status-actions">
        <button className="button secondary" type="button" onClick={load}>
          <RefreshCw aria-hidden="true" size={16} />
          Refresh
        </button>
        <button className="button" disabled={activeRun} type="button" onClick={startIndexRun}>
          <FileSearch aria-hidden="true" size={16} />
          Scan / Update Index
        </button>
      </div>
    </details>
  );
}
