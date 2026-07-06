import { describe, expect, it } from "vitest";
import {
  dawnCrossed,
  formatRemaining,
  intervalReady,
  intervalRemaining,
  SECONDS_PER_DAY,
  SECONDS_PER_HOUR,
  timeOfDay,
} from "../src/engine/recharge-math";

const DAWN = 6;
const h = (n: number) => n * SECONDS_PER_HOUR;
const d = (n: number) => n * SECONDS_PER_DAY;

describe("dawnCrossed", () => {
  it("fires when crossing 06:00 within a day", () => {
    expect(dawnCrossed(h(5), h(7), DAWN)).toBe(true);
    expect(dawnCrossed(h(7), h(9), DAWN)).toBe(false);
  });
  it("fires when crossing midnight into dawn", () => {
    expect(dawnCrossed(h(23), d(1) + h(6), DAWN)).toBe(true);
    expect(dawnCrossed(h(23), d(1) + h(5), DAWN)).toBe(false);
  });
  it("fires on multi-day jumps", () => {
    expect(dawnCrossed(h(7), h(7) + d(3), DAWN)).toBe(true);
  });
  it("does not fire on zero or backwards movement", () => {
    expect(dawnCrossed(h(7), h(7), DAWN)).toBe(false);
    expect(dawnCrossed(h(7), h(5), DAWN)).toBe(false);
  });
  it("fires exactly at the dawn second", () => {
    expect(dawnCrossed(h(6) - 1, h(6), DAWN)).toBe(true);
  });
});

describe("interval cooldowns", () => {
  it("7-day cooldown becomes ready exactly at the boundary", () => {
    const last = d(10);
    expect(intervalReady(last, last + d(7) - 1, 24 * 7)).toBe(false);
    expect(intervalReady(last, last + d(7), 24 * 7)).toBe(true);
  });
  it("never-used is ready", () => {
    expect(intervalReady(null, d(100), 24)).toBe(true);
    expect(intervalRemaining(null, d(100), 24)).toBe(0);
  });
  it("remaining counts down", () => {
    expect(intervalRemaining(d(1), d(1) + h(20), 24)).toBe(h(4));
  });
});

describe("helpers", () => {
  it("timeOfDay wraps", () => {
    expect(timeOfDay(d(3) + h(6))).toBe(h(6));
  });
  it("formatRemaining", () => {
    expect(formatRemaining(0)).toBe("0");
    expect(formatRemaining(d(2) + h(5))).toBe("2d 5h");
    expect(formatRemaining(h(1) + 120)).toBe("1h 2m");
    expect(formatRemaining(90)).toBe("2m");
  });
});
