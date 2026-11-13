import { createHash } from "node:crypto";
import { AccountId, Client, PrivateKey, TopicInfoQuery } from "@hiero-ledger/sdk";
import type { Anchor, MirrorConfig } from "@hashwitness/core";

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

export const PUBLIC_MIRROR: MirrorConfig = { name: "hedera-public", baseUrl: "https://testnet.mirrornode.hedera.com" };

/** Real mirrors: the public one, plus each keyed provider whose key is in .env. */
export function realMirrors(): MirrorConfig[] {
  const out = [PUBLIC_MIRROR];
  const k = process.env;
  // [DOCS] https://docs.hgraph.com/overview/endpoints
  if (k.HGRAPH_API_KEY) out.push({ name: "hgraph", baseUrl: "https://hedera-testnet.hgraph.com", headers: { "x-api-key": k.HGRAPH_API_KEY } });
  // UNVERIFIED: key as path segment after /v1/; confirm against the Validation Cloud dashboard.
  if (k.VALIDATIONCLOUD_API_KEY) out.push({ name: "validationcloud", baseUrl: `https://testnet.hedera.validationcloud.io/v1/${k.VALIDATIONCLOUD_API_KEY}` });
  // UNVERIFIED: header name; confirm against the Arkhia dashboard.
  if (k.ARKHIA_API_KEY) out.push({ name: "arkhia", baseUrl: "https://pool.arkhia.io/hedera/testnet", headers: { "x-api-key": k.ARKHIA_API_KEY } });
  return out;
}

export const FAKE_MIRROR: MirrorConfig = {
  name: "fake-mirror (attacker)",
  baseUrl: process.env.FAKE_MIRROR_URL ?? "http://127.0.0.1:5551",
};

/** Topic head straight from a consensus node: the anchor no mirror can fake. */
export async function readAnchor(topicId: string): Promise<Anchor> {
  const client = testnetClient();
  try {
    const info = await new TopicInfoQuery().setTopicId(topicId).execute(client);
    return { sequence: info.sequenceNumber.toNumber(), runningHash: Buffer.from(info.runningHash).toString("base64") };
  } finally {
    client.close();
  }
}

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
