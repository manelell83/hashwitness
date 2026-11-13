import { describe, expect, it } from "vitest";
import { fetchTopicMessages, MirrorError } from "../src/index.ts";

const good = (seq: number) => ({
  topic_id: "0.0.5000", sequence_number: seq, consensus_timestamp: "1700000000.000000001",
  payer_account_id: "0.0.1001", running_hash: Buffer.alloc(48).toString("base64"),
  running_hash_version: 3, message: Buffer.from("hi").toString("base64"),
});
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const M = { name: "m1", baseUrl: "https://mirror.test" };

describe("fetchTopicMessages", () => {
  it("follows links.next and keeps the provider path prefix", async () => {
    const seen: string[] = [];
    const fetchImpl = (async (url: URL) => {
      seen.push(url.toString());
      return seen.length === 1
        ? json({ messages: [good(1)], links: { next: "/api/v1/topics/0.0.5000/messages?limit=100&order=asc&sequencenumber=gt:1" } })
        : json({ messages: [good(2)], links: { next: null } });
    }) as typeof fetch;
    const r = await fetchTopicMessages({ ...M, baseUrl: "https://mirror.test/v1/KEY" }, "0.0.5000", { fetchImpl });
    expect(r.messages.map((m) => m.sequenceNumber)).toEqual([1, 2]);
    expect(seen[1]).toBe("https://mirror.test/v1/KEY/api/v1/topics/0.0.5000/messages?limit=100&order=asc&sequencenumber=gt:1");
  });

  it.each([
    ["short running hash", { running_hash: "AAAA" }],
    ["non-integer sequence", { sequence_number: "1" }],
    ["bad timestamp", { consensus_timestamp: "yesterday" }],
    ["oversized message", { message: "A".repeat(5000) }],
    ["foreign topic", { topic_id: "0.0.9" }],
  ])("rejects %s", async (_n, patch) => {
    const fetchImpl = (async () => json({ messages: [{ ...good(1), ...patch }], links: { next: null } })) as typeof fetch;
    await expect(fetchTopicMessages(M, "0.0.5000", { fetchImpl })).rejects.toBeInstanceOf(MirrorError);
  });

  it("reports HTTP errors and timeouts as MirrorError", async () => {
    await expect(fetchTopicMessages(M, "0.0.5000", { fetchImpl: (async () => json({}, 503)) as typeof fetch }))
      .rejects.toThrow("HTTP 503");
    const hang = ((_u: URL, init: RequestInit) => new Promise((_r, rej) =>
      init.signal!.addEventListener("abort", () => rej(init.signal!.reason)))) as typeof fetch;
    await expect(fetchTopicMessages(M, "0.0.5000", { fetchImpl: hang, timeoutMs: 20 })).rejects.toThrow("timeout");
  });

  it("rejects an invalid topic id before any request", async () => {
    await expect(fetchTopicMessages(M, "0.0.5000/../../admin")).rejects.toThrow("invalid topic id");
  });
});
