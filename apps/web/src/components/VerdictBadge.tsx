import type { CredentialStatus, Verdict } from "../api.ts";

// Verdicts always show icon + word + color, never color alone.
const VIEW: Record<Verdict, { icon: string; word: string; cls: string }> = {
  VALID: { icon: "✓", word: "Valid", cls: "verdict-valid" },
  REVOKED: { icon: "✕", word: "Revoked", cls: "verdict-revoked" },
  INCONSISTENT: { icon: "⚠", word: "Inconsistent", cls: "verdict-inconsistent" },
  // DESIGN: the brief defines three verdict styles; these two reuse a neutral style.
  NOT_FOUND: { icon: "?", word: "Not found", cls: "verdict-neutral" },
  UNREACHABLE: { icon: "–", word: "Unreachable", cls: "verdict-neutral" },
};

/** A naive app only knows the registry status; map it to what it would display. */
export const statusAsVerdict = (s: CredentialStatus): Verdict =>
  s === "ISSUED" ? "VALID" : s === "REVOKED" ? "REVOKED" : "NOT_FOUND";

export function VerdictBadge({ verdict, revealed = false, size = "large" }: { verdict: Verdict; revealed?: boolean; size?: "large" | "small" }) {
  const v = VIEW[verdict];
  return (
    <div className={`verdict ${v.cls}${revealed ? " is-revealed" : ""}${size === "small" ? " verdict-small" : ""}`}
      role={size === "large" ? "status" : undefined} aria-live={size === "large" ? "polite" : undefined}>
      <span aria-hidden="true">{v.icon}</span>
      <span>{v.word}</span>
    </div>
  );
}
