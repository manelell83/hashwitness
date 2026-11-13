import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createApi, type ApiDeps } from "../src/app.ts";

const deps: ApiDeps = {
  config: () => ({ mirrors: ["hedera-public"], attackerMirror: "fake", k: 1, registryTopic: "0.0.1", attestationTopic: "0.0.2" }),
  verify: vi.fn(async () => ({ result: { verdict: "VALID" } as never, forensic: null, attestation: null })),
  naive: vi.fn(async (_id, mirror) => ({ mirror, status: "ISSUED" as const, lastSequence: 4, latencyMs: 1 })),
  getAttackMode: async () => ({ mode: "honest" }),
  setAttackMode: async () => { throw new Error("secret-ish internal detail"); },
};

let server: Server;
let base: string;
beforeAll(async () => {
  server = createApi(deps).listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

const post = (path: string, body: unknown) =>
  fetch(base + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("api", () => {
  it("passes a valid credential id through", async () => {
    const r = await post("/api/verify", { credentialId: "DIP-001", includeAttacker: true });
    expect(r.status).toBe(200);
    expect(deps.verify).toHaveBeenCalledWith("DIP-001", { includeAttacker: true });
  });

  it.each([[{}], [{ credentialId: "" }], [{ credentialId: "a".repeat(65) }], [{ credentialId: "<script>" }], [{ credentialId: 42 }]])(
    "rejects %j", async (body) => {
      expect((await post("/api/verify", body)).status).toBe(400);
      expect((await post("/api/naive", body)).status).toBe(400);
    },
  );

  it("defaults the naive app to the attacker mirror", async () => {
    await post("/api/naive", { credentialId: "DIP-001", mirror: "anything-else" });
    expect(deps.naive).toHaveBeenLastCalledWith("DIP-001", "attacker");
  });

  it("returns a generic error without internal details", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await post("/api/attack-mode", { mode: "tamper" });
    expect(r.status).toBe(502);
    expect(await r.text()).not.toContain("secret-ish");
  });
});
