// Backup demo with no network: mirror responses and the consensus anchor are replayed from .data/mirror-cache
// (saved by `pnpm demo` and every online verification), AI answers from demo-replay/ (real recorded LLM outputs).
// The attacker mirror and all checks still run for real on that data. Nothing is published to Hedera.
//   pnpm demo:offline
import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";

const cache = new URL("../.data/mirror-cache/", import.meta.url);
const topic = process.env.REGISTRY_TOPIC_ID;
if (!topic || !existsSync(new URL(`anchor-${topic}.json`, cache))) {
  console.error("No offline cache yet for the registry topic. Run `pnpm demo` once with network first.");
  process.exit(1);
}
const recordings = readdirSync(new URL("../demo-replay/", import.meta.url)).filter((f) => f.endsWith(".json")).length;
console.log(`OFFLINE demo: cached mirror responses + anchor, ${recordings} recorded AI answers, no attestations.
  App (open this):   http://localhost:5173
  API:               http://127.0.0.1:5552/api/config
  Attacker mirror:   http://127.0.0.1:5551/admin/mode
`);
const child = spawn("pnpm", ["dev"], { stdio: "inherit", shell: true, env: { ...process.env, HW_OFFLINE: "1", DEMO_REPLAY: "1" } });
child.on("exit", (code) => process.exit(code ?? 0));
