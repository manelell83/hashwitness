import { canonicalJson, sha256Hex } from "./canonical.ts";
import type { TopicMessage } from "./types.ts";
import type { Verdict, VerificationResult } from "./verify.ts";

/**
 * The full report of one verification. Its SHA-256 (`reportHash`) is anchored on HCS, so anyone holding
 * the report can prove it was not edited afterwards. `forensic` is the AI analysis (M5); it is part of
 * the hashed report but NEVER influences `verification.verdict`.
 */
export interface Report {
  v: 1;
  verification: VerificationResult;
  forensic: unknown | null;
}

/** Message published on the attestation topic after every verification. */
export interface Attestation {
  v: 1;
  targetCredential: string;
  registryTopic: string;
  verdict: Verdict;
  quorumSize: number; // k: agreeing mirrors required
  mirrorsQueried: number; // n
  mirrorsAgreeing: number;
  anchorSequence: number | null; // registry head from a consensus node, if used
  digest: string | null; // SHA-256 of the agreed registry view
  reportHash: string; // SHA-256 of canonicalJson(report)
  ts: string; // ISO-8601, informational (consensus timestamp is authoritative)
}

export const HCS_MAX_MESSAGE_BYTES = 1024;

export const reportHash = (report: Report): string => sha256Hex(canonicalJson(report));

export function buildAttestation(report: Report, now: Date = new Date()): Attestation {
  const r = report.verification;
  return {
    v: 1,
    targetCredential: r.credentialId,
    registryTopic: r.topicId,
    verdict: r.verdict,
    quorumSize: r.quorum.k,
    mirrorsQueried: r.quorum.n,
    mirrorsAgreeing: r.quorum.agreeing,
    anchorSequence: r.anchor?.sequence ?? null,
    digest: r.digest,
    reportHash: reportHash(report),
    ts: now.toISOString(),
  };
}

/** Serialized attestation; guaranteed to fit in one HCS message (no chunking). */
export function encodeAttestation(a: Attestation): string {
  const s = canonicalJson(a);
  if (Buffer.byteLength(s) > HCS_MAX_MESSAGE_BYTES) throw new Error("attestation exceeds one HCS message");
  return s;
}

const VERDICTS: Verdict[] = ["VALID", "REVOKED", "NOT_FOUND", "INCONSISTENT", "UNREACHABLE"];
const HEX64 = /^[0-9a-f]{64}$/;
const isCount = (x: unknown) => Number.isSafeInteger(x) && (x as number) >= 0 && (x as number) <= 1000;

/** Parses an attestation read from a mirror (untrusted). Returns null if malformed. */
export function parseAttestation(base64Message: string): Attestation | null {
  let v: unknown;
  try {
    v = JSON.parse(Buffer.from(base64Message, "base64").toString("utf8"));
  } catch {
    return null;
  }
  const a = v as Record<string, unknown>;
  if (typeof a !== "object" || a === null || Array.isArray(a) || a.v !== 1) return null;
  if (typeof a.targetCredential !== "string" || !/^[A-Za-z0-9._:-]{1,64}$/.test(a.targetCredential)) return null;
  if (typeof a.registryTopic !== "string" || !/^\d+\.\d+\.\d+$/.test(a.registryTopic)) return null;
  if (!VERDICTS.includes(a.verdict as Verdict)) return null;
  if (!isCount(a.quorumSize) || !isCount(a.mirrorsQueried) || !isCount(a.mirrorsAgreeing)) return null;
  if (a.anchorSequence !== null && !(Number.isSafeInteger(a.anchorSequence) && (a.anchorSequence as number) >= 0)) return null;
  if (a.digest !== null && (typeof a.digest !== "string" || !HEX64.test(a.digest))) return null;
  if (typeof a.reportHash !== "string" || !HEX64.test(a.reportHash)) return null;
  if (typeof a.ts !== "string" || a.ts.length > 40) return null;
  return a as unknown as Attestation;
}

export interface AuditEntry {
  sequence: number;
  consensusTimestamp: string;
  payer: string;
  attestation: Attestation;
}

/** Attestations from the attestation topic, newest first. Only those paid by `attester` count. */
export function auditEntries(messages: TopicMessage[], attester: string): AuditEntry[] {
  const out: AuditEntry[] = [];
  for (const m of messages) {
    if (m.payerAccountId !== attester) continue;
    const a = parseAttestation(m.message);
    if (a) out.push({ sequence: m.sequenceNumber, consensusTimestamp: m.consensusTimestamp, payer: m.payerAccountId, attestation: a });
  }
  return out.sort((x, y) => y.sequence - x.sequence);
}
