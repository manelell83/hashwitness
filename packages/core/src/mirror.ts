import type { MirrorConfig, TopicMessage } from "./types.ts";

// Everything a mirror returns is untrusted input: validate shape, types and sizes first.
const ENTITY_ID = /^\d+\.\d+\.\d+$/;
const TIMESTAMP = /^\d{1,12}\.\d{9}$/;
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;
const MAX_MESSAGE_BASE64 = 1400; // HCS max chunk is 1024 bytes -> 1368 base64 chars
const MAX_PAGES = 50; // 50 x 100 messages: plenty for a demo registry, bounds a malicious "next" loop

export class MirrorError extends Error {
  constructor(public readonly mirror: string, message: string) {
    super(`[${mirror}] ${message}`);
  }
}

function parseMessage(raw: unknown, mirror: string): TopicMessage {
  const r = raw as Record<string, unknown>;
  const bad = (field: string) => new MirrorError(mirror, `invalid field ${field}`);
  if (typeof r !== "object" || r === null) throw bad("message object");
  if (typeof r.topic_id !== "string" || !ENTITY_ID.test(r.topic_id)) throw bad("topic_id");
  if (typeof r.payer_account_id !== "string" || !ENTITY_ID.test(r.payer_account_id)) throw bad("payer_account_id");
  if (!Number.isSafeInteger(r.sequence_number) || (r.sequence_number as number) < 1) throw bad("sequence_number");
  if (typeof r.consensus_timestamp !== "string" || !TIMESTAMP.test(r.consensus_timestamp)) throw bad("consensus_timestamp");
  if (!Number.isSafeInteger(r.running_hash_version)) throw bad("running_hash_version");
  if (typeof r.running_hash !== "string" || !BASE64.test(r.running_hash) || Buffer.from(r.running_hash, "base64").length !== 48) {
    throw bad("running_hash");
  }
  if (typeof r.message !== "string" || r.message.length > MAX_MESSAGE_BASE64 || !BASE64.test(r.message)) throw bad("message");
  return {
    topicId: r.topic_id,
    sequenceNumber: r.sequence_number as number,
    consensusTimestamp: r.consensus_timestamp,
    payerAccountId: r.payer_account_id,
    runningHash: r.running_hash,
    runningHashVersion: r.running_hash_version as number,
    message: r.message,
  };
}

export interface FetchOptions {
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export interface FetchResult {
  mirror: string;
  messages: TopicMessage[];
  latencyMs: number;
}

/** Fetches all messages of a topic (ascending), following `links.next` within the same mirror. */
export async function fetchTopicMessages(
  mirror: MirrorConfig,
  topicId: string,
  { timeoutMs = 8000, fetchImpl = fetch }: FetchOptions = {},
): Promise<FetchResult> {
  if (!ENTITY_ID.test(topicId)) throw new MirrorError(mirror.name, "invalid topic id");
  const base = new URL(mirror.baseUrl);
  let next: string | null = `/api/v1/topics/${topicId}/messages?limit=100&order=asc`;
  const messages: TopicMessage[] = [];
  const started = performance.now();
  const signal = AbortSignal.timeout(timeoutMs);

  for (let page = 0; next !== null; page++) {
    if (page >= MAX_PAGES) throw new MirrorError(mirror.name, "too many pages");
    // A provider may mount the API under a path prefix (e.g. a key in the path); keep it.
    const url = new URL(base.pathname.replace(/\/$/, "") + next, base.origin);
    if (url.origin !== base.origin) throw new MirrorError(mirror.name, "next link leaves mirror origin");
    let res: Response;
    try {
      res = await fetchImpl(url, { headers: { accept: "application/json", ...mirror.headers }, signal });
    } catch (e) {
      throw new MirrorError(mirror.name, (e as Error).name === "TimeoutError" ? "timeout" : "network error");
    }
    if (!res.ok) throw new MirrorError(mirror.name, `HTTP ${res.status}`);
    const body = (await res.json().catch(() => null)) as { messages?: unknown; links?: { next?: unknown } } | null;
    if (!body || !Array.isArray(body.messages)) throw new MirrorError(mirror.name, "invalid response body");
    for (const m of body.messages) {
      const parsed = parseMessage(m, mirror.name);
      if (parsed.topicId !== topicId) throw new MirrorError(mirror.name, "message from another topic");
      messages.push(parsed);
    }
    const n = body.links?.next;
    if (n !== null && n !== undefined && typeof n !== "string") throw new MirrorError(mirror.name, "invalid next link");
    // links.next is relative to the API root and starts with /api/v1
    next = typeof n === "string" ? n.replace(/^.*?(\/api\/v1\/)/, "$1") : null;
  }
  return { mirror: mirror.name, messages, latencyMs: Math.round(performance.now() - started) };
}
