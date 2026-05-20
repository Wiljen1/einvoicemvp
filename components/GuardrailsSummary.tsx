"use client";

import Link from "next/link";
import { Shield } from "lucide-react";
import { useEffect, useState } from "react";
import type { GuardrailsConfig } from "@/types/guardrails";

export function GuardrailsSummary() {
  const [guardrails, setGuardrails] = useState<GuardrailsConfig | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/guardrails", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload) => {
        if (!cancelled && payload.ok) {
          setGuardrails(payload.data);
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="panel compact-panel" aria-label="Guardrails summary">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">
            <Shield aria-hidden="true" size={18} />
            Guardrails
          </h2>
          <p className="panel-subtitle">Protected document-only answering is active.</p>
        </div>
        <Link className="button secondary" href="/admin">
          Admin
        </Link>
      </div>
      <div className="summary-list">
        <span>{guardrails?.systemGuardrails.length || 0} protected rules</span>
        <span>{guardrails?.userGuardrails?.trim() ? "Additional instructions active" : "No additional instructions"}</span>
      </div>
    </section>
  );
}
