import { useState } from "react";

/** Truncates a long hash/ID in the middle, with a copy button. Short values are shown whole. */
export function middle(value: string, keep = 8): string {
  return value.length <= keep * 2 + 1 ? value : `${value.slice(0, keep)}…${value.slice(-keep)}`;
}

export function HashText({ value, keep = 8, label = "value" }: { value: string; keep?: number; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard unavailable: the full value is still in the title tooltip */
    }
  };
  return (
    <span className="hash">
      <span className="mono" title={value}>{middle(value, keep)}</span>
      <button type="button" className="copy-btn" onClick={copy} aria-label={`Copy ${label}`}>
        {copied ? "Copied" : "Copy"}
      </button>
    </span>
  );
}
