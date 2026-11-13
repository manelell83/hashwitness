import { buildEvidence, classify, needsAnalysis, type Forensic } from "@hashwitness/agent";
import type { VerificationResult } from "@hashwitness/core";
import { ATTACK_LABELS, type AttackLabel, type MetricsReport, type StrategyStats } from "./metrics.ts";
import { queryAll, ThompsonBandit, type Outcome } from "./strategies.ts";
import { makeScenarios, type Scenario, type SimConfig } from "./world.ts";

export interface Row {
  scenario: number;
  truth: AttackLabel;
  attacker: string;
  banditQueries: number;
  banditCost: number;
  banditVerdict: string;
  banditFlagged: string;
  baselineQueries: number;
  baselineCost: number;
  baselineVerdict: string;
  baselineFlagged: string;
  predicted: AttackLabel;
}

const predict = (o: Outcome): AttackLabel => {
  const { evidence } = buildEvidence(o.result);
  return needsAnalysis(evidence) ? classify(evidence).attackType : "benign_fault";
};

function stats(outcomes: Outcome[], scenarios: Scenario[]): StrategyStats {
  const attacked = scenarios.map((s, i) => ({ s, o: outcomes[i]! })).filter((x) => x.s.attacker);
  const benign = scenarios.map((s, i) => ({ s, o: outcomes[i]! })).filter((x) => !x.s.attacker);
  const rate = (n: number, d: number) => (d ? n / d : 0);
  return {
    verifications: outcomes.length,
    queries: outcomes.reduce((a, o) => a + o.queries, 0),
    costUnits: outcomes.reduce((a, o) => a + o.cost, 0),
    detectionRate: rate(attacked.filter((x) => x.o.result.disagreeing.includes(x.s.attacker!)).length, attacked.length),
    falsePositiveRate: rate(benign.filter((x) => x.o.result.disagreeing.length > 0).length, benign.length),
    fooledRate: rate(attacked.filter((x) => x.o.result.verdict === "VALID").length, attacked.length),
    correctVerdictRate: rate(outcomes.filter((o) => o.result.verdict === "REVOKED").length, outcomes.length),
  };
}

/** Optional: the LLM agent evaluated on the first `limit` scenarios (query-all evidence), through its cache. */
export interface LlmEval {
  analyze: (r: VerificationResult) => Promise<Forensic | null>;
  limit: number;
  label: string;
}

/** Runs every scenario through both strategies. Deterministic for a given config (seeded). */
export async function runSimulation(cfg: SimConfig, now = new Date(), llm?: LlmEval): Promise<{ report: MetricsReport; rows: Row[] }> {
  const scenarios = makeScenarios(cfg);
  const bandit = new ThompsonBandit(cfg);
  const b: Outcome[] = [];
  const q: Outcome[] = [];
  for (const s of scenarios) {
    b.push(await bandit.run(s)); // sequential: the bandit learns from each scenario
    q.push(await queryAll(s, cfg));
  }

  let cb = 0, cq = 0;
  const costCurve = scenarios.map((s, i) => ({ scenario: s.id, bandit: (cb += b[i]!.cost), baseline: (cq += q[i]!.cost) }));

  // Classifier evaluated on the query-all observations (full evidence), so the matrix measures the classifier,
  // not which mirrors the bandit happened to query.
  const idx = (l: AttackLabel) => ATTACK_LABELS.indexOf(l);
  const matrix = ATTACK_LABELS.map(() => ATTACK_LABELS.map(() => 0));
  const rows: Row[] = scenarios.map((s, i) => {
    const predicted = predict(q[i]!);
    matrix[idx(s.truth)]![idx(predicted)]!++;
    return {
      scenario: s.id, truth: s.truth, attacker: s.attacker ?? "",
      banditQueries: b[i]!.queries, banditCost: b[i]!.cost, banditVerdict: b[i]!.result.verdict, banditFlagged: b[i]!.result.disagreeing.join(" "),
      baselineQueries: q[i]!.queries, baselineCost: q[i]!.cost, baselineVerdict: q[i]!.result.verdict, baselineFlagged: q[i]!.result.disagreeing.join(" "),
      predicted,
    };
  });

  // LLM vs ground truth on the same first N scenarios, with the rule-based matrix on that subset for comparison.
  // Answers that fell back to the rules are counted in `engine.fallback` and left out of the LLM matrix.
  let confusionLlm: MetricsReport["confusionLlm"];
  if (llm) {
    const n = Math.min(llm.limit, scenarios.length);
    const zero = () => ATTACK_LABELS.map(() => ATTACK_LABELS.map(() => 0));
    const m = zero(), rules = zero();
    const engine = { llm: 0, cache: 0, replay: 0, fallback: 0, notNeeded: 0 };
    for (let i = 0; i < n; i++) {
      const t = idx(scenarios[i]!.truth);
      rules[t]![idx(rows[i]!.predicted)]!++;
      const f = await llm.analyze(q[i]!.result);
      if (!f) {
        engine.notNeeded++; // every mirror agreed: nothing to explain, shown as benign_fault (same as the rules)
        m[t]![idx("benign_fault")]!++;
        continue;
      }
      engine[f.source]++;
      if (f.source !== "fallback") m[t]![idx(f.attackType)]!++;
    }
    confusionLlm = { labels: [...ATTACK_LABELS], matrix: m, rulesMatrix: rules, classifier: llm.label, scenarios: n, engine };
  }

  return {
    rows,
    report: {
      v: 1,
      generatedAt: now.toISOString(),
      seed: cfg.seed,
      scenarios: scenarios.length,
      bandit: stats(b, scenarios),
      baseline: stats(q, scenarios),
      costCurve,
      confusion: { labels: [...ATTACK_LABELS], matrix, classifier: "rule-based classifier (agent fallback), on query-all evidence" },
      ...(confusionLlm ? { confusionLlm } : {}),
      config: cfg,
    },
  };
}

export function toCsv(rows: Row[]): string {
  const cols = Object.keys(rows[0] ?? {}) as (keyof Row)[];
  const esc = (v: unknown) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n") + "\n";
}
