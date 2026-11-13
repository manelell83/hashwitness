// What the agent is allowed to see: structured, enumerated facts computed by core.
// No mirror-supplied text (messages, hashes, timestamps) is ever included, so there is nothing to inject.
import { canonicalJson, sha256Hex, type MirrorState, type Verdict, type VerificationResult } from "@hashwitness/core";

export interface Evidence {
  verdict: Verdict; // decided by core; the agent explains it, never changes it
  quorum: { k: number; n: number; agreeing: number };
  anchorSequence: number | null;
  mirrors: {
    id: string; // M1, M2…: aliases, so no operator-chosen name reaches the model either
    state: MirrorState;
    lastSequence: number | null;
    statusSeenByVerifier: string | null;
    statusSeenByOtherClients: string | null; // only set on a split view
  }[];
  differences: { sequence: number; kind: "missing" | "altered" | "extra"; mirrors: string[] }[];
}

export function buildEvidence(r: VerificationResult): { evidence: Evidence; aliases: Record<string, string> } {
  const aliases: Record<string, string> = {};
  r.mirrors.forEach((m, i) => (aliases[m.mirror] = `M${i + 1}`));
  const alias = (name: string) => {
    const base = name.replace(/ \(to other clients\)$/, "");
    return aliases[base] ? `${aliases[base]}${base === name ? "" : " (to other clients)"}` : "unknown";
  };
  return {
    aliases,
    evidence: {
      verdict: r.verdict,
      quorum: r.quorum,
      anchorSequence: r.anchor?.sequence ?? null,
      mirrors: r.mirrors.map((m) => ({
        id: aliases[m.mirror]!,
        state: m.state,
        lastSequence: m.lastSequence,
        statusSeenByVerifier: m.credentialStatus,
        statusSeenByOtherClients: m.splitViewStatus,
      })),
      differences: r.diff.map((d) => ({
        sequence: d.sequence,
        kind: d.kind,
        mirrors: Object.entries(d.byMirror).filter(([, h]) => h !== d.expected).map(([n]) => alias(n)),
      })),
    },
  };
}

/** Cache / recording key. Latencies and hashes are excluded, so the same scenario gives the same key. */
export const evidenceHash = (e: Evidence): string => sha256Hex(canonicalJson(e));

/** The agent only runs when something is wrong. */
export const needsAnalysis = (e: Evidence): boolean => e.mirrors.some((m) => m.state !== "agree");
