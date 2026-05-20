"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import type {
  DocumentIndexStatus,
  DocumentSourceConfig,
  DocumentSourceType,
  IndexedDocumentFile
} from "@/types/document";

interface SettingsPayload {
  ok: boolean;
  data?: {
    config: DocumentSourceConfig;
    status: DocumentIndexStatus;
  };
  error?: string;
}

const sourceOptions: Array<{ value: DocumentSourceType; label: string }> = [
  { value: "LOCAL_FOLDER", label: "Local Folder" },
  { value: "SYNCED_SHAREPOINT_FOLDER", label: "Synced SharePoint Folder" },
  { value: "MANUAL_UPLOAD", label: "Manual Upload" }
];

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

type DocumentFilter = "ALL" | "ACTIVE" | "CHAT_EXCLUDED" | "INDEX_EXCLUDED";

interface KnownDocumentSource {
  id: string;
  type: DocumentSourceType;
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

interface SourcesPayload {
  ok: boolean;
  data?: {
    sources: KnownDocumentSource[];
  };
  error?: string;
}

export function DocumentSourceSettingsForm() {
  const [config, setConfig] = useState<DocumentSourceConfig>({
    mode: "LOCAL_FOLDER",
    localFolderPath: "",
    syncedFolderPath: ""
  });
  const [status, setStatus] = useState<DocumentIndexStatus | null>(null);
  const [message, setMessage] = useState("");
  const [action, setAction] = useState<"idle" | "saving" | "refreshing" | "uploading" | "deleting">("idle");
  const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null);
  const [indexRun, setIndexRun] = useState<IndexRunProgress | null>(null);
  const [documentFilter, setDocumentFilter] = useState<DocumentFilter>("ALL");
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);
  const [reasonDrafts, setReasonDrafts] = useState<Record<string, string>>({});
  const [bulkReason, setBulkReason] = useState("");
  const [knownSources, setKnownSources] = useState<KnownDocumentSource[]>([]);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function applyStatus(nextStatus: DocumentIndexStatus) {
    setStatus(nextStatus);
    setReasonDrafts(buildReasonDrafts(nextStatus.indexedFiles));
    setSelectedDocumentIds((current) =>
      current.filter((documentId) => nextStatus.indexedFiles.some((file) => file.id === documentId))
    );
  }

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      fetch("/api/settings/documents", { cache: "no-store" }).then((response) => response.json()),
      fetch("/api/document-sources", { cache: "no-store" }).then((response) => response.json())
    ])
      .then(([settingsPayload, sourcesPayload]: [SettingsPayload, SourcesPayload]) => {
        if (!cancelled) {
          if (settingsPayload.ok && settingsPayload.data) {
            setConfig(settingsPayload.data.config);
            applyStatus(settingsPayload.data.status);
          }

          if (sourcesPayload.ok && sourcesPayload.data) {
            setKnownSources(sourcesPayload.data.sources);
          }
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMessage("Unable to load document source settings.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (pollTimer.current) {
        clearTimeout(pollTimer.current);
      }
    };
  }, []);

  async function loadSettings() {
    const [settingsResponse, sourcesResponse] = await Promise.all([
      fetch("/api/settings/documents", { cache: "no-store" }),
      fetch("/api/document-sources", { cache: "no-store" })
    ]);
    const [payload, sourcesPayload] = (await Promise.all([
      settingsResponse.json(),
      sourcesResponse.json()
    ])) as [SettingsPayload, SourcesPayload];

    if (payload.ok && payload.data) {
      setConfig(payload.data.config);
      applyStatus(payload.data.status);
    }

    if (sourcesPayload.ok && sourcesPayload.data) {
      setKnownSources(sourcesPayload.data.sources);
    }
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAction("saving");
    setMessage("");

    try {
      const response = await fetch("/api/settings/documents", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(config)
      });
      const payload = (await response.json()) as SettingsPayload;

      if (!response.ok || !payload.ok || !payload.data) {
        setMessage(payload.error || "Unable to save document source settings.");
      } else {
        setConfig(payload.data.config);
        applyStatus(payload.data.status);
        setMessage("Document source settings saved.");
      }
    } finally {
      setAction("idle");
    }
  }

  async function refreshIndex() {
    setAction("refreshing");
    setMessage("");

    try {
      const response = await fetch("/api/index/run", { method: "POST" });
      const payload = await response.json();

      if (payload.ok) {
        const run = payload.data as IndexRunProgress;
        setIndexRun(run);
        setMessage("Document index update started.");
        pollIndexRun(run.id);
      } else {
        setMessage(payload.error || "Unable to start document indexing.");
      }
    } finally {
      setAction("idle");
    }
  }

  async function pollIndexRun(runId: string) {
    const response = await fetch(`/api/index/run/${encodeURIComponent(runId)}`, {
      cache: "no-store"
    });
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

    await loadSettings();
    setMessage(
      run.status === "COMPLETED"
        ? "Document index updated."
        : run.status === "CANCELLED"
          ? "Document index update cancelled."
          : run.error || "Document index update failed."
    );
  }

  async function uploadDocuments() {
    if (!selectedFiles || selectedFiles.length === 0) {
      setMessage("Choose at least one document to upload.");
      return;
    }

    setAction("uploading");
    setMessage("");

    try {
      if (config.mode === "MANUAL_UPLOAD" && status?.activeSource !== "MANUAL_UPLOAD") {
        const settingsResponse = await fetch("/api/settings/documents", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(config)
        });
        const settingsPayload = (await settingsResponse.json()) as SettingsPayload;

        if (!settingsResponse.ok || !settingsPayload.ok || !settingsPayload.data) {
          setMessage(settingsPayload.error || "Save Manual Upload mode before uploading documents.");
          return;
        }

        setConfig(settingsPayload.data.config);
        applyStatus(settingsPayload.data.status);
      }

      const formData = new FormData();
      Array.from(selectedFiles).forEach((file) => formData.append("files", file));
      const response = await fetch("/api/documents/upload", {
        method: "POST",
        body: formData
      });
      const payload = await response.json();

      if (payload.ok) {
        setSelectedFiles(null);
        const run = payload.data as IndexRunProgress;
        setIndexRun(run);
        setMessage("Documents uploaded. Indexing started.");
        pollIndexRun(run.id);
      } else {
        setMessage(payload.error || "Unable to upload documents.");
      }
    } finally {
      setAction("idle");
    }
  }

  async function deleteUpload(relativePath: string) {
    setAction("deleting");
    setMessage("");

    try {
      const response = await fetch("/api/documents/upload", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ relativePath })
      });
      const payload = await response.json();

      if (payload.ok) {
        const run = payload.data as IndexRunProgress;
        setIndexRun(run);
        setMessage("Uploaded document deleted. Indexing started.");
        pollIndexRun(run.id);
      } else {
        setMessage(payload.error || "Unable to delete document.");
      }
    } finally {
      setAction("idle");
    }
  }

  async function updateDocumentExclusion(
    file: IndexedDocumentFile,
    patch: {
      excludedFromChat?: boolean;
      excludedFromIndexing?: boolean;
      exclusionReason?: string | null;
    }
  ) {
    setAction("saving");
    setMessage("");

    try {
      const response = await fetch(`/api/index/documents/${encodeURIComponent(file.id)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          excludedFromChat: patch.excludedFromChat ?? file.excludedFromChat,
          excludedFromIndexing: patch.excludedFromIndexing ?? file.excludedFromIndexing,
          exclusionReason:
            patch.exclusionReason === undefined
              ? reasonDrafts[file.id] || file.exclusionReason || ""
              : patch.exclusionReason
        })
      });
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        setMessage(payload.error || "Unable to update document exclusion.");
        return;
      }

      await loadSettings();
      setMessage("Document exclusion updated.");
    } finally {
      setAction("idle");
    }
  }

  async function bulkUpdateExclusions(patch: {
    excludedFromChat?: boolean;
    excludedFromIndexing?: boolean;
    exclusionReason?: string | null;
  }) {
    if (selectedDocumentIds.length === 0) {
      setMessage("Select at least one indexed document first.");
      return;
    }

    setAction("saving");
    setMessage("");

    try {
      const response = await fetch("/api/index/documents/bulk-update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          documentIds: selectedDocumentIds,
          ...patch,
          exclusionReason: patch.exclusionReason === undefined ? bulkReason : patch.exclusionReason
        })
      });
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        setMessage(payload.error || "Unable to update selected documents.");
        return;
      }

      setSelectedDocumentIds([]);
      setBulkReason("");
      await loadSettings();
      setMessage("Selected documents updated.");
    } finally {
      setAction("idle");
    }
  }

  async function selectKnownSource(sourceId: string) {
    setAction("saving");
    setMessage("");

    try {
      const response = await fetch("/api/document-sources/select", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ sourceId })
      });
      const payload = (await response.json()) as SettingsPayload;

      if (!response.ok || !payload.ok || !payload.data) {
        setMessage(payload.error || "Unable to switch document source.");
        return;
      }

      setConfig(payload.data.config);
      applyStatus(payload.data.status);
      await loadSettings();
      setMessage("Document source switched.");
    } finally {
      setAction("idle");
    }
  }

  async function removeKnownSource(sourceId: string) {
    setAction("deleting");
    setMessage("");

    try {
      const response = await fetch(`/api/document-sources/${encodeURIComponent(sourceId)}`, {
        method: "DELETE"
      });
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        setMessage(payload.error || "Unable to remove document source.");
        return;
      }

      await loadSettings();
      setMessage("Previously used folder removed from the local database.");
    } finally {
      setAction("idle");
    }
  }

  function toggleSelectedDocument(documentId: string, checked: boolean) {
    setSelectedDocumentIds((current) =>
      checked
        ? Array.from(new Set([...current, documentId]))
        : current.filter((id) => id !== documentId)
    );
  }

  const activeIndexRun = indexRun?.status === "QUEUED" || indexRun?.status === "RUNNING";
  const disabled = action !== "idle" || activeIndexRun;
  const startupWarnings = status?.startupValidation.warnings || [];
  const filteredIndexedFiles = filterIndexedFiles(status?.indexedFiles || [], documentFilter);

  return (
    <div className="settings-layout">
      <section className="panel" aria-label="Document source settings form">
        <form className="settings-form" onSubmit={saveSettings}>
          <label className="form-field">
            <span>Document Source Mode</span>
            <select
              className="text-field"
              value={config.mode}
              onChange={(event) =>
                setConfig((current) => ({
                  ...current,
                  mode: event.target.value as DocumentSourceType
                }))
              }
            >
              {sourceOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="form-field">
            <span>Local Folder Path</span>
            <input
              className="text-field"
              placeholder="/absolute/path/to/documents"
              value={config.localFolderPath}
              onChange={(event) =>
                setConfig((current) => ({
                  ...current,
                  localFolderPath: event.target.value
                }))
              }
            />
          </label>

          <label className="form-field">
            <span>Synced SharePoint Folder Path</span>
            <input
              className="text-field"
              placeholder="/Users/name/OneDrive/.../Electronic Invoicing"
              value={config.syncedFolderPath}
              onChange={(event) =>
                setConfig((current) => ({
                  ...current,
                  syncedFolderPath: event.target.value
                }))
              }
            />
            <span className="field-help">
              Use OneDrive to sync the approved SharePoint folder to your machine, then select that
              local synced folder path here.
            </span>
          </label>

          <div className="settings-actions">
            <button className="button" disabled={disabled} type="submit">
              {action === "saving" ? "Saving" : "Save Settings"}
            </button>
            <button className="button secondary" disabled={disabled} type="button" onClick={refreshIndex}>
              {action === "refreshing" ? "Starting" : "Scan / Update Index"}
            </button>
          </div>

          {config.mode === "MANUAL_UPLOAD" ? (
            <div className="form-field">
              <span>Upload Documents</span>
              <input
                accept=".pdf,.txt,.md,.markdown,.json,.csv,.docx,.pptx,.xlsx,.png,.jpg,.jpeg,.mp4,.url"
                className="text-field"
                multiple
                type="file"
                onChange={(event) => setSelectedFiles(event.target.files)}
              />
              <button className="button secondary" disabled={disabled} type="button" onClick={uploadDocuments}>
                {action === "uploading" ? "Uploading" : "Upload Documents"}
              </button>
            </div>
          ) : null}

          {message ? <div className="field-help">{message}</div> : null}
        </form>
      </section>

      <section className="panel" aria-label="Document source status">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Document Source Status</h2>
            <p className="panel-subtitle">{status?.message || "No document source loaded."}</p>
          </div>
        </div>
        <p className="folder-path">Active Source: {status?.displayName || "None"}</p>
        <p className="folder-path">Folder: {status?.folderPath || "No folder available"}</p>
        <span className="status-meta">Indexed files: {status?.fileCount ?? 0}</span>
        <span className="status-meta">Active files: {status?.activeFileCount ?? 0}</span>
        <span className="status-meta">Chat-excluded files: {status?.chatExcludedFileCount ?? 0}</span>
        <span className="status-meta">Index-excluded files: {status?.indexExcludedFileCount ?? 0}</span>
        <span className="status-meta">Skipped files: {status?.skippedFileCount ?? 0}</span>
        <span className="status-meta">Failed extractions: {status?.failedFileCount ?? 0}</span>
        <span className="status-meta">OCR: {status?.ocrEnabled ? "Enabled" : "Disabled"}</span>
        <span className="status-meta">OCR processed files: {status?.ocrProcessedCount ?? 0}</span>
        <span className="status-meta">
          Supported file types: {status?.supportedExtensions.join(", ") || "Unknown"}
        </span>
        <span className="status-meta">
          Extractors: {status?.startupValidation.extractors.registered.join(", ") || "Unknown"}
        </span>
        <span className="status-meta">Last indexed: {status?.lastIndexedAt || "Not indexed yet"}</span>

        {startupWarnings.length ? (
          <div className="notice warning">
            {startupWarnings.map((warning) => (
              <div key={warning}>{warning}</div>
            ))}
          </div>
        ) : null}

        {indexRun ? (
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

        {status?.indexedFiles?.length ? (
          <details className="document-file-list" open>
            <summary>Indexed files ({filteredIndexedFiles.length} shown / {status.fileCount} total)</summary>
            <div className="document-exclusion-toolbar">
              <label className="compact-field">
                <span>Filter</span>
                <select
                  className="text-field"
                  value={documentFilter}
                  onChange={(event) => setDocumentFilter(event.target.value as DocumentFilter)}
                >
                  <option value="ALL">All</option>
                  <option value="ACTIVE">Active</option>
                  <option value="CHAT_EXCLUDED">Excluded from Chat</option>
                  <option value="INDEX_EXCLUDED">Excluded from Indexing</option>
                </select>
              </label>
              <label className="compact-field grow">
                <span>Bulk exclusion reason</span>
                <input
                  className="text-field"
                  placeholder="Optional reason"
                  value={bulkReason}
                  onChange={(event) => setBulkReason(event.target.value)}
                />
              </label>
              <button
                className="button secondary"
                disabled={disabled || selectedDocumentIds.length === 0}
                type="button"
                onClick={() => bulkUpdateExclusions({ excludedFromChat: true })}
              >
                Exclude selected from Chat
              </button>
              <button
                className="button secondary"
                disabled={disabled || selectedDocumentIds.length === 0}
                type="button"
                onClick={() => bulkUpdateExclusions({ excludedFromIndexing: true })}
              >
                Exclude selected from Indexing
              </button>
              <button
                className="button secondary"
                disabled={disabled || selectedDocumentIds.length === 0}
                type="button"
                onClick={() =>
                  bulkUpdateExclusions({
                    excludedFromChat: false,
                    excludedFromIndexing: false,
                    exclusionReason: null
                  })
                }
              >
                Re-enable selected documents
              </button>
            </div>
            <ul>
              {filteredIndexedFiles.slice(0, 50).map((file) => (
                <li className="document-exclusion-row" key={file.path}>
                  <label className="document-select">
                    <input
                      checked={selectedDocumentIds.includes(file.id)}
                      disabled={disabled}
                      type="checkbox"
                      onChange={(event) => toggleSelectedDocument(file.id, event.target.checked)}
                    />
                    <span>{file.relativePath}</span>
                  </label>
                  <div className="document-exclusion-meta">
                    <span>{getIndexedModeLabel(file.indexedMode)}</span>
                    <span className={file.excludedFromChat ? "status-badge warning" : "status-badge ok"}>
                      {file.excludedFromChat ? "Chat Excluded" : "Active"}
                    </span>
                    <span className={file.excludedFromIndexing ? "status-badge warning" : "status-badge ok"}>
                      {file.excludedFromIndexing ? "Indexing Excluded" : "Indexing Active"}
                    </span>
                  </div>
                  <div className="document-exclusion-controls">
                    <label>
                      <input
                        checked={file.excludedFromChat}
                        disabled={disabled}
                        type="checkbox"
                        onChange={(event) =>
                          updateDocumentExclusion(file, {
                            excludedFromChat: event.target.checked
                          })
                        }
                      />{" "}
                      Exclude from Chat
                    </label>
                    <label>
                      <input
                        checked={file.excludedFromIndexing}
                        disabled={disabled}
                        type="checkbox"
                        onChange={(event) =>
                          updateDocumentExclusion(file, {
                            excludedFromIndexing: event.target.checked
                          })
                        }
                      />{" "}
                      Exclude from Future Indexing
                    </label>
                  </div>
                  <div className="document-exclusion-reason">
                    <input
                      className="text-field"
                      disabled={disabled}
                      placeholder="Optional exclusion reason"
                      value={reasonDrafts[file.id] || ""}
                      onChange={(event) =>
                        setReasonDrafts((current) => ({
                          ...current,
                          [file.id]: event.target.value
                        }))
                      }
                    />
                    <button
                      className="button secondary"
                      disabled={disabled}
                      type="button"
                      onClick={() =>
                        updateDocumentExclusion(file, {
                          exclusionReason: reasonDrafts[file.id] || null
                        })
                      }
                    >
                      Save Reason
                    </button>
                  </div>
                  {file.metadata.extractionWarnings?.length
                    ? ` - ${file.metadata.extractionWarnings.join(" ")}`
                    : ""}
                  {status.activeSource === "MANUAL_UPLOAD" ? (
                    <button
                      className="inline-action"
                      disabled={disabled}
                      type="button"
                      onClick={() => deleteUpload(file.relativePath)}
                    >
                      Delete
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          </details>
        ) : null}

        {status?.skippedFiles?.length ? (
          <details className="document-file-list">
            <summary>Skipped files ({status.skippedFileCount})</summary>
            <ul>
              {status.skippedFiles.slice(0, 50).map((file) => (
                <li key={file.path}>
                  {file.relativePath} - {file.reason}
                </li>
              ))}
            </ul>
          </details>
        ) : null}

        {status?.ocrFailedFiles?.length ? (
          <details className="document-file-list">
            <summary>OCR not processed ({status.ocrFailedFiles.length})</summary>
            <ul>
              {status.ocrFailedFiles.slice(0, 50).map((file) => (
                <li key={file.relativePath}>
                  {file.relativePath} - {file.reason}
                </li>
              ))}
            </ul>
          </details>
        ) : null}

        {knownSources.length ? (
          <details className="document-file-list" open>
            <summary>Previously Used Folders ({knownSources.length})</summary>
            <ul>
              {knownSources.map((source) => (
                <li className="known-source-row" key={source.id}>
                  <div>
                    <strong>{source.displayName}</strong>
                    <div className="folder-path">{source.rootPath}</div>
                    <div className="status-meta">
                      Last indexed: {source.lastScannedAt || "Not indexed yet"} | Indexed:{" "}
                      {source.indexedDocuments} | Active: {source.activeDocuments} | Excluded from chat:{" "}
                      {source.excludedFromChat} | Excluded from indexing: {source.excludedFromIndexing}
                    </div>
                    <div className={source.needsUpdate ? "status-badge warning" : "status-badge ok"}>
                      {source.needsUpdate
                        ? `Needs update (${source.newFiles} new, ${source.changedFiles} changed, ${source.deletedFiles} deleted)`
                        : "Fresh"}
                    </div>
                  </div>
                  <div className="known-source-actions">
                    <button
                      className="button secondary"
                      disabled={disabled || status?.folderPath === source.rootPath}
                      type="button"
                      onClick={() => selectKnownSource(source.id)}
                    >
                      Switch to Folder
                    </button>
                    <button
                      className="button secondary"
                      disabled={disabled || status?.folderPath === source.rootPath}
                      type="button"
                      onClick={() => removeKnownSource(source.id)}
                    >
                      Remove Source
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </section>
    </div>
  );
}

function buildReasonDrafts(files: IndexedDocumentFile[]): Record<string, string> {
  return Object.fromEntries(files.map((file) => [file.id, file.exclusionReason || ""]));
}

function filterIndexedFiles(files: IndexedDocumentFile[], filter: DocumentFilter): IndexedDocumentFile[] {
  if (filter === "ACTIVE") {
    return files.filter((file) => !file.excludedFromChat && !file.excludedFromIndexing);
  }

  if (filter === "CHAT_EXCLUDED") {
    return files.filter((file) => file.excludedFromChat);
  }

  if (filter === "INDEX_EXCLUDED") {
    return files.filter((file) => file.excludedFromIndexing);
  }

  return files;
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
