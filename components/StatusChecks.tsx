"use client";

import {
  Activity,
  BookOpen,
  FileSearch,
  LogIn,
  LogOut,
  PlugZap,
  RefreshCw,
  ServerCog,
  ShieldCheck,
  UserCheck
} from "lucide-react";
import { useEffect, useState } from "react";
import type { ChatSessionStatus } from "@/types/chat";
import type { DocumentSourceStatus } from "@/types/sharepoint";
import { useMicrosoftAuth } from "./MicrosoftAuthProvider";
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
    sharepoint: {
      available: boolean;
      message: string;
      activeFolder: string;
      mode: "sharepoint" | "mock" | "auth_required" | "access_denied" | "unavailable";
    };
    documents: DocumentSourceStatus;
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
  const [testing, setTesting] = useState(false);
  const [refreshingDocuments, setRefreshingDocuments] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const microsoftAuth = useMicrosoftAuth();
  const {
    configured: microsoftConfigured,
    initializing: microsoftInitializing,
    isAuthenticated: microsoftSignedIn,
    accountName: microsoftAccountName,
    message: microsoftMessage,
    getAccessToken,
    signIn,
    signOut
  } = microsoftAuth;

  useEffect(() => {
    let cancelled = false;

    async function loadStatus() {
      setLoading(true);
      const headers: HeadersInit = {};
      if (microsoftConfigured && microsoftSignedIn) {
        try {
          headers.Authorization = `Bearer ${await getAccessToken()}`;
        } catch {
          // Status will show the Microsoft session issue through the auth card.
        }
      }
      const response = await fetch("/api/status", { cache: "no-store", headers });
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
  }, [refreshKey, microsoftConfigured, microsoftSignedIn, getAccessToken]);

  const codexAvailable = status?.codex.available;
  const documentsAvailable = status?.documents.available;
  const sourceLabel =
    status?.documents.activeSource === "GRAPH_SHAREPOINT"
      ? "SharePoint"
      : status?.documents.activeSource === "LOCAL_SYNCED_FOLDER"
        ? "Local synced documents"
      : status?.documents.activeSource === "MOCK_FOLDER"
        ? "Local documents"
        : "None";
  const indexedFileCount = status?.documents.fileCount ?? 0;
  const skippedFileCount = status?.documents.skippedFileCount ?? 0;
  const indexedFiles = status?.documents.indexedFiles || [];
  const skippedFiles = status?.documents.skippedFiles || [];

  async function testSharePointConnection() {
    setTesting(true);
    try {
      const headers: HeadersInit = {
        "Content-Type": "application/json"
      };
      if (microsoftConfigured) {
        headers.Authorization = `Bearer ${await getAccessToken({ interactive: true })}`;
      }
      await fetch("/api/settings/sharepoint/test", {
        method: "POST",
        headers,
        body: JSON.stringify({})
      });
      onRefresh();
    } finally {
      setTesting(false);
    }
  }

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
          <span>Microsoft Sign-In</span>
          <UserCheck aria-hidden="true" size={17} />
        </div>
        <p className="status-value">
          <span
            className={`status-dot ${
              microsoftInitializing ? "pending" : microsoftSignedIn ? "ok" : ""
            }`}
          />{" "}
          {microsoftInitializing
            ? "Checking Microsoft sign-in"
            : microsoftSignedIn
              ? "Microsoft signed in"
              : microsoftMessage}
        </p>
        {microsoftAccountName ? (
          <span className="status-meta">{microsoftAccountName}</span>
        ) : null}
        <div className="status-actions">
          {microsoftSignedIn ? (
            <button className="button secondary" type="button" onClick={signOut}>
              <LogOut aria-hidden="true" size={16} />
              Sign Out
            </button>
          ) : (
            <button
              className="button secondary"
              disabled={!microsoftConfigured || microsoftInitializing}
              type="button"
              onClick={() => {
                signIn().then(onRefresh).catch(() => undefined);
              }}
            >
              <LogIn aria-hidden="true" size={16} />
              Sign in with Microsoft
            </button>
          )}
        </div>
      </div>

      <div className="status-card">
        <div className="status-heading">
          <span>Document Source</span>
          <ShieldCheck aria-hidden="true" size={17} />
        </div>
        <p className="status-value">
          <span className={`status-dot ${loading ? "pending" : documentsAvailable ? "ok" : ""}`} />{" "}
          {loading ? "Checking folder access" : status?.documents.message || "No document source is currently available."}
        </p>
        <span className="status-meta">Active Source: {sourceLabel}</span>
        <p className="folder-path">
          Folder: {status?.documents.folderUrl || status?.documents.folderPath || "No folder available"}
        </p>
        <span className="status-meta">Files Found: {indexedFileCount}</span>
        <span className="status-meta">
          Last Indexed: {status?.documents.lastIndexedAt || "Not indexed yet"}
        </span>
        <span className="status-meta">
          Recursive Scan: {status?.documents.recursive === false ? "Disabled" : "Enabled"}
        </span>
        <span className="status-meta">
          Supported: {(status?.documents.supportedExtensions || [".txt", ".md", ".json", ".csv", ".pdf"]).join(", ")}
        </span>
        {indexedFileCount > 0 ? (
          <details className="document-file-list">
            <summary>Indexed files ({indexedFileCount})</summary>
            <ul>
              {indexedFiles.slice(0, 20).map((file) => (
                <li key={file.path}>{file.relativePath || file.fileName}</li>
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
        {!loading && documentsAvailable && indexedFileCount === 0 ? (
          <p className="folder-path">
            No readable documents found. Add .txt, .md, .json, .csv, or .pdf files to the folder above,
            then click Refresh Documents.
          </p>
        ) : null}
        {status?.documents.activeSource !== "GRAPH_SHAREPOINT" &&
        status?.documents.configuredSharePointFolderUrl ? (
          <p className="folder-path">
            Configured SharePoint folder: {status.documents.configuredSharePointFolderUrl}
          </p>
        ) : null}
        <div className="status-actions">
          <button className="button secondary" type="button" onClick={testSharePointConnection}>
            <PlugZap aria-hidden="true" size={16} />
            {testing ? "Testing" : "Test Connection"}
          </button>
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
            Put .txt, .md, .json, .csv, or text-based PDF files in the folder shown above. Nested
            folders are scanned recursively. Office files, scanned PDFs, symlinks, hidden/system
            folders, and oversized files are skipped with visible reasons.
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
