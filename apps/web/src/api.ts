// Typed calls to apps/api. Types come from core (type-only imports: no core code runs in the browser).
import type { CredentialStatus, VerificationResult } from "@hashwitness/core";
import type { Forensic } from "@hashwitness/agent";

export type { Forensic } from "@hashwitness/agent";

export type { CredentialStatus, MirrorReport, MirrorState, Verdict, VerificationResult, DiffEntry } from "@hashwitness/core";

export interface Config {
  mirrors: string[];
  attackerMirror: string;
  k: number;
  registryTopic: string;
  attestationTopic: string;
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
  attackMode: () => call<{ mode: AttackMode }>("/api/attack-mode"),
  setAttackMode: (mode: AttackMode) => call<{ mode: AttackMode }>("/api/attack-mode", { mode }),
};
