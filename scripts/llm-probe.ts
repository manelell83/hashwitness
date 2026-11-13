// Tests one LLM model with the REAL agent code path on an offline tamper scenario (no testnet needed).
// Uses a throwaway cache so the call really reaches the API. Prints which engine answered; never the key.
//   pnpm llm:probe <model>          (LLM_API_KEY and LLM_BASE_URL from .env)
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifyCredential } from "@hashwitness/core";
import { agentConfigFromEnv, analyze } from "@hashwitness/agent";
import { chainOf, event, ISSUER, memoryFetch, mirror, REGISTRY, TOPIC } from "../packages/core/test/chain.ts";

const model = process.argv[2] || process.env.LLM_MODEL;
if (!model) {
  console.error("usage: pnpm llm:probe <model>");
  process.exit(2);
}
const result = await verifyCredential({
  topicId: TOPIC, credentialId: "DIP-001", issuer: ISSUER, k: 2, lagRetryMs: 1, probeSplitView: false,
  anchor: { sequence: 4, runningHash: REGISTRY()[3]!.runningHash },
  mirrors: ["a.test", "b.test", "c.test"].map(mirror),
  fetch: {
    fetchImpl: memoryFetch({
      "a.test": REGISTRY(), "b.test": REGISTRY(),
      "c.test": chainOf([event("issue", "DIP-001"), event("issue", "DIP-002"), event("issue", "DIP-003")]),
    }),
  },
});

// Counts HTTP calls and keeps only non-secret response facts (status, finish_reason, content length).
let calls = 0;
const facts: string[] = [];
const fetchImpl: typeof fetch = async (input, init) => {
  calls++;
  const res = await fetch(input, init);
  const body = await res.clone().text();
  try {
    const j = JSON.parse(body) as { choices?: { finish_reason?: string; message?: { content?: string } }[]; error?: { code?: unknown } };
    const c = j.choices?.[0];
    facts.push(`HTTP ${res.status} finish=${c?.finish_reason ?? "-"} content=${c?.message?.content?.length ?? 0} chars${j.error ? ` error=${j.error.code}` : ""}`);
  } catch {
    facts.push(`HTTP ${res.status} (non-JSON body)`);
  }
  return res;
};

const cfg = { ...agentConfigFromEnv(new URL("../", import.meta.url)), model, demoReplay: false, fetchImpl,
  cacheDir: join(mkdtempSync(join(tmpdir(), "hw-probe-")), "cache"), log: (l: string) => console.log(`  ${l}`) };
if (!cfg.apiKey) {
  console.error("LLM_API_KEY is not set in .env");
  process.exit(2);
}
const t0 = Date.now();
const f = await analyze(result, cfg);
console.log(`model ${model}`);
console.log(`  engine: ${f?.source === "llm" ? `LLM: ${f.model}` : `Rule-based fallback (${f?.fallbackReason})`}  ${Date.now() - t0} ms  calls=${calls}`);
for (const x of facts) console.log(`  ${x}`);
if (f) console.log(`  attackType=${f.attackType} (rules agree: ${f.agreesWithRules}) confidence=${f.confidence}\n  explanation: ${f.explanation}\n  action: ${f.recommendedAction}`);
