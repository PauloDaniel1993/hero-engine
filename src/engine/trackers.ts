/**
 * Pure tracker/resource math: clamping, stepped adjustments, and threshold
 * ladder evaluation. The Foundry-facing state layer calls into this.
 */
import type { ThresholdDef } from "../api/types";

export interface Bounds {
  min: number;
  max: number;
}

export function clampValue(value: number, bounds: Bounds): number {
  return Math.min(Math.max(value, bounds.min), bounds.max);
}

/** Apply a delta with clamping; returns the value actually stored. */
export function applyDelta(current: number, delta: number, bounds: Bounds): number {
  return clampValue(current + delta, bounds);
}

/** Thresholds active at a given value (value >= at). */
export function activeThresholds(value: number, thresholds: ThresholdDef[] = []): ThresholdDef[] {
  return thresholds.filter((t) => value >= t.at);
}

export interface ThresholdCrossing {
  activated: ThresholdDef[];
  deactivated: ThresholdDef[];
}

/** Which thresholds newly activated/deactivated moving from prev to next. */
export function thresholdsCrossed(
  prev: number,
  next: number,
  thresholds: ThresholdDef[] = []
): ThresholdCrossing {
  const activated: ThresholdDef[] = [];
  const deactivated: ThresholdDef[] = [];
  for (const t of thresholds) {
    const was = prev >= t.at;
    const is = next >= t.at;
    if (!was && is) activated.push(t);
    else if (was && !is) deactivated.push(t);
  }
  activated.sort((a, b) => a.at - b.at);
  deactivated.sort((a, b) => b.at - a.at);
  return { activated, deactivated };
}
