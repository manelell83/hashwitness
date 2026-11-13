// pnpm sim [--seed 42] [--scenarios 200] [--llm 40]
//   --llm N: also evaluates the LLM agent (LLM_* from .env, cached) on the first N scenarios. pnpm sim:llm does this.
// Writes .data/sim/metrics.json (read by the Metrics screen), scenarios.csv and costCurve.csv.
import { mkdirSync, writeFileSync } from "node:fs";
import { agentConfigFromEnv, analyze } from "@hashwitness/agent";
import { runSimulation, toCsv, type LlmEval } from "./run.ts";
import { DEFAULT_SIM } from "./world.ts";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : undefined;
};
const cfg = { ...DEFAULT_SIM, seed: arg("seed") ?? DEFAULT_SIM.seed, scenarios: arg("scenarios") ?? DEFAULT_SIM.scenarios };

let llm: LlmEval | undefined;
const llmN = arg("llm");
if (llmN) {
  const a = { ...agentConfigFromEnv(new URL("../../../", import.meta.url)), log: () => {} };
  if (!a.demoReplay && (!a.apiKey || !a.model)) {
    console.error("--llm needs LLM_API_KEY and LLM_MODEL in .env (or DEMO_REPLAY=1 to use recordings)");
    process.exit(2);
  }
  llm = { limit: llmN, label: `LLM: ${a.model ?? "recorded"}${a.demoReplay ? " (recorded answers)" : ""}, on query-all evidence`, analyze: (r) => analyze(r, a) };
}

const t0 = performance.now();
const { report, rows } = await runSimulation(cfg, new Date(), llm);
const out = new URL("../../../.data/sim/", import.meta.url);
mkdirSync(out, { recursive: true });
writeFileSync(new URL("metrics.json", out), JSON.stringify(report, null, 2));
writeFileSync(new URL("scenarios.csv", out), toCsv(rows));
writeFileSync(new URL("costCurve.csv", out), toCsv(report.costCurve as never));

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
console.log(`${report.scenarios} scenarios, seed ${report.seed}, ${Math.round(performance.now() - t0)} ms`);
for (const [name, s] of [["bandit", report.bandit], ["query-all", report.baseline]] as const) {
  console.log(
    `${name.padEnd(10)} queries ${String(s.queries).padStart(5)} (${(s.queries / s.verifications).toFixed(2)}/verif)  cost ${String(s.costUnits).padStart(5)}` +
      `  detection ${pct(s.detectionRate)}  FP ${pct(s.falsePositiveRate)}  fooled ${pct(s.fooledRate)}  correct ${pct(s.correctVerdictRate)}`,
  );
}
console.log("confusion (rows actual, cols predicted):", report.confusion.labels.join(" | "));
report.confusion.matrix.forEach((r, i) => console.log(`  ${report.confusion.labels[i]!.padEnd(13)} ${r.map((v) => String(v).padStart(4)).join("")}`));
const c = report.confusionLlm;
if (c) {
  console.log(`
${c.classifier}, first ${c.scenarios} scenarios. Engine: ${JSON.stringify(c.engine)}`);
  console.log("  actual \ predicted".padEnd(16), c.labels.map((l) => l.slice(0, 8).padStart(9)).join(""), "   | rules on same scenarios");
  c.matrix.forEach((r, i) => console.log(`  ${c.labels[i]!.padEnd(14)}${r.map((v) => String(v).padStart(9)).join("")}    | ${c.rulesMatrix[i]!.join(" ")}`));
}
