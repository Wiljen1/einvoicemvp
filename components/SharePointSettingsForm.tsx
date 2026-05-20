"use client";

import { FormEvent, useEffect, useState } from "react";
import type { PublicSharePointConfig, SharePointStatus } from "@/types/sharepoint";
import { useMicrosoftAuth } from "./MicrosoftAuthProvider";
import { SharePointConnectionStatus } from "./SharePointConnectionStatus";
import { SaveSettingsButton, TestConnectionButton } from "./SharePointSettingsButtons";

const testSharePointFolderUrl =
  "https://oracle.sharepoint.com/sites/netsuite-suitesuccess-published-assets/SuiteSuccess%20Assets/Forms/AllItems.aspx?FolderCTID=0x012000FBD7834DB23C304CA88C2ABEE32E392F&id=%2Fsites%2Fnetsuite%2Dsuitesuccess%2Dpublished%2Dassets%2FSuiteSuccess%20Assets%2FElectronic%20Invoicing";
const testSharePointSiteUrl =
  "https://oracle.sharepoint.com/sites/netsuite-suitesuccess-published-assets";

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
  documentLibraryName: string;
}

const emptyForm: SharePointFormState = {
  siteUrl: "",
  folderPath: "",
  tenantId: "",
  clientId: "",
  documentLibraryName: ""
};

export function SharePointSettingsForm() {
  const [form, setForm] = useState<SharePointFormState>(emptyForm);
  const [status, setStatus] = useState<SharePointStatus | null>(null);
  const [message, setMessage] = useState("");
  const [action, setAction] = useState<"idle" | "saving" | "testing">("idle");
  const microsoftAuth = useMicrosoftAuth();
  const {
    configured: microsoftConfigured,
    isAuthenticated: microsoftSignedIn,
    getAccessToken,
    signIn,
    refreshConfig
  } = microsoftAuth;

  useEffect(() => {
    async function loadSettings() {
      const headers: HeadersInit = {};
      if (microsoftConfigured && microsoftSignedIn) {
        try {
          headers.Authorization = `Bearer ${await getAccessToken()}`;
        } catch {
          // Settings can still load without a token; connection status will explain sign-in.
        }
      }
      const response = await fetch("/api/settings/sharepoint", { cache: "no-store", headers });
      const payload = (await response.json()) as SettingsPayload;
      if (payload.ok && payload.data) {
        setFromPublicConfig(payload.data.config);
        setStatus(payload.data.status);
      }
    }

    loadSettings().catch(() => setMessage("Unable to load SharePoint settings."));
  }, [microsoftConfigured, microsoftSignedIn, getAccessToken]);

  function setFromPublicConfig(config: PublicSharePointConfig) {
    setForm({
      siteUrl: config.siteUrl,
      folderPath: config.folderUrl || config.folderPath,
      tenantId: config.tenantId,
      clientId: config.clientId,
      documentLibraryName: config.documentLibraryName
    });
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
    const headers: HeadersInit = {
      "Content-Type": "application/json"
    };

    if (mode === "testing" || microsoftSignedIn) {
      if (!microsoftConfigured && mode === "testing") {
        setMessage("Save Tenant ID and Client ID, then sign in with Microsoft before testing.");
        setAction("idle");
        return;
      }

      if (microsoftConfigured) {
        headers.Authorization = `Bearer ${await getAccessToken({ interactive: mode === "testing" })}`;
      }
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(form)
    });
    const payload = (await response.json()) as SettingsPayload;

    if (!response.ok || !payload.ok || !payload.data) {
      setMessage(payload.error || "Unable to update SharePoint settings.");
    } else {
      setFromPublicConfig(payload.data.config);
      setStatus(payload.data.status);
      refreshConfig();
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
              placeholder={testSharePointSiteUrl}
              type="url"
              value={form.siteUrl}
              onChange={(event) => updateField("siteUrl", event.target.value)}
            />
          </label>

          <label className="form-field">
            <span>SharePoint Folder URL or Folder Path</span>
            <input
              className="text-field"
              placeholder={testSharePointFolderUrl}
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

          <div className="field-help">
            This MVP uses Microsoft delegated sign-in with PKCE. No client secret is needed or
            accepted by the browser.
          </div>

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
            <button
              className="button secondary"
              disabled={!microsoftConfigured || microsoftSignedIn || action !== "idle"}
              type="button"
              onClick={() => signIn().catch(() => setMessage("Microsoft sign-in did not complete."))}
            >
              Sign in with Microsoft
            </button>
            <TestConnectionButton disabled={action !== "idle"} loading={action === "testing"} />
            <SaveSettingsButton disabled={action !== "idle"} loading={action === "saving"} />
            <button
              className="button secondary"
              disabled={action !== "idle"}
              type="button"
              onClick={() =>
                setForm((current) => ({
                  ...current,
                  siteUrl: testSharePointSiteUrl,
                  folderPath: testSharePointFolderUrl,
                  documentLibraryName: "SuiteSuccess Assets"
                }))
              }
            >
              Use Test Link
            </button>
          </div>

          {message ? <div className="field-help">{message}</div> : null}
        </form>
      </section>

      <SharePointConnectionStatus status={status} />
    </div>
  );
}
