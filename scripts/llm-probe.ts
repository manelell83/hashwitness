// Tests one LLM model with the REAL agent code path on an offline tamper scenario (no testnet needed).
// Uses a throwaway cache so the call really reaches the API. Prints which engine answered; never the key.
//   pnpm llm:probe <model>          (LLM_API_KEY and LLM_BASE_URL from .env)
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifyCredential } from "@hashwitness/core";
import { agentConfigFromEnv, analyze } from "@hashwitness/agent";
import { chainOf, event, ISSUER, memoryFetch, mirror, REGISTRY, TOPIC, type View } from "../packages/core/test/chain.ts";

const args = process.argv.slice(2);
const flag = (name: string) => { const i = args.indexOf(name); return i >= 0 ? Number(args.splice(i, 2)[1]) : undefined; };
const maxTokens = flag("--max-tokens");
const timeoutMs = flag("--timeout-ms"); // diagnosis only: the app always uses 5000
const model = args[0] || process.env.LLM_MODEL;
const only = args[1]; // optional: tamper | replay | equivocation
if (!model) {
  console.error("usage: pnpm llm:probe <model> [tamper|replay|equivocation]");
  process.exit(2);
}
const LIE = () => chainOf([event("issue", "DIP-001"), event("issue", "DIP-002"), event("issue", "DIP-003")]);
const scenario = (third: View, probe = false) => verifyCredential({
  topicId: TOPIC, credentialId: "DIP-001", issuer: ISSUER, k: 2, lagRetryMs: 1, probeSplitView: probe,
  anchor: { sequence: 4, runningHash: REGISTRY()[3]!.runningHash },
  mirrors: ["a.test", "b.test", "c.test"].map(mirror),
  fetch: { fetchImpl: memoryFetch({ "a.test": REGISTRY(), "b.test": REGISTRY(), "c.test": third }) },
});
const SCENARIOS = {
  tamper: () => scenario(LIE()),
  replay: () => scenario(REGISTRY().slice(0, 2)),
  equivocation: () => scenario((_n, c) => (c === "hashwitness" ? REGISTRY() : LIE()), true),
} as const;

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

const base = agentConfigFromEnv(new URL("../", import.meta.url));
const cfg = { ...base, model, demoReplay: false, fetchImpl, maxTokens: maxTokens ?? base.maxTokens, timeoutMs: timeoutMs ?? 5000,
  cacheDir: join(mkdtempSync(join(tmpdir(), "hw-probe-")), "cache"), log: (l: string) => console.log(`  ${l}`) };
if (!cfg.apiKey) {
  console.error("LLM_API_KEY is not set in .env");
  process.exit(2);
}
console.log(`model ${model}  max_tokens=${cfg.maxTokens}  timeout=${cfg.timeoutMs} ms`);
let pass = true;
for (const [truth, make] of Object.entries(SCENARIOS)) {
  if (only && only !== truth) continue;
  calls = 0;
  facts.length = 0;
  const t0 = Date.now();
  const f = await analyze(await make(), cfg);
  const ok = f?.source === "llm" && f.attackType === truth;
  pass &&= ok;
  console.log(`\n[${truth}] ${ok ? "PASS" : "FAIL"}  engine: ${f?.source === "llm" ? `LLM: ${f.model}` : `Rule-based fallback (${f?.fallbackReason})`}  ${Date.now() - t0} ms  calls=${calls}`);
  for (const x of facts) console.log(`  ${x}`);
  if (f) console.log(`  attackType=${f.attackType} confidence=${f.confidence}\n  explanation: ${f.explanation}\n  action: ${f.recommendedAction}`);
}
console.log(`\n${pass ? "PASS" : "FAIL"}: schema-valid LLM output with the correct class on every scenario`);
process.exit(pass ? 0 : 1);
