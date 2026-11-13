// Typed calls to apps/api. Types come from core (type-only imports: no core code runs in the browser).
import type { Attestation, CredentialStatus, VerificationResult } from "@hashwitness/core";
import type { MetricsReport } from "@hashwitness/sim";
import type { Forensic } from "@hashwitness/agent";

export type { Forensic } from "@hashwitness/agent";

export type { CredentialStatus, MirrorReport, MirrorState, Verdict, VerificationResult, DiffEntry } from "@hashwitness/core";

export interface Config {
  mirrors: string[];
  attackerMirror: string;
  k: number;
  registryTopic: string;
  attestationTopic: string;
  /** Set when the demo runs offline from cached mirror responses (pnpm demo:offline). */
  offline: { savedAt: string | null } | null;
}
export interface VerifyOutcome {
  result: VerificationResult;
  forensic: Forensic | null;
  attestation: { sequence: number; reportHash: string; transactionUrl: string } | null;
}
export interface NaiveOutcome {
  mirror: string;
  status: CredentialStatus;
  lastSequence: number;
  latencyMs: number;
}
export type AttackMode = "honest" | "tamper" | "replay" | "equivocate";

export interface AuditRow {
  sequence: number;
  consensusTimestamp: string;
  explorerUrl: string;
  attestation: Attestation;
  reportCheck: "match" | "edited" | "not_stored";
}
export interface AuditOutcome {
  topicId: string;
  chainValid: boolean;
  entries: AuditRow[];
}
export type { MetricsReport } from "@hashwitness/sim";

async function call<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, body === undefined ? undefined : {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error ?? `HTTP ${res.status}`);
  return json as T;
}

export const api = {
  config: () => call<Config>("/api/config"),
  verify: (credentialId: string, includeAttacker: boolean) => call<VerifyOutcome>("/api/verify", { credentialId, includeAttacker }),
  naive: (credentialId: string) => call<NaiveOutcome>("/api/naive", { credentialId, mirror: "attacker" }),
  audit: () => call<AuditOutcome>("/api/audit"),
  /** null when no simulation has been run yet (404). */
  metrics: async (): Promise<MetricsReport | null> => {
    const res = await fetch("/api/metrics");
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as MetricsReport;
  },
  attackMode: () => call<{ mode: AttackMode }>("/api/attack-mode"),
  setAttackMode: (mode: AttackMode) => call<{ mode: AttackMode }>("/api/attack-mode", { mode }),
};
