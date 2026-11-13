import { createHash } from "node:crypto";
import { AccountId, Client, PrivateKey } from "@hiero-ledger/sdk";
import type { MirrorConfig } from "@hashwitness/core";

export function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name} in .env (see .env.example)`);
  return v;
}

/** Portal keys: DER (starts with 30...) or raw hex ECDSA. Never print the key. */
export function operatorKey(): PrivateKey {
  const k = env("OPERATOR_KEY").replace(/^0x/, "");
  return k.startsWith("30") ? PrivateKey.fromStringDer(k) : PrivateKey.fromStringECDSA(k);
}

export function testnetClient(): Client {
  return Client.forTestnet().setOperator(AccountId.fromString(env("OPERATOR_ID")), operatorKey());
}

/** M1 reads through the keyless public mirror only. Quorum over several mirrors arrives in M2. */
export const PUBLIC_MIRROR: MirrorConfig = { name: "hedera-public", baseUrl: "https://testnet.mirrornode.hedera.com" };

/** Deterministic JSON: keys sorted recursively, no whitespace. */
export function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson((v as Record<string, unknown>)[k])}`).join(",")}}`;
  }
  return JSON.stringify(v);
}

export const sha256Hex = (s: string) => createHash("sha256").update(s).digest("hex");

export const hashscanTopic = (topicId: string) => `https://hashscan.io/testnet/topic/${topicId}`;
