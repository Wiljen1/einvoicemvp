import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { SharePointSettingsForm } from "@/components/SharePointSettingsForm";

export default function SharePointSettingsPage() {
  return (
    <main className="page-shell">
      <div className="page-header compact-header">
        <div>
          <Link className="back-link" href="/">
            <ArrowLeft aria-hidden="true" size={16} />
            Dashboard
          </Link>
          <h1>SharePoint Configuration</h1>
          <p>Configure the approved folder used by the chatbot.</p>
        </div>
      </div>
      <SharePointSettingsForm />
    </main>
  );
}
