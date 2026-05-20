"use client";

import { PlugZap, Save } from "lucide-react";

interface ButtonProps {
  disabled?: boolean;
  loading?: boolean;
}

export function TestConnectionButton({ disabled, loading }: ButtonProps) {
  return (
    <button className="button secondary" disabled={disabled} type="submit" value="test">
      <PlugZap aria-hidden="true" size={16} />
      {loading ? "Testing" : "Test Connection"}
    </button>
  );
}

export function SaveSettingsButton({ disabled, loading }: ButtonProps) {
  return (
    <button className="button" disabled={disabled} type="submit" value="save">
      <Save aria-hidden="true" size={16} />
      {loading ? "Saving" : "Save Configuration"}
    </button>
  );
}
