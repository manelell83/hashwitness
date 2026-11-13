import { describe, expect, it } from "vitest";
import { isMetricsReport } from "../src/metrics.ts";
import { runSimulation, toCsv } from "../src/run.ts";
import { queryAll, ThompsonBandit } from "../src/strategies.ts";
import { DEFAULT_SIM, makeScenarios, rng, viewOf, type Scenario } from "../src/world.ts";
import { verifyChain } from "@hashwitness/core";

const SMALL = { ...DEFAULT_SIM, scenarios: 60 };
const NOW = new Date("2026-11-13T00:00:00Z");

describe("world", () => {
  it("rng and scenarios are deterministic per seed", () => {
    expect(Array.from({ length: 5 }, rng(7))).toEqual(Array.from({ length: 5 }, rng(7)));
    expect(makeScenarios(SMALL)).toEqual(makeScenarios(SMALL));
    expect(makeScenarios({ ...SMALL, seed: 8 })).not.toEqual(makeScenarios(SMALL));
  });

  it("attack views come from the real fake-mirror transforms", () => {
    expect(verifyChain(viewOf("tamper", "main") as never).ok).toBe(true); // re-chained forgery
    expect((viewOf("replay", "main") as unknown[]).length).toBe(2);
    expect(viewOf("equivocate", "main")).toEqual(viewOf("honest", "main"));
    expect(viewOf("equivocate", "probe")).not.toEqual(viewOf("honest", "main"));
  });
});

describe("strategies", () => {
  const attacked = (mode: Scenario["behaviour"][string]): Scenario => ({
    id: 1, truth: "tamper", attacker: "mirror-e",
    behaviour: { "mirror-a": "honest", "mirror-b": "honest", "mirror-c": "honest", "mirror-d": "honest", "mirror-e": mode },
  });

  it.each(["tamper", "replay", "equivocate"] as const)("query-all flags the %s attacker and is not fooled", async (mode) => {
    const o = await queryAll(attacked(mode), DEFAULT_SIM);
    expect(o.result.verdict).toBe("REVOKED");
    expect(o.result.disagreeing).toEqual(["mirror-e"]);
    expect(o.queries).toBe(10); // 5 mirrors, each queried once and probed once
  });

  it("bandit stops as soon as the quorum is met and charges each request once", async () => {
    const b = new ThompsonBandit({ ...DEFAULT_SIM, bandit: { ...DEFAULT_SIM.bandit, probeRate: 0, auditRate: 0 } });
    const o = await b.run(attacked("honest"));
    expect(o.result.quorum.agreeing).toBe(2);
    expect(o.queried).toHaveLength(2);
    expect(o.queries).toBe(2);
  });

  it("Beta sampler has the right mean", () => {
    const b = new ThompsonBandit(DEFAULT_SIM);
    const xs = Array.from({ length: 4000 }, () => b.sampleBeta(8, 2));
    expect(xs.reduce((a, x) => a + x, 0) / xs.length).toBeCloseTo(0.8, 1);
    expect(xs.every((x) => x > 0 && x < 1)).toBe(true);
  });
});

describe("runSimulation", () => {
  it("is reproducible and produces a valid metrics report", async () => {
    const [a, b] = [await runSimulation(SMALL, NOW), await runSimulation(SMALL, NOW)];
    expect(a.report).toEqual(b.report);
    expect(isMetricsReport(a.report)).toBe(true);
    expect(a.report.costCurve).toHaveLength(60);
    expect(a.report.confusion.matrix.flat().reduce((x, y) => x + y, 0)).toBe(60);
    expect(toCsv(a.rows).split("\n")[0]).toContain("banditQueries");
  });

  it("invariants: anchored verification is never fooled; query-all flags every attacker", async () => {
    const { report } = await runSimulation(SMALL, NOW);
    expect(report.bandit.fooledRate).toBe(0);
    expect(report.baseline.fooledRate).toBe(0);
    expect(report.baseline.detectionRate).toBe(1);
    expect(report.bandit.queries).toBeLessThan(report.baseline.queries);
  });
});
