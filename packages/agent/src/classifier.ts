// Deterministic fallback: same evidence in, same analysis out. Used when the LLM is off, slow or wrong-shaped,
// and as the reference the LLM's attackType is compared against.
import type { Evidence } from "./evidence.ts";
import type { Analysis, AttackType } from "./schema.ts";

export function ruleAttackType(e: Evidence): AttackType {
  const states = new Set(e.mirrors.map((m) => m.state));
  if (states.has("split_view")) return "equivocation";
  if (states.has("forged") || states.has("broken_chain")) return "tamper";
  if (states.has("stale")) return "replay";
  return "benign_fault";
}

const seqs = (e: Evidence) => [...new Set(e.differences.map((d) => d.sequence))].join(", ") || "none";
const liars = (e: Evidence) => e.mirrors.filter((m) => m.state !== "agree" && m.state !== "unreachable").map((m) => m.id).join(", ");

export function classify(e: Evidence): Analysis {
  const type = ruleAttackType(e);
  const who = liars(e);
  switch (type) {
    case "equivocation":
      return {
        attackType: type, confidence: 0.95,
        explanation: `${who} returned a different history to an anonymous client than to the verifier (sequence numbers ${seqs(e)}). A mirror that shows different clients different data is equivocating.`,
        recommendedAction: `Stop using ${who}; alert relying parties that may have read from it; keep the anonymous probe enabled.`,
      };
    case "tamper":
      return {
        attackType: type, confidence: 0.95,
        explanation: `${who} served a history that conflicts with the consensus anchor and the honest quorum at sequence numbers ${seqs(e)}. Its running-hash chain was ${e.mirrors.some((m) => m.state === "broken_chain") ? "broken" : "rebuilt to look valid"}, so the content was altered or removed.`,
        recommendedAction: `Exclude ${who} from the mirror pool and report it to its operator; re-verify recent credentials read through it.`,
      };
    case "replay":
      return {
        attackType: type, confidence: 0.85,
        explanation: `${who} returned a valid but older view that stops before sequence numbers ${seqs(e)}, which other mirrors and the consensus anchor include. Hiding the latest messages can conceal a revocation.`,
        recommendedAction: `Treat ${who} as stale; if it stays behind after a retry, remove it from the pool and alert its operator.`,
      };
    case "benign_fault":
      return {
        attackType: type, confidence: 0.7,
        explanation: `No mirror served conflicting data; ${e.mirrors.filter((m) => m.state === "unreachable").map((m) => m.id).join(", ") || "some mirrors"} could not be reached. This looks like an availability fault, not an attack.`,
        recommendedAction: "Retry later or add mirrors to restore the quorum.",
      };
  }
}
