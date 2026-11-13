// Data contract between the simulation (M7, writes it) and the Metrics screen (M6, reads it).
// Every number in a MetricsReport is MEASURED by the simulation; nothing is entered by hand.

export const ATTACK_LABELS = ["tamper", "replay", "equivocation", "benign_fault"] as const;
export type AttackLabel = (typeof ATTACK_LABELS)[number];

export interface StrategyStats {
  verifications: number;
  queries: number; // mirror requests issued (split-view probes included)
  costUnits: number; // sum of per-mirror query costs
  detectionRate: number; // attacked scenarios where the attacking mirror was flagged / attacked scenarios
  falsePositiveRate: number; // benign scenarios where any mirror was flagged as lying / benign scenarios
  fooledRate: number; // attacked scenarios where the verdict was the attacker's lie (VALID) / attacked scenarios
  correctVerdictRate: number; // scenarios with the true verdict (REVOKED) / all scenarios
}

export interface MetricsReport {
  v: 1;
  generatedAt: string; // ISO-8601
  seed: number;
  scenarios: number;
  bandit: StrategyStats; // Thompson sampling over mirrors
  baseline: StrategyStats; // query every mirror every time
  /** Cumulative cost after each scenario, same scenario order for both strategies. */
  costCurve: { scenario: number; bandit: number; baseline: number }[];
  /** Agent classification vs ground truth. matrix[actual][predicted], indices follow `labels`. */
  confusion: { labels: AttackLabel[]; matrix: number[][]; classifier: string };
  /** The simulation's assumptions (mirror pool, attack rates, bandit parameters), exported with the results. */
  config?: unknown;
}

const isRate = (x: unknown) => typeof x === "number" && x >= 0 && x <= 1;
const isCount = (x: unknown) => Number.isFinite(x) && (x as number) >= 0;

function stats(s: unknown): s is StrategyStats {
  const o = s as Record<string, unknown>;
  return !!o && isCount(o.verifications) && isCount(o.queries) && isCount(o.costUnits) && isRate(o.detectionRate)
    && isRate(o.falsePositiveRate) && isRate(o.fooledRate) && isRate(o.correctVerdictRate);
}

/** Shape check for a metrics file read from disk. */
export function isMetricsReport(v: unknown): v is MetricsReport {
  const o = v as Record<string, unknown>;
  if (!o || o.v !== 1 || typeof o.generatedAt !== "string" || !Number.isInteger(o.seed) || !isCount(o.scenarios)) return false;
  if (!stats(o.bandit) || !stats(o.baseline)) return false;
  const curve = o.costCurve as unknown[];
  if (!Array.isArray(curve) || !curve.every((p) => { const q = p as Record<string, unknown>; return isCount(q.scenario) && isCount(q.bandit) && isCount(q.baseline); })) return false;
  const c = o.confusion as Record<string, unknown> | undefined;
  if (!c || !Array.isArray(c.labels) || typeof c.classifier !== "string" || !Array.isArray(c.matrix)) return false;
  const n = c.labels.length;
  return c.matrix.length === n && (c.matrix as unknown[]).every((r) => Array.isArray(r) && r.length === n && r.every(isCount));
}
