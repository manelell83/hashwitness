// Offline demo support. Online, every successful mirror response is saved; with HW_OFFLINE=1 the saved responses
// are served instead and the network is never touched. Node only (not exported from the package index).
//
// Cache key = mirror host + the "/api/v1/..." part of the URL. A key that a provider puts in the URL path sits
// before "/api/v1" and header keys are not in the URL, so no secret reaches a file name. Bodies are public
// testnet data. Local mirrors (the attacker proxy) are never cached: they run offline anyway.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Anchor } from "./verify.ts";

export const isOffline = (): boolean => process.env.HW_OFFLINE === "1";

const isLocal = (u: URL) => ["127.0.0.1", "localhost", "[::1]"].includes(u.hostname);

function keyOf(u: URL): string {
  const i = u.pathname.indexOf("/api/v1/");
  const tail = (i >= 0 ? u.pathname.slice(i) : u.pathname) + u.search;
  return `${u.hostname}-${createHash("sha256").update(tail).digest("hex").slice(0, 32)}.json`;
}

/** A fetch that records (online) or replays (HW_OFFLINE=1) mirror responses in `dir`. */
export function mirrorCacheFetch(dir: string, realFetch: typeof fetch = fetch): typeof fetch {
  return async (input, init) => {
    const u = new URL(input instanceof Request ? input.url : String(input));
    if (isLocal(u)) return realFetch(input, init);
    const file = join(dir, keyOf(u));
    if (isOffline()) {
      if (!existsSync(file)) throw new TypeError("offline: no cached response (run `pnpm demo` online once)");
      return new Response(readFileSync(file, "utf8"), { status: 200, headers: { "content-type": "application/json" } });
    }
    const res = await realFetch(input, init);
    if (res.ok) {
      mkdirSync(dir, { recursive: true });
      writeFileSync(file, await res.clone().text());
    }
    return res;
  };
}

/** Consensus anchor: read live and saved online; replayed from the saved copy offline. */
export async function cachedAnchor(dir: string, topicId: string, readLive: (t: string) => Promise<Anchor>): Promise<Anchor> {
  const file = join(dir, `anchor-${topicId}.json`);
  if (isOffline()) {
    if (!existsSync(file)) throw new Error(`offline: no cached consensus anchor for ${topicId} (run \`pnpm demo\` online once)`);
    return (JSON.parse(readFileSync(file, "utf8")) as { anchor: Anchor }).anchor;
  }
  const anchor = await readLive(topicId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, JSON.stringify({ anchor, savedAt: new Date().toISOString() }, null, 2));
  return anchor;
}

/** Newest save time in the cache, shown in the offline banner (null if the cache is empty). */
export function cacheSavedAt(dir: string): string | null {
  if (!existsSync(dir)) return null;
  const times = readdirSync(dir).map((f) => statSync(join(dir, f)).mtimeMs);
  return times.length ? new Date(Math.max(...times)).toISOString() : null;
}
