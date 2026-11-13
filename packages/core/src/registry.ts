import type { TopicMessage } from "./types.ts";

/** Registry topic message: `{type, credentialId, credentialHash, issuer, ts}`. */
export interface RegistryEvent {
  type: "issue" | "revoke";
  credentialId: string;
  credentialHash: string; // hex SHA-256 of the canonical credential document
  issuer: string; // Hedera account id of the issuing school
  ts: string; // ISO-8601, issuer-supplied (informational; ordering uses consensus)
}

const CREDENTIAL_ID = /^[A-Za-z0-9._:-]{1,64}$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;
const ENTITY_ID = /^\d+\.\d+\.\d+$/;

/** Parses one registry message. Returns null for anything malformed (mirror data is untrusted). */
export function parseRegistryEvent(base64Message: string): RegistryEvent | null {
  let v: unknown;
  try {
    v = JSON.parse(Buffer.from(base64Message, "base64").toString("utf8"));
  } catch {
    return null;
  }
  const r = v as Record<string, unknown>;
  if (typeof r !== "object" || r === null || Array.isArray(r)) return null;
  if (r.type !== "issue" && r.type !== "revoke") return null;
  if (typeof r.credentialId !== "string" || !CREDENTIAL_ID.test(r.credentialId)) return null;
  if (typeof r.credentialHash !== "string" || !SHA256_HEX.test(r.credentialHash)) return null;
  if (typeof r.issuer !== "string" || !ENTITY_ID.test(r.issuer)) return null;
  if (typeof r.ts !== "string" || r.ts.length > 40) return null;
  return { type: r.type, credentialId: r.credentialId, credentialHash: r.credentialHash, issuer: r.issuer, ts: r.ts };
}

export type CredentialStatus = "ISSUED" | "REVOKED" | "UNKNOWN";

export interface StatusResult {
  status: CredentialStatus;
  credentialHash: string | null;
  issuedAtSequence: number | null;
  revokedAtSequence: number | null;
}

/**
 * Deterministic credential status from registry messages.
 * Only events paid for by `issuerAccount` AND naming it as issuer count (the topic also has a submit key).
 * Revocation is final: any valid revoke of a credential that was issued wins, whatever comes after.
 */
export function credentialStatus(messages: TopicMessage[], credentialId: string, issuerAccount: string): StatusResult {
  const result: StatusResult = { status: "UNKNOWN", credentialHash: null, issuedAtSequence: null, revokedAtSequence: null };
  const ordered = [...messages].sort((a, b) => a.sequenceNumber - b.sequenceNumber);
  for (const m of ordered) {
    if (m.payerAccountId !== issuerAccount) continue;
    const ev = parseRegistryEvent(m.message);
    if (!ev || ev.credentialId !== credentialId || ev.issuer !== issuerAccount) continue;
    if (ev.type === "issue" && result.issuedAtSequence === null) {
      result.issuedAtSequence = m.sequenceNumber;
      result.credentialHash = ev.credentialHash;
      result.status = "ISSUED";
    } else if (ev.type === "revoke" && result.issuedAtSequence !== null && result.revokedAtSequence === null) {
      result.revokedAtSequence = m.sequenceNumber;
      result.status = "REVOKED";
    }
  }
  return result;
}
