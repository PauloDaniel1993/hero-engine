/**
 * Pure world-time math for recharges and cooldowns. Foundry's game.time.worldTime
 * is a number of seconds; the engine stores timestamps in instance state and
 * asks these functions what fired between two observations.
 */

export const SECONDS_PER_HOUR = 3600;
export const SECONDS_PER_DAY = 24 * SECONDS_PER_HOUR;

/** Seconds-of-day for a world timestamp. */
export function timeOfDay(worldSeconds: number): number {
  return ((worldSeconds % SECONDS_PER_DAY) + SECONDS_PER_DAY) % SECONDS_PER_DAY;
}

/**
 * Did world time cross the dawn hour moving from prev to next?
 * Handles multi-day jumps (any full day always contains a dawn).
 */
export function dawnCrossed(prevSeconds: number, nextSeconds: number, dawnHour: number): boolean {
  if (nextSeconds <= prevSeconds) return false;
  const dawnOffset = dawnHour * SECONDS_PER_HOUR;
  // Index of the last dawn at-or-before a timestamp:
  const dawnsBefore = (t: number) => Math.floor((t - dawnOffset) / SECONDS_PER_DAY);
  return dawnsBefore(nextSeconds) > dawnsBefore(prevSeconds);
}

/** Is an interval cooldown (in hours) elapsed? `lastUsed` null = never used = ready. */
export function intervalReady(lastUsedSeconds: number | null, nowSeconds: number, hours: number): boolean {
  if (lastUsedSeconds === null) return true;
  return nowSeconds - lastUsedSeconds >= hours * SECONDS_PER_HOUR;
}

/** Seconds remaining on an interval cooldown (0 when ready). */
export function intervalRemaining(
  lastUsedSeconds: number | null,
  nowSeconds: number,
  hours: number
): number {
  if (lastUsedSeconds === null) return 0;
  return Math.max(0, lastUsedSeconds + hours * SECONDS_PER_HOUR - nowSeconds);
}

/** Human-ish formatting for a remaining duration, e.g. "2d 5h" / "45m". */
export function formatRemaining(seconds: number): string {
  if (seconds <= 0) return "0";
  const days = Math.floor(seconds / SECONDS_PER_DAY);
  const hours = Math.floor((seconds % SECONDS_PER_DAY) / SECONDS_PER_HOUR);
  const minutes = Math.ceil((seconds % SECONDS_PER_HOUR) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}
