import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { credentialStatus, fetchTopicMessages, verifyChain, verifyCredential, type Anchor } from "@hashwitness/core";
import { applyAttack, createApp, DEFAULT_CONFIG } from "../src/app.ts";
import { ISSUER, memoryFetch, mirror, REGISTRY, TOPIC } from "../../core/test/chain.ts";

const status = (msgs = REGISTRY(), id = "DIP-001") => credentialStatus(msgs, id, ISSUER).status;

describe("attack transforms (pure, deterministic)", () => {
  it("honest passes through", () => {
    expect(applyAttack(REGISTRY(), DEFAULT_CONFIG, undefined).messages).toEqual(REGISTRY());
  });

  it.each(["drop-revoke", "alter-body"] as const)("tamper %s hides the revoke behind a VALID chain", (tamperStyle) => {
    const out = applyAttack(REGISTRY(), { ...DEFAULT_CONFIG, mode: "tamper", tamperStyle }, undefined);
    expect(verifyChain(out.messages).ok).toBe(true);
    expect(status(out.messages)).toBe("ISSUED");
    expect(applyAttack(REGISTRY(), { ...DEFAULT_CONFIG, mode: "tamper", tamperStyle }, undefined)).toEqual(out);
  });

  it("replay hides the latest N", () => {
    const out = applyAttack(REGISTRY(), { ...DEFAULT_CONFIG, mode: "replay", replayHide: 2 }, undefined);
    expect(out.messages.map((m) => m.sequenceNumber)).toEqual([1, 2]);
    expect(status(out.messages)).toBe("ISSUED");
  });

  it("equivocate tells the truth to the verifier only", () => {
    const cfg = { ...DEFAULT_CONFIG, mode: "equivocate" as const };
    expect(status(applyAttack(REGISTRY(), cfg, "hashwitness").messages)).toBe("REVOKED");
    expect(status(applyAttack(REGISTRY(), cfg, "naive-app").messages)).toBe("ISSUED");
  });
});

describe("fake mirror over HTTP vs the quorum verifier", () => {
  let server: Server;
  let base: string;
  const logs: Record<string, unknown>[] = [];
  const upstream = memoryFetch({ "upstream.test": REGISTRY() });
  const honest = memoryFetch({ "a.test": REGISTRY(), "b.test": REGISTRY() }, fetch);
  const anchor: Anchor = { sequence: 4, runningHash: REGISTRY()[3]!.runningHash };

  beforeAll(async () => {
    server = createApp({ upstream: "https://upstream.test", fetchImpl: upstream, log: (l) => logs.push(l) }).listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => server.close());

  const setMode = (body: object) =>
    fetch(`${base}/admin/mode`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const verify = () =>
    verifyCredential({
      topicId: TOPIC, credentialId: "DIP-001", issuer: ISSUER, k: 2, anchor, probeSplitView: true, lagRetryMs: 1,
      mirrors: [mirror("a.test"), mirror("b.test"), { name: "fake", baseUrl: base }],
      fetch: { fetchImpl: honest },
    });

  it.each([
    [{ mode: "tamper", tamperStyle: "drop-revoke" }, "forged"],
    [{ mode: "tamper", tamperStyle: "alter-body" }, "forged"],
    [{ mode: "replay", replayHide: 2 }, "stale"],
    [{ mode: "equivocate" }, "split_view"],
  ])("%j: naive single-mirror app is fooled, HashWitness is not", async (mode, expectedState) => {
    expect((await setMode(mode)).status).toBe(200);
    const fake = await verify();
    expect(fake.verdict).toBe("REVOKED");
    expect(fake.mirrors[2]).toMatchObject({ mirror: "fake", state: expectedState, credentialStatus: expect.any(String) });
    // what a naive app reading only the fake mirror (as itself) concludes:
    const naiveView = await fetchTopicMessages({ name: "fake", baseUrl: base, headers: { "x-hw-client": "naive-app" } }, TOPIC);
    expect(credentialStatus(naiveView.messages, "DIP-001", ISSUER).status).toBe("ISSUED");
  });

  it("honest mode agrees, and every request is logged", async () => {
    await setMode({ mode: "honest" });
    const r = await verify();
    expect(r.mirrors.map((m) => m.state)).toEqual(["agree", "agree", "agree"]);
    expect(logs.some((l) => l.event === "served" && l.mode === "equivocate" && String(l.action).startsWith("equivocate: lie"))).toBe(true);
  });

  it("rejects invalid admin input", async () => {
    expect((await setMode({ mode: "explode" })).status).toBe(400);
    expect((await setMode({ replayHide: -1 })).status).toBe(400);
  });
});
