"use client";

import Link from "next/link";
import { Settings, Shield } from "lucide-react";
import { useState } from "react";
import type { ChatSessionStatus } from "@/types/chat";
import { ChatWindow } from "./ChatWindow";
import { GuardrailsSummary } from "./GuardrailsSummary";
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

export function KnowledgeAssistantDashboard() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [processingStatus, setProcessingStatus] = useState<ChatSessionStatus>(
    idleProcessingStatus
  );
  const refresh = () => setRefreshKey((current) => current + 1);

  return (
    <main className="page-shell">
      <header className="page-header">
        <div>
          <h1>Knowledge Assistant</h1>
          <p>Local knowledge assistant for approved document sources, guardrails, and indexed answers.</p>
        </div>
        <div className="header-actions">
          <Link className="button secondary" href="/admin">
            <Shield aria-hidden="true" size={16} />
            Admin
          </Link>
          <Link className="button secondary" href="/settings/documents">
            <Settings aria-hidden="true" size={16} />
            Document Settings
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
          <GuardrailsSummary />
        </div>
        <ChatWindow onProcessingStatusChange={setProcessingStatus} />
      </div>
    </main>
  );
}
