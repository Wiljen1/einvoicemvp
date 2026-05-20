"use client";

import { RefreshCw, Save, Shield } from "lucide-react";
import { useEffect, useState } from "react";
import type { GuardrailsConfig } from "@/types/guardrails";

const checkboxFields: Array<{
  key: keyof Pick<
    GuardrailsConfig,
    | "answerOnlyFromDocuments"
    | "includeSources"
    | "includeConfidenceScore"
    | "allowInternetBrowsing"
    | "keepAnswersShort"
    | "doNotSpeculate"
    | "sayWhenInformationIsMissing"
  >;
  label: string;
  locked?: boolean;
}> = [
  { key: "answerOnlyFromDocuments", label: "Answer only from SharePoint documents", locked: true },
  { key: "includeSources", label: "Include source references" },
  { key: "includeConfidenceScore", label: "Include confidence score" },
  { key: "allowInternetBrowsing", label: "Allow internet browsing", locked: true },
  { key: "keepAnswersShort", label: "Keep answers short" },
  { key: "doNotSpeculate", label: "Do not speculate" },
  { key: "sayWhenInformationIsMissing", label: "Say when information is missing" }
];

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
      body: JSON.stringify(guardrails)
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

  function updateField<K extends keyof GuardrailsConfig>(key: K, value: GuardrailsConfig[K]) {
    setGuardrails((current) => (current ? { ...current, [key]: value } : current));
  }

  return (
    <section className="panel" aria-label="Guardrails panel">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">
            <Shield aria-hidden="true" size={19} />
            Guardrails
          </h2>
          <p className="panel-subtitle">Rules applied before every answer.</p>
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
          {checkboxFields.map((field) => (
            <label className="guardrail-row" key={field.key}>
              <input
                checked={Boolean(guardrails[field.key])}
                disabled={field.locked}
                type="checkbox"
                onChange={(event) => updateField(field.key, event.target.checked)}
              />
              <span>{field.label}</span>
            </label>
          ))}

          <label className="form-field">
            <span>Tone</span>
            <select
              className="select-field"
              value={guardrails.tone}
              onChange={(event) => updateField("tone", event.target.value)}
            >
              <option value="business-friendly">Business-friendly</option>
              <option value="concise">Concise</option>
              <option value="formal">Formal</option>
              <option value="plain-language">Plain language</option>
            </select>
          </label>

          <label className="form-field">
            <span>Fallback message</span>
            <textarea
              className="text-area"
              value={guardrails.fallbackMessage}
              onChange={(event) => updateField("fallbackMessage", event.target.value)}
            />
          </label>

          <button className="button" disabled={saving} type="button" onClick={saveGuardrails}>
            <Save aria-hidden="true" size={16} />
            {saving ? "Saving" : "Save Guardrails"}
          </button>
          {status ? <div className="field-help">{status}</div> : null}
        </div>
      ) : (
        <div className="field-help">{loading ? "Loading guardrails" : status}</div>
      )}
    </section>
  );
}
