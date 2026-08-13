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

// ---- Month-window helpers (F2): a virtual calendar of whole months ----
// The library runner walks `months` virtual months, day by day. Month 0 = enero
// 2026. Keep `dayInMonth` ≤ 28 so every day stays within its own month (and its
// own budget period), so `getMonthFlow` for that month captures all its events.

const VIRTUAL_BASE_YEAR = 2026;
const VIRTUAL_BASE_MONTH = 0; // enero (0-based, as Date.UTC expects)

/** The virtual `Date` for day `dayInMonth` (1-based) of virtual month `monthIndex`
 *  (0-based from enero 2026), at UTC-noon so the user's date never rolls. */
export function virtualMonthDay(monthIndex: number, dayInMonth: number): Date {
  return new Date(Date.UTC(VIRTUAL_BASE_YEAR, VIRTUAL_BASE_MONTH + monthIndex, dayInMonth, 12, 0, 0));
}

/** YYYY-MM-DD of a virtual (month, day) in UTC. */
export function virtualMonthDayISO(monthIndex: number, dayInMonth: number): string {
  return virtualMonthDay(monthIndex, dayInMonth).toISOString().slice(0, 10);
}

/** Run `fn` with the virtual clock pinned to (monthIndex, dayInMonth). */
export function onMonthDay<T>(
  monthIndex: number,
  dayInMonth: number,
  fn: () => Promise<T>,
): Promise<T> {
  return withSimClock(virtualMonthDay(monthIndex, dayInMonth), fn);
}
