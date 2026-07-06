import { describe, expect, it } from "vitest";
import { activeThresholds, applyDelta, clampValue, thresholdsCrossed } from "../src/engine/trackers";

const bounds = { min: 0, max: 12 };

describe("clamping", () => {
  it("clamps to bounds", () => {
    expect(clampValue(15, bounds)).toBe(12);
    expect(clampValue(-3, bounds)).toBe(0);
    expect(clampValue(7, bounds)).toBe(7);
  });
  it("applyDelta discards overflow (11 + 2 -> 12)", () => {
    expect(applyDelta(11, 2, bounds)).toBe(12);
    expect(applyDelta(1, -5, bounds)).toBe(0);
  });
});

const ladder = [
  { at: 3, labelKey: "t3" },
  { at: 5, labelKey: "t5" },
  { at: 7, labelKey: "t7" },
  { at: 10, labelKey: "t10" },
];

describe("thresholds", () => {
  it("reports active thresholds", () => {
    expect(activeThresholds(6, ladder).map((t) => t.labelKey)).toEqual(["t3", "t5"]);
  });
  it("reports newly activated on the way up (4 -> 5)", () => {
    const { activated, deactivated } = thresholdsCrossed(4, 5, ladder);
    expect(activated.map((t) => t.labelKey)).toEqual(["t5"]);
    expect(deactivated).toEqual([]);
  });
  it("reports multiple crossings on a jump (2 -> 8)", () => {
    const { activated } = thresholdsCrossed(2, 8, ladder);
    expect(activated.map((t) => t.labelKey)).toEqual(["t3", "t5", "t7"]);
  });
  it("reports deactivations on the way down (8 -> 4)", () => {
    const { activated, deactivated } = thresholdsCrossed(8, 4, ladder);
    expect(activated).toEqual([]);
    expect(deactivated.map((t) => t.labelKey)).toEqual(["t7", "t5"]);
  });
});
