/**
 * Virtual-clock helpers for the simulation. Every write (setup) and every event
 * runs on ONE virtual timeline anchored at day 0, so budget periods, opening
 * balance and events all fall in the same virtual month — never split between the
 * real "now" and a virtual date.
 *
 * Anchor: fixed, in the recent past (before the real "today") so any real-now
 * guard still passes, at UTC-noon so the user's local date never rolls across a
 * day boundary (the harness pins the user's timezone to UTC).
 */
import { withSimClock } from "@/lib/time/clock";

export const VIRTUAL_DAY_ZERO = new Date("2026-01-15T12:00:00.000Z");

const MS_PER_DAY = 86_400_000;

/** The virtual `Date` `offsetDays` after day 0 (UTC-noon preserved). */
export function virtualDay(offsetDays: number): Date {
  return new Date(VIRTUAL_DAY_ZERO.getTime() + offsetDays * MS_PER_DAY);
}

/** YYYY-MM-DD of a virtual day (UTC) — matches `userToday` under a UTC timezone. */
export function virtualISO(offsetDays: number): string {
  return virtualDay(offsetDays).toISOString().slice(0, 10);
}

/** Run `fn` with the virtual clock pinned to `offsetDays` after day 0. */
export function onDay<T>(offsetDays: number, fn: () => Promise<T>): Promise<T> {
  return withSimClock(virtualDay(offsetDays), fn);
}
