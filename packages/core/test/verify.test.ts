import { describe, expect, it } from "vitest";
import { verifyCredential, type Anchor, type VerifyInput } from "../src/index.ts";
import { chainOf, event, ISSUER, memoryFetch, mirror, REGISTRY, TOPIC, type View } from "./chain.ts";

const HOSTS = ["a.test", "b.test", "c.test"];
const anchorOf = (msgs = REGISTRY()): Anchor => ({ sequence: msgs.length, runningHash: msgs.at(-1)!.runningHash });

function run(views: View[], opts: Partial<VerifyInput> = {}) {
  const hosts = HOSTS.slice(0, views.length);
  return verifyCredential({
    topicId: TOPIC, credentialId: "DIP-001", issuer: ISSUER, k: 2, lagRetryMs: 0,
    mirrors: hosts.map(mirror),
    fetch: { fetchImpl: memoryFetch(Object.fromEntries(hosts.map((h, i) => [h, views[i]!]))) },
    ...opts,
  });
}

// A smart liar: hides the revoke and serves an internally valid chain.
const LIE = () => chainOf([event("issue", "DIP-001"), event("issue", "DIP-002"), event("issue", "DIP-003")]);

describe("verifyCredential: honest mirrors", () => {
  it("returns REVOKED / VALID / NOT_FOUND with full agreement", async () => {
    const all = [REGISTRY(), REGISTRY(), REGISTRY()];
    const r = await run(all, { anchor: anchorOf() });
    expect(r).toMatchObject({ verdict: "REVOKED", quorum: { k: 2, n: 3, agreeing: 3 }, disagreeing: [], diff: [] });
    expect(r.mirrors.every((m) => m.state === "agree" && m.latencyMs !== null)).toBe(true);
    expect((await run(all, { credentialId: "DIP-002" })).verdict).toBe("VALID");
    expect((await run(all, { credentialId: "DIP-999" })).verdict).toBe("NOT_FOUND");
  });

  it("is deterministic: same views, same digest and verdict", async () => {
    const [r1, r2] = await Promise.all([run([REGISTRY(), REGISTRY(), REGISTRY()]), run([REGISTRY(), REGISTRY(), REGISTRY()])]);
    expect(r1.digest).toBe(r2.digest);
    expect(r1.verdict).toBe(r2.verdict);
  });

  it("absorbs normal mirror lag with one retry", async () => {
    const lagging: View = (call) => (call === 1 ? REGISTRY().slice(0, 3) : REGISTRY());
    const r = await run([REGISTRY(), REGISTRY(), lagging], { anchor: anchorOf(), lagRetryMs: 1 });
    expect(r.mirrors.map((m) => m.state)).toEqual(["agree", "agree", "agree"]);
  });
});

describe("verifyCredential: failures", () => {
  it("UNREACHABLE when fewer than k mirrors answer", async () => {
    const r = await run([REGISTRY(), "down", "down"]);
    expect(r.verdict).toBe("UNREACHABLE");
    expect(r.mirrors[1]).toMatchObject({ state: "unreachable", error: expect.stringContaining("network error") });
  });

  it("flags a careless tamper (chain not recomputed) as broken_chain", async () => {
    const careless = REGISTRY().filter((m) => m.sequenceNumber !== 3);
    const r = await run([REGISTRY(), REGISTRY(), careless]);
    expect(r.verdict).toBe("REVOKED");
    expect(r.mirrors[2]!.state).toBe("broken_chain");
    expect(r.disagreeing).toEqual(["c"]);
  });

  it("INCONSISTENT on a 1-vs-1 split with no anchor (never picks a side)", async () => {
    const r = await run([REGISTRY(), LIE()], { k: 1 });
    expect(r.verdict).toBe("INCONSISTENT");
  });

  it("anchor outvotes a colluding majority: liars can block a verdict, never fake one", async () => {
    const views = [LIE(), LIE(), REGISTRY()];
    const r = await run(views, { anchor: anchorOf() });
    expect(r.mirrors.map((m) => m.state)).toEqual(["forged", "forged", "agree"]);
    expect(r.verdict).toBe("INCONSISTENT"); // only 1 < k=2 trustworthy mirrors
    expect((await run(views, { anchor: anchorOf(), k: 1 })).verdict).toBe("REVOKED");
  });

  it("without an anchor a colluding majority can win: documented limitation", async () => {
    const r = await run([LIE(), LIE(), REGISTRY()]);
    expect(r.verdict).toBe("VALID");
  });
});

describe("verifyCredential: the three attacks", () => {
  it("tamper: forged chain is outvoted and the diff shows the altered sequence numbers", async () => {
    const r = await run([REGISTRY(), REGISTRY(), LIE()], { anchor: anchorOf() });
    expect(r.verdict).toBe("REVOKED");
    expect(r.mirrors[2]).toMatchObject({ state: "forged", credentialStatus: "ISSUED" });
    expect(r.diff.map((d) => [d.sequence, d.kind])).toEqual([[3, "altered"], [4, "missing"]]);
    expect(r.diff[0]!.byMirror.a).toBe(r.diff[0]!.expected);
  });

  it("replay: stale view hiding the revoke is flagged stale, not trusted", async () => {
    const stale = REGISTRY().slice(0, 2);
    const r = await run([REGISTRY(), REGISTRY(), stale], { anchor: anchorOf(), lagRetryMs: 1 });
    expect(r.verdict).toBe("REVOKED");
    expect(r.mirrors[2]).toMatchObject({ state: "stale", lastSequence: 2, credentialStatus: "ISSUED" });
    expect(r.diff.map((d) => [d.sequence, d.kind])).toEqual([[3, "missing"], [4, "missing"]]);
  });

  it("equivocation: caught by the split-view probe even though it tells the verifier the truth", async () => {
    const twoFaced: View = (_n, client) => (client === "hashwitness" ? REGISTRY() : LIE());
    const r = await run([REGISTRY(), REGISTRY(), twoFaced], { anchor: anchorOf(), probeSplitView: true });
    expect(r.verdict).toBe("REVOKED");
    expect(r.mirrors[2]).toMatchObject({ state: "split_view", credentialStatus: "REVOKED", splitViewStatus: "ISSUED" });
    expect(r.disagreeing).toEqual(["c"]);
    expect(r.diff.map((d) => [d.sequence, d.kind, d.byMirror["c (to other clients)"] === d.expected])).toEqual([
      [3, "altered", false], [4, "missing", false],
    ]);
    // without the probe, the verifier alone cannot see it
    expect((await run([REGISTRY(), REGISTRY(), twoFaced], { anchor: anchorOf() })).mirrors[2]!.state).toBe("agree");
  });
});
