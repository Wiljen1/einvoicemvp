"use client";

import { RefreshCw, ServerCog, ShieldCheck, Folder } from "lucide-react";
import { useEffect, useState } from "react";

interface StatusResponse {
  ok: true;
  data: {
    codex: {
      available: boolean;
      message: string;
      executionMode: "placeholder" | "real";
    };
    sharepoint: {
      available: boolean;
      message: string;
      activeFolder: string;
      mode: "sharepoint" | "mock" | "unavailable";
    };
  };
}

interface StatusChecksProps {
  refreshKey: number;
  onRefresh: () => void;
}

export function StatusChecks({ refreshKey, onRefresh }: StatusChecksProps) {
  const [status, setStatus] = useState<StatusResponse["data"] | null>(null);
  const [loading, setLoading] = useState(true);

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
  const sharePointAvailable = status?.sharepoint.available;

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
        <span className="status-meta">
          {status?.codex.executionMode === "real" ? "Local Codex execution" : "Local Codex placeholder"}
        </span>
      </div>
      <div className="status-card">
        <div className="status-heading">
          <span>SharePoint Connection</span>
          <ShieldCheck aria-hidden="true" size={17} />
        </div>
        <p className="status-value">
          <span className={`status-dot ${loading ? "pending" : sharePointAvailable ? "ok" : ""}`} />{" "}
          {loading ? "Checking folder access" : status?.sharepoint.message || "SharePoint folder not accessible"}
        </p>
        <span className="status-meta">{status?.sharepoint.mode || "unavailable"}</span>
      </div>
      <div className="status-card">
        <div className="status-heading">
          <span>Active Folder</span>
          <Folder aria-hidden="true" size={17} />
        </div>
        <p className="folder-path">
          {status?.sharepoint.activeFolder || "No approved SharePoint folder configured"}
        </p>
        <button className="button secondary" type="button" onClick={onRefresh}>
          <RefreshCw aria-hidden="true" size={16} />
          Refresh Status
        </button>
      </div>
    </section>
  );
}
