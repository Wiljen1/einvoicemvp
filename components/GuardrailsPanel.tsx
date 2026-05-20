"use client";

import { RefreshCw, RotateCcw, Save, Shield } from "lucide-react";
import { useEffect, useState } from "react";
import type { GuardrailsConfig } from "@/types/guardrails";

interface GuardrailsPanelProps {
  onSaved: () => void;
}

export function GuardrailsPanel({ onSaved }: GuardrailsPanelProps) {
  const [guardrails, setGuardrails] = useState<GuardrailsConfig | null>(null);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function fetchGuardrails() {
    const response = await fetch("/api/guardrails", { cache: "no-store" });
    const payload = await response.json();
    return payload.data as GuardrailsConfig;
  }

  async function loadGuardrails() {
    setLoading(true);
    setStatus("");
    const data = await fetchGuardrails();
    setGuardrails(data);
    setLoading(false);
  }

  useEffect(() => {
    let cancelled = false;

    fetchGuardrails()
      .then((data) => {
        if (!cancelled) {
          setGuardrails(data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStatus("Unable to load guardrails.");
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function saveGuardrails() {
    if (!guardrails) {
      return;
    }

    setSaving(true);
    setStatus("");

    const response = await fetch("/api/guardrails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        userGuardrails: guardrails.userGuardrails
      })
    });
    const payload = await response.json();

    if (!response.ok) {
      setStatus(payload.error || "Unable to save guardrails.");
    } else {
      setGuardrails(payload.data);
      setStatus("Guardrails saved.");
      onSaved();
    }

    setSaving(false);
  }

  async function resetUserGuardrails() {
    setSaving(true);
    setStatus("");

    const response = await fetch("/api/guardrails/reset-user", {
      method: "POST"
    });
    const payload = await response.json();

    if (!response.ok) {
      setStatus(payload.error || "Unable to reset guardrails.");
    } else {
      setGuardrails(payload.data);
      setStatus("Additional guardrails reset.");
      onSaved();
    }

    setSaving(false);
  }

  return (
    <section className="panel" aria-label="Guardrails panel">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">
            <Shield aria-hidden="true" size={19} />
            Guardrails
          </h2>
          <p className="panel-subtitle">Fixed safety rules plus optional added instructions.</p>
        </div>
        <button
          aria-label="Refresh guardrails"
          className="icon-button"
          disabled={loading}
          title="Refresh guardrails"
          type="button"
          onClick={() => loadGuardrails()}
        >
          <RefreshCw aria-hidden="true" size={17} />
        </button>
      </div>

      {guardrails ? (
        <div className="guardrail-form">
          <div className="system-guardrails" aria-label="System guardrails">
            {guardrails.systemGuardrails.map((rule) => (
              <div className="guardrail-fixed-row" key={rule}>
                <span className="status-dot ok" />
                <span>{rule}</span>
              </div>
            ))}
          </div>

          <label className="form-field">
            <span>Additional Guardrails</span>
            <textarea
              className="text-area"
              placeholder="Example: Prefer bullet points for invoice workflow answers."
              value={guardrails.userGuardrails}
              onChange={(event) =>
                setGuardrails((current) =>
                  current ? { ...current, userGuardrails: event.target.value } : current
                )
              }
            />
            <span className="field-help">
              These instructions are added on top of the fixed safety guardrails. They cannot
              override document-only answering rules.
            </span>
          </label>

          <div className="settings-actions">
            <button className="button" disabled={saving} type="button" onClick={saveGuardrails}>
              <Save aria-hidden="true" size={16} />
              {saving ? "Saving" : "Save Guardrails"}
            </button>
            <button
              className="button secondary"
              disabled={saving}
              type="button"
              onClick={resetUserGuardrails}
            >
              <RotateCcw aria-hidden="true" size={16} />
              Reset Additional Guardrails
            </button>
          </div>
          {status ? <div className="field-help">{status}</div> : null}
        </div>
      ) : (
        <div className="field-help">{loading ? "Loading guardrails" : status}</div>
      )}
    </section>
  );
}
