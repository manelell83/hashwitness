// Test helpers: build valid HCS chains from registry events and serve them as fake mirrors.
import { runningHashV3, ZERO_RUNNING_HASH, type TopicMessage } from "../src/index.ts";

export const ISSUER = "0.0.1001";
export const TOPIC = "0.0.5000";

export const event = (type: "issue" | "revoke", credentialId: string) => ({
  type, credentialId, credentialHash: credentialId.toLowerCase().padEnd(64, "0").replace(/[^0-9a-f]/g, "0"),
  issuer: ISSUER, ts: "2026-11-13T10:00:00Z",
});

export function chainOf(bodies: unknown[], payer = ISSUER): TopicMessage[] {
  let prev: Uint8Array = ZERO_RUNNING_HASH;
  return bodies.map((b, i) => {
    const m: TopicMessage = {
      topicId: TOPIC, sequenceNumber: i + 1, consensusTimestamp: `17000000${String(i).padStart(2, "0")}.000000000`,
      payerAccountId: payer, runningHash: "", runningHashVersion: 3, message: Buffer.from(JSON.stringify(b)).toString("base64"),
    };
    const h = runningHashV3(prev, m);
    prev = h;
    return { ...m, runningHash: h.toString("base64") };
  });
}

/** issue DIP-001, issue DIP-002, revoke DIP-001, issue DIP-003 */
export const REGISTRY = () =>
  chainOf([event("issue", "DIP-001"), event("issue", "DIP-002"), event("revoke", "DIP-001"), event("issue", "DIP-003")]);

export const toWire = (m: TopicMessage) => ({
  consensus_timestamp: m.consensusTimestamp, message: m.message, payer_account_id: m.payerAccountId,
  running_hash: m.runningHash, running_hash_version: m.runningHashVersion, sequence_number: m.sequenceNumber, topic_id: m.topicId,
});

/** A fetch that serves in-memory views per host. A view may be a function of the call count or the client header. */
export type View = TopicMessage[] | "down" | ((call: number, client: string | null) => TopicMessage[] | "down");

export function memoryFetch(views: Record<string, View>, passthrough?: typeof fetch): typeof fetch {
  const calls = new Map<string, number>();
  return (async (input: URL | string, init?: RequestInit) => {
    const url = new URL(input.toString());
    const v = views[url.host];
    if (v === undefined) {
      if (passthrough) return passthrough(input, init);
      throw new Error(`no view for ${url.host}`);
    }
    const n = (calls.get(url.host) ?? 0) + 1;
    calls.set(url.host, n);
    const client = new Headers(init?.headers).get("x-hw-client");
    const view = typeof v === "function" ? v(n, client) : v;
    if (view === "down") throw new TypeError("fetch failed");
    return new Response(JSON.stringify({ messages: view.map(toWire), links: { next: null } }));
  }) as typeof fetch;
}

export const mirror = (host: string) => ({ name: host.split(".")[0]!, baseUrl: `https://${host}` });
