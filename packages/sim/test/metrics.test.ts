import { describe, expect, it } from "vitest";
import { isMetricsReport } from "../src/index.ts";

// Shape-only fixture for the validator (not results: no number here is presented as a measurement).
const stats = { verifications: 2, queries: 4, costUnits: 4, detectionRate: 1, falsePositiveRate: 0 };
const shape = {
  v: 1, generatedAt: "2026-11-13T00:00:00Z", seed: 1, scenarios: 2, bandit: stats, baseline: stats,
  costCurve: [{ scenario: 1, bandit: 2, baseline: 2 }],
  confusion: { labels: ["tamper", "replay"], matrix: [[1, 0], [0, 1]], classifier: "rules" },
};

describe("isMetricsReport", () => {
  it("accepts a well-formed report", () => expect(isMetricsReport(shape)).toBe(true));
  it.each([
    ["wrong version", { ...shape, v: 2 }],
    ["rate above 1", { ...shape, bandit: { ...stats, detectionRate: 1.2 } }],
    ["non-square matrix", { ...shape, confusion: { ...shape.confusion, matrix: [[1, 0]] } }],
    ["negative curve value", { ...shape, costCurve: [{ scenario: 1, bandit: -1, baseline: 2 }] }],
  ])("rejects %s", (_n, v) => expect(isMetricsReport(v)).toBe(false));
});
