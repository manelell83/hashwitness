import { createApp } from "./app.ts";

const port = Number(process.env.FAKE_MIRROR_PORT ?? 5551);
const upstream = process.env.FAKE_MIRROR_UPSTREAM ?? "https://testnet.mirrornode.hedera.com";

// Bound to localhost only: the admin endpoint has no authentication.
createApp({ upstream }).listen(port, "127.0.0.1", () => {
  console.log(`fake mirror on http://127.0.0.1:${port} -> ${upstream} (mode: honest)`);
});
