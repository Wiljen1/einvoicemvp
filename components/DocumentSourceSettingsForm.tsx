"use client";

import { FormEvent, useEffect, useState } from "react";
import type { DocumentIndexStatus, DocumentSourceConfig, DocumentSourceType } from "@/types/document";

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

  useEffect(() => {
    let cancelled = false;

    fetch("/api/settings/documents", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload: SettingsPayload) => {
        if (!cancelled && payload.ok && payload.data) {
          setConfig(payload.data.config);
          setStatus(payload.data.status);
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

  async function loadSettings() {
    const response = await fetch("/api/settings/documents", { cache: "no-store" });
    const payload = (await response.json()) as SettingsPayload;

    if (payload.ok && payload.data) {
      setConfig(payload.data.config);
      setStatus(payload.data.status);
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
        setStatus(payload.data.status);
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
      const response = await fetch("/api/documents/refresh", { method: "POST" });
      const payload = await response.json();

      if (payload.ok) {
        await loadSettings();
        setMessage("Document index refreshed.");
      } else {
        setMessage(payload.error || "Unable to refresh documents.");
      }
    } finally {
      setAction("idle");
    }
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
        setStatus(settingsPayload.data.status);
      }

      const formData = new FormData();
      Array.from(selectedFiles).forEach((file) => formData.append("files", file));
      const response = await fetch("/api/documents/upload", {
        method: "POST",
        body: formData
      });
      const payload = await response.json();

      if (payload.ok) {
        await loadSettings();
        setSelectedFiles(null);
        setMessage("Documents uploaded and indexed.");
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
        await loadSettings();
        setMessage("Uploaded document deleted.");
      } else {
        setMessage(payload.error || "Unable to delete document.");
      }
    } finally {
      setAction("idle");
    }
  }

  const disabled = action !== "idle";

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
              {action === "refreshing" ? "Refreshing" : "Refresh / Reindex"}
            </button>
          </div>

          {config.mode === "MANUAL_UPLOAD" ? (
            <div className="form-field">
              <span>Upload Documents</span>
              <input
                accept=".pdf,.txt,.md,.markdown,.json,.csv,.pptx,.xlsx,.png,.mp4,.url"
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
        <span className="status-meta">Skipped files: {status?.skippedFileCount ?? 0}</span>
        <span className="status-meta">Last indexed: {status?.lastIndexedAt || "Not indexed yet"}</span>

        {status?.indexedFiles?.length ? (
          <details className="document-file-list" open>
            <summary>Indexed files ({status.fileCount})</summary>
            <ul>
              {status.indexedFiles.slice(0, 50).map((file) => (
                <li key={file.path}>
                  {file.relativePath} - {getIndexedModeLabel(file.indexedMode)}
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
      </section>
    </div>
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
