"use client";

import { FormEvent, useEffect, useState } from "react";
import type { PublicSharePointConfig, SharePointStatus } from "@/types/sharepoint";
import { SharePointConnectionStatus } from "./SharePointConnectionStatus";
import { SaveSettingsButton, TestConnectionButton } from "./SharePointSettingsButtons";

interface SettingsPayload {
  ok: boolean;
  data?: {
    config: PublicSharePointConfig;
    status: SharePointStatus;
  };
  error?: string;
}

interface SharePointFormState {
  siteUrl: string;
  folderPath: string;
  tenantId: string;
  clientId: string;
  clientSecret: string;
  documentLibraryName: string;
}

const emptyForm: SharePointFormState = {
  siteUrl: "",
  folderPath: "",
  tenantId: "",
  clientId: "",
  clientSecret: "",
  documentLibraryName: ""
};

export function SharePointSettingsForm() {
  const [form, setForm] = useState<SharePointFormState>(emptyForm);
  const [status, setStatus] = useState<SharePointStatus | null>(null);
  const [secretConfigured, setSecretConfigured] = useState(false);
  const [message, setMessage] = useState("");
  const [action, setAction] = useState<"idle" | "saving" | "testing">("idle");

  useEffect(() => {
    async function loadSettings() {
      const response = await fetch("/api/settings/sharepoint", { cache: "no-store" });
      const payload = (await response.json()) as SettingsPayload;
      if (payload.ok && payload.data) {
        setFromPublicConfig(payload.data.config);
        setStatus(payload.data.status);
      }
    }

    loadSettings().catch(() => setMessage("Unable to load SharePoint settings."));
  }, []);

  function setFromPublicConfig(config: PublicSharePointConfig) {
    setForm({
      siteUrl: config.siteUrl,
      folderPath: config.folderPath,
      tenantId: config.tenantId,
      clientId: config.clientId,
      clientSecret: "",
      documentLibraryName: config.documentLibraryName
    });
    setSecretConfigured(config.clientSecretConfigured);
  }

  function updateField<K extends keyof SharePointFormState>(key: K, value: SharePointFormState[K]) {
    setForm((current) => ({
      ...current,
      [key]: value
    }));
  }

  async function submitSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const mode = submitter?.value === "test" ? "testing" : "saving";
    setAction(mode);
    setMessage("");

    const endpoint = mode === "testing" ? "/api/settings/sharepoint/test" : "/api/settings/sharepoint";
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(form)
    });
    const payload = (await response.json()) as SettingsPayload;

    if (!response.ok || !payload.ok || !payload.data) {
      setMessage(payload.error || "Unable to update SharePoint settings.");
    } else {
      setFromPublicConfig(payload.data.config);
      setStatus(payload.data.status);
      setMessage(mode === "testing" ? "Connection test complete." : "SharePoint settings saved.");
    }

    setAction("idle");
  }

  return (
    <div className="settings-layout">
      <section className="panel" aria-label="SharePoint settings form">
        <form className="settings-form" onSubmit={submitSettings}>
          <label className="form-field">
            <span>SharePoint Site URL</span>
            <input
              className="text-field"
              placeholder="https://company.sharepoint.com/sites/einvoice"
              type="url"
              value={form.siteUrl}
              onChange={(event) => updateField("siteUrl", event.target.value)}
            />
          </label>

          <label className="form-field">
            <span>SharePoint Folder URL or Folder Path</span>
            <input
              className="text-field"
              placeholder="Shared Documents/Approved"
              value={form.folderPath}
              onChange={(event) => updateField("folderPath", event.target.value)}
            />
          </label>

          <label className="form-field">
            <span>Tenant ID</span>
            <input
              className="text-field"
              value={form.tenantId}
              onChange={(event) => updateField("tenantId", event.target.value)}
            />
          </label>

          <label className="form-field">
            <span>Client ID</span>
            <input
              className="text-field"
              value={form.clientId}
              onChange={(event) => updateField("clientId", event.target.value)}
            />
          </label>

          <label className="form-field">
            <span>Client Secret</span>
            <input
              className="text-field"
              placeholder={secretConfigured ? "Saved secret configured" : ""}
              type="password"
              value={form.clientSecret}
              onChange={(event) => updateField("clientSecret", event.target.value)}
            />
            <span className="field-help">Secrets stay on the server and are never returned to the browser.</span>
          </label>

          <label className="form-field">
            <span>Optional Document Library Name</span>
            <input
              className="text-field"
              placeholder="Documents"
              value={form.documentLibraryName}
              onChange={(event) => updateField("documentLibraryName", event.target.value)}
            />
          </label>

          <div className="settings-actions">
            <TestConnectionButton disabled={action !== "idle"} loading={action === "testing"} />
            <SaveSettingsButton disabled={action !== "idle"} loading={action === "saving"} />
          </div>

          {message ? <div className="field-help">{message}</div> : null}
        </form>
      </section>

      <SharePointConnectionStatus status={status} />
    </div>
  );
}
