"use client";

import Link from "next/link";
import { Settings } from "lucide-react";
import { useState } from "react";
import type { ChatSessionStatus } from "@/types/chat";
import { ChatWindow } from "./ChatWindow";
import { GuardrailsPanel } from "./GuardrailsPanel";
import { StatusChecks } from "./StatusChecks";

const idleProcessingStatus: ChatSessionStatus = {
  sessionId: "",
  status: "IDLE",
  progress: 0,
  step: "Idle",
  answer: null,
  confidence: null,
  sources: [],
  error: null
};

export function EInvoiceDashboard() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [processingStatus, setProcessingStatus] = useState<ChatSessionStatus>(
    idleProcessingStatus
  );
  const refresh = () => setRefreshKey((current) => current + 1);

  return (
    <main className="page-shell">
      <header className="page-header">
        <div>
          <h1>E-Invoice MVP</h1>
          <p>
            Local approved-source chatbot for client e-invoicing documents, with editable
            guardrails and SharePoint folder controls.
          </p>
        </div>
        <div className="header-actions">
          <Link className="button secondary" href="/settings/sharepoint">
            <Settings aria-hidden="true" size={16} />
            SharePoint Settings
          </Link>
        </div>
      </header>

      <StatusChecks
        processingStatus={processingStatus}
        refreshKey={refreshKey}
        onRefresh={refresh}
      />

      <div className="dashboard-grid">
        <div className="side-stack">
          <GuardrailsPanel onSaved={refresh} />
        </div>
        <ChatWindow onProcessingStatusChange={setProcessingStatus} />
      </div>
    </main>
  );
}
