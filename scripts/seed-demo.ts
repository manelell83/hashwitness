// Seeds everything the demo needs. Idempotent: safe to run before every demo.
//   1. registry + attestation topics (created only if missing; IDs written into .env)
//   2. registry content: issue DIP-001, issue DIP-002, revoke DIP-001, issue DIP-003 (only if the topic is empty)
//   3. simulation results for the Metrics screen (seeded, reproducible)
//   4. offline cache: every real mirror's view, the consensus anchor and the audit topic (for pnpm demo:offline)
//   pnpm demo:seed
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { TopicCreateTransaction } from "@hiero-ledger/sdk";
import { credentialStatus, fetchTopicMessages, type RegistryEvent, type VerificationResult } from "@hashwitness/core";
import { agentConfigFromEnv, analyze } from "@hashwitness/agent";
import { runSimulation } from "@hashwitness/sim/run";
import { DEFAULT_SIM } from "@hashwitness/sim/world";
import {
  anchorFor, cacheFetch, canonicalJson, demoDiploma, env, hashscanTopic, operatorKey, PUBLIC_MIRROR, realMirrors, sha256Hex, submitMessage, testnetClient,
} from "./lib.ts";

// HW_ENV_FILE lets the seed be tested against a copy without touching the real .env.
const ENV_FILE = process.env.HW_ENV_FILE ?? new URL("../.env", import.meta.url);
const issuer = env("OPERATOR_ID");
env("OPERATOR_KEY");

/** Replaces one KEY=value line in .env (other lines, including secrets, are left untouched and never printed). */
function setEnvLine(key: string, value: string): void {
  const text = readFileSync(ENV_FILE, "utf8");
  const line = `${key}=${value}`;
  const next = new RegExp(`^${key}=.*$`, "m").test(text) ? text.replace(new RegExp(`^${key}=.*$`, "m"), line) : `${text.trimEnd()}\n${line}\n`;
  writeFileSync(ENV_FILE, next);
  process.env[key] = value;
}

// 1. Topics
for (const [key, memo] of [["REGISTRY_TOPIC_ID", "registry"], ["ATTESTATION_TOPIC_ID", "attestation"]] as const) {
  if (process.env[key]) {
    console.log(`✓ ${memo} topic ${process.env[key]}`);
    continue;
  }
  const client = testnetClient();
  try {
    const tx = await new TopicCreateTransaction().setTopicMemo(`HashWitness ${memo}`).setSubmitKey(operatorKey().publicKey).execute(client);
    const id = (await tx.getReceipt(client)).topicId!.toString();
    setEnvLine(key, id);
    console.log(`+ created ${memo} topic ${id} (saved to .env)`);
  } finally {
    client.close();
  }
}

// 2. Registry content
const registry = env("REGISTRY_TOPIC_ID");
const { messages } = await fetchTopicMessages(PUBLIC_MIRROR, registry);
const expected = { "DIP-001": "REVOKED", "DIP-002": "ISSUED", "DIP-003": "ISSUED" } as const;
if (messages.length === 0) {
  const steps: [RegistryEvent["type"], string][] = [["issue", "DIP-001"], ["issue", "DIP-002"], ["revoke", "DIP-001"], ["issue", "DIP-003"]];
  for (const [type, credentialId] of steps) {
    const ev: RegistryEvent = {
      type, credentialId, credentialHash: sha256Hex(canonicalJson(demoDiploma(credentialId))), issuer, ts: new Date().toISOString(),
    };
    const r = await submitMessage(registry, JSON.stringify(ev));
    console.log(`+ ${type} ${credentialId} (seq ${r.sequence})`);
  }
} else {
  const bad = Object.entries(expected).filter(([id, s]) => credentialStatus(messages, id, issuer).status !== s);
  if (bad.length) {
    console.error(`✕ registry ${registry} already has ${messages.length} messages but not the demo state (${bad.map(([id]) => id).join(", ")}).`);
    console.error("  Clear REGISTRY_TOPIC_ID and ATTESTATION_TOPIC_ID in .env to create fresh demo topics.");
    process.exit(1);
  }
  console.log(`✓ registry has the demo state (${messages.length} messages): DIP-001 revoked, DIP-002 and DIP-003 valid`);
}

// 3. Simulation results. The LLM matrix (first 40 scenarios) is rebuilt from the committed demo-replay/ recordings
// of real runs (`pnpm sim:llm`): no network, no cost, same numbers every time.
const agent = { ...agentConfigFromEnv(new URL("../", import.meta.url)), demoReplay: true, log: () => {} };
const recorded = existsSync(agent.recordingsDir) ? readdirSync(agent.recordingsDir).filter((f) => f.endsWith(".json")) : [];
const model = recorded.length ? (JSON.parse(readFileSync(join(agent.recordingsDir, recorded[0]!), "utf8")) as { model: string }).model : null;
const llm = model ? { limit: 40, label: `LLM: ${model} (recorded answers), on query-all evidence`, analyze: (r: VerificationResult) => analyze(r, agent) } : undefined;
const { report } = await runSimulation(DEFAULT_SIM, new Date(), llm);
const out = new URL("../.data/sim/", import.meta.url);
mkdirSync(out, { recursive: true });
writeFileSync(new URL("metrics.json", out), JSON.stringify(report, null, 2));
console.log(`✓ simulation: ${report.scenarios} scenarios (seed ${report.seed}) → .data/sim/metrics.json`);
const e = report.confusionLlm?.engine;
console.log(e ? `✓ LLM confusion matrix: ${report.confusionLlm!.scenarios} scenarios from recordings (${e.replay} recorded, ${e.fallback} missing → excluded)` : "· no LLM recordings: Metrics shows the rule-based matrix only");
// 4. Offline cache (also refreshed by every online verification)
const real = realMirrors();
let cached = 0;
for (const m of real) {
  try {
    await fetchTopicMessages(m, registry, { fetchImpl: cacheFetch });
    cached++;
  } catch (e) {
    console.warn(`! ${m.name}: ${(e as Error).message} (not cached; it will show as unreachable offline)`);
  }
}
const anchor = await anchorFor(registry);
await fetchTopicMessages(PUBLIC_MIRROR, env("ATTESTATION_TOPIC_ID"), { fetchImpl: cacheFetch });
console.log(`✓ offline cache: ${cached}/${real.length} real mirrors (${real.map((m) => m.name).join(", ")}), anchor seq ${anchor.sequence}, audit topic`);

console.log(`
Ready.
  App (open this):   http://localhost:5173
  API:               http://127.0.0.1:5552/api/config
  Attacker mirror:   http://127.0.0.1:5551/admin/mode
  Registry topic:    ${hashscanTopic(registry)}
  Attestation topic: ${hashscanTopic(env("ATTESTATION_TOPIC_ID"))}
Offline backup (no testnet, no LLM): pnpm demo:offline`);
