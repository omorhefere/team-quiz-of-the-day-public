/**
 * T10 — Pre-deploy content smoke test.
 *
 * The daily ritual breaks if `/play` has no valid deck, so this gate runs in
 * CI/CD *before* traffic flips. It fails the deploy (exit 1) when today's deck
 * is missing or malformed, and warns (without failing) when the approved-deck
 * buffer is thinner than the recommended 3 days.
 *
 * Runs against whatever DATABASE_URL points at (the prod DB in CI). Usage:
 *   tsx scripts/smoke-test.ts [YYYY-MM-DD]
 */

import { getDb } from "~/db/client";
import { getPublishedDeck } from "~/db/repository";
import { currentUtcDeckDate, deckDateFromToday, isDeckDate } from "~/lib/date";
import { QUESTIONS_PER_DECK, validateDeckQuestions } from "~/lib/quiz";

const BUFFER_TARGET_DAYS = 3;

async function main() {
  const arg = process.argv[2];
  const today = arg && isDeckDate(arg) ? arg : currentUtcDeckDate();
  const db = await getDb();

  // Hard gate: today's deck must exist and be valid.
  const deck = await getPublishedDeck(db, today);
  if (!deck) {
    console.error(`FAIL: no published deck for today (${today}).`);
    process.exit(1);
  }
  const result = validateDeckQuestions(deck.questions);
  if (!result.ok) {
    console.error(`FAIL: today's deck (${today}) is invalid — ${result.error}`);
    process.exit(1);
  }
  console.log(
    `OK: today's deck (${today}) has ${QUESTIONS_PER_DECK} valid questions.`,
  );

  // Soft check: how many days of buffer are queued ahead?
  let buffer = 0;
  for (let i = 1; i <= 14; i++) {
    const date = deckDateFromToday(i);
    const ahead = await getPublishedDeck(db, date);
    if (ahead && validateDeckQuestions(ahead.questions).ok) buffer++;
    else break;
  }
  if (buffer < BUFFER_TARGET_DAYS) {
    console.warn(
      `WARN: only ${buffer} day(s) of approved decks queued ahead (target: ${BUFFER_TARGET_DAYS}). Add more soon.`,
    );
  } else {
    console.log(`OK: ${buffer} day(s) of deck buffer queued ahead.`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Smoke test crashed:", err);
  process.exit(1);
});
