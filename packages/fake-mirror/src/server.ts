import { fileURLToPath } from "node:url";
import { isOffline, mirrorCacheFetch } from "@hashwitness/core/mirror-cache";
import { createApp } from "./app.ts";

const port = Number(process.env.FAKE_MIRROR_PORT ?? 5551);
const upstream = process.env.FAKE_MIRROR_UPSTREAM ?? "https://testnet.mirrornode.hedera.com";

// Bound to localhost only: the admin endpoint has no authentication.
// Express 5 passes listen errors (e.g. port in use) to the callback: fail loudly instead of exiting silently.
// Upstream responses go through the offline cache shared with the API (replayed when HW_OFFLINE=1).
const fetchImpl = mirrorCacheFetch(fileURLToPath(new URL("../../../.data/mirror-cache/", import.meta.url)));
createApp({ upstream, fetchImpl }).listen(port, "127.0.0.1", (err?: Error) => {
  if (err) {
    console.error(`fake mirror could not listen on ${port}: ${err.message}`);
    process.exit(1);
  }
  console.log(`fake mirror on http://127.0.0.1:${port} -> ${upstream}${isOffline() ? " (OFFLINE: cached upstream)" : ""} (mode: honest)`);
});
