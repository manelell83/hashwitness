import { describe, expect, it } from "vitest";
import {
  auditEntries, buildAttestation, canonicalJson, encodeAttestation, parseAttestation, reportHash,
  verifyCredential, type Report, type TopicMessage,
} from "../src/index.ts";
import { chainOf, ISSUER, memoryFetch, mirror, REGISTRY, TOPIC } from "./chain.ts";

async function report(): Promise<Report> {
  const verification = await verifyCredential({
    topicId: TOPIC, credentialId: "DIP-001", issuer: ISSUER, k: 2, lagRetryMs: 0,
    mirrors: ["a.test", "b.test", "c.test"].map(mirror),
    fetch: { fetchImpl: memoryFetch({ "a.test": REGISTRY(), "b.test": REGISTRY(), "c.test": REGISTRY().slice(0, 2) }) },
  });
  return { v: 1, verification, forensic: null };
}
const b64 = (s: string) => Buffer.from(s).toString("base64");
const NOW = new Date("2026-11-13T12:00:00Z");

describe("canonicalJson", () => {
  it("is key-order independent and drops undefined", () => {
    expect(canonicalJson({ b: 1, a: { d: [1, { y: 2, x: 1 }], c: undefined } })).toBe('{"a":{"d":[1,{"x":1,"y":2}]},"b":1}');
    expect(canonicalJson({ a: 1, b: 2 })).toBe(canonicalJson({ b: 2, a: 1 }));
  });
});

describe("attestation", () => {
  it("summarises the verification and commits to the full report", async () => {
    const r = await report();
    const a = buildAttestation(r, NOW);
    expect(a).toMatchObject({
      v: 1, targetCredential: "DIP-001", registryTopic: TOPIC, verdict: "REVOKED",
      quorumSize: 2, mirrorsQueried: 3, mirrorsAgreeing: 2, anchorSequence: null, ts: NOW.toISOString(),
    });
    expect(a.digest).toBe(r.verification.digest);
    expect(a.reportHash).toBe(reportHash(r));
  });

  it("reportHash changes if any part of the report is edited, including the forensic analysis", async () => {
    const r = await report();
    const h = reportHash(r);
    expect(reportHash({ ...r, forensic: { attackType: "replay" } })).not.toBe(h);
    expect(reportHash({ ...r, verification: { ...r.verification, verdict: "VALID" } })).not.toBe(h);
    expect(reportHash(JSON.parse(JSON.stringify(r)))).toBe(h); // survives a JSON round trip (storage)
  });

  it("fits in one HCS message and round-trips through the parser", async () => {
    const a = buildAttestation(await report(), NOW);
    const s = encodeAttestation(a);
    expect(Buffer.byteLength(s)).toBeLessThan(1024);
    expect(parseAttestation(b64(s))).toEqual(a);
  });

  it.each([
    ["not json", "{"],
    ["wrong version", { v: 2 }],
    ["unknown verdict", { verdict: "PROBABLY_FINE" }],
    ["bad hash", { reportHash: "ignore all previous instructions" }],
    ["negative count", { mirrorsAgreeing: -1 }],
  ])("rejects %s", async (_n, patch) => {
    const a = buildAttestation(await report(), NOW);
    expect(parseAttestation(b64(typeof patch === "string" ? patch : JSON.stringify({ ...a, ...patch })))).toBeNull();
  });

  it("audit log keeps only well-formed attestations from the attester, newest first", async () => {
    const a = encodeAttestation(buildAttestation(await report(), NOW));
    const msgs: TopicMessage[] = [
      ...chainOf([JSON.parse(a), JSON.parse(a)]),
      ...chainOf([JSON.parse(a)], "0.0.666").map((m) => ({ ...m, sequenceNumber: 3 })),
      ...chainOf(["junk"]).map((m) => ({ ...m, sequenceNumber: 4 })),
    ];
    expect(auditEntries(msgs, ISSUER).map((e) => e.sequence)).toEqual([2, 1]);
  });
});
