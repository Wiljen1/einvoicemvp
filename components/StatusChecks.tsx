"use client";

import { Activity, PlugZap, RefreshCw, ServerCog, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import type { ChatSessionStatus } from "@/types/chat";
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
      mode: "sharepoint" | "mock" | "unavailable";
    };
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

  async function testSharePointConnection() {
    setTesting(true);
    try {
      await fetch("/api/settings/sharepoint/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({})
      });
      onRefresh();
    } finally {
      setTesting(false);
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
          <span>SharePoint Connection</span>
          <ShieldCheck aria-hidden="true" size={17} />
        </div>
        <p className="status-value">
          <span className={`status-dot ${loading ? "pending" : sharePointAvailable ? "ok" : ""}`} />{" "}
          {loading ? "Checking folder access" : status?.sharepoint.message || "SharePoint folder not accessible"}
        </p>
        <span className="status-meta">{status?.sharepoint.mode || "unavailable"}</span>
        <p className="folder-path">
          {status?.sharepoint.activeFolder || "No approved SharePoint folder configured"}
        </p>
        <div className="status-actions">
          <button className="button secondary" type="button" onClick={testSharePointConnection}>
            <PlugZap aria-hidden="true" size={16} />
            {testing ? "Testing" : "Test Connection"}
          </button>
          <button className="button secondary" type="button" onClick={onRefresh}>
            <RefreshCw aria-hidden="true" size={16} />
            Refresh
          </button>
        </div>
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
