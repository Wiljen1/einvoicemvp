"use client";

import Link from "next/link";
import { Settings } from "lucide-react";
import { useState } from "react";
import { ChatWindow } from "./ChatWindow";
import { GuardrailsPanel } from "./GuardrailsPanel";
import { StatusChecks } from "./StatusChecks";

export function EInvoiceDashboard() {
  const [refreshKey, setRefreshKey] = useState(0);
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

      <StatusChecks refreshKey={refreshKey} onRefresh={refresh} />

      <div className="dashboard-grid">
        <div className="side-stack">
          <GuardrailsPanel onSaved={refresh} />
        </div>
        <ChatWindow />
      </div>
    </main>
  );
}
