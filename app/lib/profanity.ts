/**
 * T3 — Profanity filter for team display names.
 *
 * Per decision D2, v1's only abuse defense is a profanity filter on the team
 * display name (the one user-supplied string that appears publicly, on the
 * leaderboard and OG card). Score integrity is trusted to the workplace context.
 *
 * The `Filter` instance is created once and reused.
 */

import { Filter } from "bad-words";

const filter = new Filter();

/** True if `text` contains profanity. */
export function containsProfanity(text: string): boolean {
  if (!text.trim()) return false;
  return filter.isProfane(text);
}

export const DISPLAY_NAME_MIN = 2;
export const DISPLAY_NAME_MAX = 30; // keeps it from overflowing the OG card

export type DisplayNameError =
  | "too_short"
  | "too_long"
  | "profane"
  | "empty";

/**
 * Validates a proposed team display name. Returns null if valid, or an error
 * code the route can map to a user-facing message.
 */
export function validateDisplayName(raw: string): DisplayNameError | null {
  const name = raw.trim();
  if (name.length === 0) return "empty";
  if (name.length < DISPLAY_NAME_MIN) return "too_short";
  if (name.length > DISPLAY_NAME_MAX) return "too_long";
  if (containsProfanity(name)) return "profane";
  return null;
}

export const DISPLAY_NAME_ERROR_MESSAGES: Record<DisplayNameError, string> = {
  empty: "Please enter a team name.",
  too_short: `Team name must be at least ${DISPLAY_NAME_MIN} characters.`,
  too_long: `Team name must be ${DISPLAY_NAME_MAX} characters or fewer.`,
  profane: "Please choose a different team name.",
};
