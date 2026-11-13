import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cachedAnchor, mirrorCacheFetch } from "../src/mirrorCache.ts";

const dir = () => mkdtempSync(join(tmpdir(), "hw-cache-"));
const ok = (body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }));
afterEach(() => { delete process.env.HW_OFFLINE; });

describe("offline mirror cache", () => {
  it("records online, then replays offline without touching the network", async () => {
    const d = dir();
    const net = ok({ messages: [1, 2] });
    const url = "https://mirror.example/v1/SECRETKEY123/api/v1/topics/0.0.5/messages?limit=100&order=asc";
    expect(await (await mirrorCacheFetch(d, net)(url)).json()).toEqual({ messages: [1, 2] });

    process.env.HW_OFFLINE = "1";
    const offlineNet = vi.fn(async () => { throw new Error("network used"); });
    expect(await (await mirrorCacheFetch(d, offlineNet)(url)).json()).toEqual({ messages: [1, 2] });
    expect(offlineNet).not.toHaveBeenCalled();
    expect(readdirSync(d).join()).not.toContain("SECRETKEY123"); // a key in the URL path never reaches a file name
  });

  it("fails clearly offline when nothing was cached, and never caches local mirrors or errors", async () => {
    const d = dir();
    await mirrorCacheFetch(d, vi.fn(async () => new Response("no", { status: 401 })))("https://m.example/api/v1/x");
    await mirrorCacheFetch(d, ok({}))("http://127.0.0.1:5551/api/v1/x");
    expect(readdirSync(d)).toEqual([]);
    process.env.HW_OFFLINE = "1";
    await expect(mirrorCacheFetch(d, ok({}))("https://m.example/api/v1/x")).rejects.toThrow(/offline/);
    const local = ok({ local: true }); // the local attacker mirror still works offline
    expect(await (await mirrorCacheFetch(d, local)("http://127.0.0.1:5551/api/v1/x")).json()).toEqual({ local: true });
  });

  it("saves the consensus anchor online and replays it offline", async () => {
    const d = dir();
    const live = vi.fn(async () => ({ sequence: 4, runningHash: "abc" }));
    await cachedAnchor(d, "0.0.5", live);
    process.env.HW_OFFLINE = "1";
    const never = vi.fn(async () => { throw new Error("network used"); });
    expect(await cachedAnchor(d, "0.0.5", never)).toEqual({ sequence: 4, runningHash: "abc" });
    await expect(cachedAnchor(d, "0.0.6", never)).rejects.toThrow(/offline/);
  });
});
