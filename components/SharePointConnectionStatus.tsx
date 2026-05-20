"use client";

import { FolderCheck, FolderX } from "lucide-react";
import type { SharePointStatus } from "@/types/sharepoint";

interface SharePointConnectionStatusProps {
  status?: SharePointStatus | null;
}

export function SharePointConnectionStatus({ status }: SharePointConnectionStatusProps) {
  const available = Boolean(status?.available);
  const Icon = available ? FolderCheck : FolderX;

  return (
    <section className="panel" aria-label="SharePoint connection status">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">
            <Icon aria-hidden="true" size={19} />
            Connection Status
          </h2>
          <p className="panel-subtitle">
            {status?.message || "SharePoint folder not accessible"}
          </p>
        </div>
      </div>
      <div className={`notice ${available ? "success" : "error"}`}>
        {available ? "SharePoint folder connected" : "Unable to access SharePoint folder"}
      </div>
      <p className="folder-path">{status?.activeFolder || "No active folder configured"}</p>
    </section>
  );
}
