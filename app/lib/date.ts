/**
 * T8 — Centralized UTC date module.
 *
 * The league runs on a single global daily deck that rolls over at 00:00 UTC.
 * EVERY "what day is it" decision in the app must go through this module so the
 * rollover behavior is consistent and testable. Never call `new Date()` for
 * deck-date logic elsewhere.
 *
 * A "deck date" is a calendar day in UTC, formatted as `YYYY-MM-DD`.
 */

import { formatInTimeZone } from "date-fns-tz";
import { addDays, parseISO } from "date-fns";

export type DeckDate = string; // `YYYY-MM-DD` in UTC

const DECK_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Returns the current UTC deck date (`YYYY-MM-DD`). */
export function currentUtcDeckDate(now: Date = new Date()): DeckDate {
  return formatInTimeZone(now, "UTC", "yyyy-MM-dd");
}

/** Formats any Date as a UTC deck date. */
export function toDeckDate(date: Date): DeckDate {
  return formatInTimeZone(date, "UTC", "yyyy-MM-dd");
}

/** True if `value` is a well-formed `YYYY-MM-DD` deck date. */
export function isDeckDate(value: string): value is DeckDate {
  if (!DECK_DATE_RE.test(value)) return false;
  // Reject impossible dates like 2026-13-40.
  const parsed = parseISO(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && toDeckDate(parsed) === value;
}

/** Returns the deck date `n` days after `date` (n may be negative). */
export function addDeckDays(date: DeckDate, n: number): DeckDate {
  return toDeckDate(addDays(parseISO(`${date}T00:00:00Z`), n));
}

/** Returns the deck date `n` days from today in UTC. */
export function deckDateFromToday(n: number, now: Date = new Date()): DeckDate {
  return addDeckDays(currentUtcDeckDate(now), n);
}

/**
 * Returns an inclusive list of deck dates from `start` to `end`.
 * Used by the leaderboard's weekly aggregate and the admin buffer view.
 */
export function deckDateRange(start: DeckDate, end: DeckDate): DeckDate[] {
  const out: DeckDate[] = [];
  let cursor = start;
  // Guard against an inverted range producing an infinite loop.
  for (let i = 0; i <= 366 && cursor <= end; i++) {
    out.push(cursor);
    cursor = addDeckDays(cursor, 1);
  }
  return out;
}

/** The 7-day window ending on `end` (inclusive) — the weekly leaderboard window. */
export function weeklyWindow(end: DeckDate): DeckDate[] {
  return deckDateRange(addDeckDays(end, -6), end);
}
