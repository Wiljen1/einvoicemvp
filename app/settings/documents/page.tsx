import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { DocumentSourceSettingsForm } from "@/components/DocumentSourceSettingsForm";

export default function DocumentSettingsPage() {
  return (
    <main className="page-shell">
      <div className="page-header compact-header">
        <div>
          <Link className="back-link" href="/">
            <ArrowLeft aria-hidden="true" size={16} />
            Dashboard
          </Link>
          <h1>Document Source Settings</h1>
          <p>
            Choose the approved local source the chatbot is allowed to read. Use a normal folder,
            a OneDrive-synced SharePoint folder, or uploaded documents for demos.
          </p>
        </div>
      </div>
      <DocumentSourceSettingsForm />
    </main>
  );
}
