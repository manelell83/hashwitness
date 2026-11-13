import { describe, expect, it } from "vitest";
import { niceTicks } from "./CostCurveChart.tsx";

describe("niceTicks", () => {
  it.each([
    [0, [0]],
    [10, [0, 5, 10]],
    [87, [0, 50, 100]],
    [600, [0, 200, 400, 600]],
    [1234, [0, 500, 1000, 1500]],
  ])("max %d → %j", (max, ticks) => expect(niceTicks(max)).toEqual(ticks));

  it("always covers the maximum", () => {
    for (const max of [1, 3, 7, 19, 333, 4099]) expect(niceTicks(max).at(-1)!).toBeGreaterThanOrEqual(max);
  });
});
