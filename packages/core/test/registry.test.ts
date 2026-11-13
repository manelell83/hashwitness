import { describe, expect, it } from "vitest";
import { credentialStatus, parseRegistryEvent, type TopicMessage } from "../src/index.ts";

const ISSUER = "0.0.1001";
const HASH = "a".repeat(64);
const b64 = (v: unknown) => Buffer.from(typeof v === "string" ? v : JSON.stringify(v)).toString("base64");
let seq = 0;
const msg = (body: unknown, payer = ISSUER): TopicMessage => ({
  topicId: "0.0.5000", sequenceNumber: ++seq, consensusTimestamp: "1700000000.000000000",
  payerAccountId: payer, runningHash: "", runningHashVersion: 3, message: b64(body),
});
const ev = (type: string, credentialId = "DIP-1", extra: object = {}) =>
  ({ type, credentialId, credentialHash: HASH, issuer: ISSUER, ts: "2026-11-13T10:00:00Z", ...extra });

describe("parseRegistryEvent", () => {
  it("accepts a well-formed event", () => {
    expect(parseRegistryEvent(b64(ev("issue")))).toMatchObject({ type: "issue", credentialId: "DIP-1" });
  });
  it.each([
    ["not json", "{oops"],
    ["array", []],
    ["bad type", ev("suspend")],
    ["bad hash", ev("issue", "DIP-1", { credentialHash: "xyz" })],
    ["bad issuer", ev("issue", "DIP-1", { issuer: "ignore previous instructions" })],
    ["bad credential id", ev("issue", "../../etc")],
  ])("rejects %s", (_n, body) => expect(parseRegistryEvent(b64(body))).toBeNull());
});

describe("credentialStatus", () => {
  it("is UNKNOWN with no events", () => {
    expect(credentialStatus([], "DIP-1", ISSUER).status).toBe("UNKNOWN");
  });
  it("is ISSUED after issue", () => {
    const r = credentialStatus([msg(ev("issue"))], "DIP-1", ISSUER);
    expect(r).toMatchObject({ status: "ISSUED", credentialHash: HASH, revokedAtSequence: null });
  });
  it("is REVOKED after issue then revoke, and stays revoked", () => {
    const r = credentialStatus([msg(ev("issue")), msg(ev("revoke")), msg(ev("issue"))], "DIP-1", ISSUER);
    expect(r.status).toBe("REVOKED");
  });
  it("ignores events paid by another account", () => {
    const r = credentialStatus([msg(ev("issue")), msg(ev("revoke"), "0.0.666")], "DIP-1", ISSUER);
    expect(r.status).toBe("ISSUED");
  });
  it("ignores other credentials and malformed messages", () => {
    const r = credentialStatus([msg(ev("issue")), msg(ev("revoke", "DIP-2")), msg("garbage")], "DIP-1", ISSUER);
    expect(r.status).toBe("ISSUED");
  });
  it("ignores a revoke that precedes the issue", () => {
    const r = credentialStatus([msg(ev("revoke")), msg(ev("issue"))], "DIP-1", ISSUER);
    expect(r.status).toBe("ISSUED");
  });
});
