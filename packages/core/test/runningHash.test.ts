import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fetchTopicMessages, verifyChain, type TopicMessage } from "../src/index.ts";

// Real testnet data (see fixtures/README.md), loaded through the same validating parser.
const raw = readFileSync(new URL("./fixtures/testnet-0.0.5150822-seq1-4.json", import.meta.url), "utf8");
const real = async (): Promise<TopicMessage[]> =>
  (await fetchTopicMessages({ name: "fixture", baseUrl: "https://fixture.test" }, "0.0.5150822", {
    fetchImpl: async () => new Response(raw.replace(/"next":"[^"]*"/, '"next":null')),
  })).messages;

describe("running hash v3", () => {
  it("reproduces the real network running hashes", async () => {
    const msgs = await real();
    expect(msgs).toHaveLength(4);
    const r = verifyChain(msgs);
    expect(r).toEqual({ ok: true, lastSequence: 4, lastRunningHash: msgs[3]!.runningHash });
  });

  it("detects an altered message body", async () => {
    const msgs = await real();
    msgs[1] = { ...msgs[1]!, message: Buffer.from('{"forged":true}').toString("base64") };
    expect(verifyChain(msgs)).toEqual({ ok: false, firstBadSequence: 2, reason: "hash_mismatch" });
  });

  it("detects a dropped message as a gap", async () => {
    const msgs = await real();
    msgs.splice(2, 1);
    expect(verifyChain(msgs)).toEqual({ ok: false, firstBadSequence: 3, reason: "gap" });
  });

  it("detects a dropped message that was renumbered to hide the gap", async () => {
    const msgs = (await real()).filter((m) => m.sequenceNumber !== 2).map((m, i) => ({ ...m, sequenceNumber: i + 1 }));
    expect(verifyChain(msgs)).toMatchObject({ ok: false, firstBadSequence: 2, reason: "hash_mismatch" });
  });

  it("verifies a suffix when given the previous running hash", async () => {
    const msgs = await real();
    const r = verifyChain(msgs.slice(2), Buffer.from(msgs[1]!.runningHash, "base64"));
    expect(r.ok).toBe(true);
  });
});
