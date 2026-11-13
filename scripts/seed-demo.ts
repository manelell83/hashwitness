// Seeds everything the demo needs. Idempotent: safe to run before every demo.
//   1. registry + attestation topics (created only if missing; IDs written into .env)
//   2. registry content: issue DIP-001, issue DIP-002, revoke DIP-001, issue DIP-003 (only if the topic is empty)
//   3. simulation results for the Metrics screen (seeded, reproducible)
//   pnpm demo:seed
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { TopicCreateTransaction } from "@hiero-ledger/sdk";
import { credentialStatus, fetchTopicMessages, type RegistryEvent } from "@hashwitness/core";
import { runSimulation } from "@hashwitness/sim/run";
import { DEFAULT_SIM } from "@hashwitness/sim/world";
import { canonicalJson, demoDiploma, env, operatorKey, PUBLIC_MIRROR, sha256Hex, submitMessage, testnetClient } from "./lib.ts";

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

// 3. Simulation results
const { report } = await runSimulation(DEFAULT_SIM);
const out = new URL("../.data/sim/", import.meta.url);
mkdirSync(out, { recursive: true });
writeFileSync(new URL("metrics.json", out), JSON.stringify(report, null, 2));
console.log(`✓ simulation: ${report.scenarios} scenarios (seed ${report.seed}) → .data/sim/metrics.json`);
console.log("\nReady. Start the demo with: pnpm dev   (then open http://localhost:5173)");
