/**
 * Data-access layer. All SQL lives here; routes call these functions.
 *
 * Covers T4 (team create/lookup), T5 (deck fetch, scored submission),
 * and T6 (daily + weekly leaderboard queries).
 */

import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import type { DB } from "./client";
import {
  dailySubmissions,
  decks,
  teams,
  type Deck,
  type Team,
} from "./schema";
import { generateTeamCode, normalizeTeamCode } from "~/lib/code";
import { scoreAnswers, type ValidQuestion } from "~/lib/quiz";
import type { DeckDate } from "~/lib/date";

// ---------------------------------------------------------------------------
// Teams (T4)
// ---------------------------------------------------------------------------

/**
 * Returns true if an error is a unique-constraint violation (Postgres SQLSTATE
 * 23505). Drizzle wraps the driver error, so the code lives on `err.cause` for
 * PGlite; postgres-js exposes it on the error itself. Check both.
 */
function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string }; message?: string };
  if (e?.code === "23505" || e?.cause?.code === "23505") return true;
  return /unique constraint|duplicate key/i.test(String(e?.message ?? ""));
}

/**
 * Creates a team with a freshly generated, unique code. Retries on the rare
 * code collision (T3 design: generator is pure, uniqueness enforced here).
 */
export async function createTeam(db: DB, displayName: string): Promise<Team> {
  const name = displayName.trim();
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const [team] = await db
        .insert(teams)
        .values({ code: generateTeamCode(), displayName: name })
        .returning();
      return team;
    } catch (err) {
      if (isUniqueViolation(err) && attempt < 4) continue;
      throw err;
    }
  }
  throw new Error("Could not generate a unique team code after 5 attempts");
}

export async function getTeamById(db: DB, id: string): Promise<Team | null> {
  const [team] = await db.select().from(teams).where(eq(teams.id, id)).limit(1);
  return team ?? null;
}

export async function getTeamByCode(
  db: DB,
  code: string,
): Promise<Team | null> {
  const [team] = await db
    .select()
    .from(teams)
    .where(eq(teams.code, normalizeTeamCode(code)))
    .limit(1);
  return team ?? null;
}

// ---------------------------------------------------------------------------
// Decks (T5)
// ---------------------------------------------------------------------------

/** Returns the published deck for a date, or null if none is live yet. */
export async function getPublishedDeck(
  db: DB,
  deckDate: DeckDate,
): Promise<Deck | null> {
  const [deck] = await db
    .select()
    .from(decks)
    .where(and(eq(decks.deckDate, deckDate), sql`${decks.publishedAt} is not null`))
    .limit(1);
  return deck ?? null;
}

/** Upserts a deck (used by the seed loader). Published immediately by default. */
export async function upsertDeck(
  db: DB,
  input: {
    deckDate: DeckDate;
    questions: ValidQuestion[];
    curatorNotes?: string;
    publishedAt?: Date | null;
  },
): Promise<Deck> {
  const publishedAt =
    input.publishedAt === undefined ? new Date() : input.publishedAt;
  const [deck] = await db
    .insert(decks)
    .values({
      deckDate: input.deckDate,
      questions: input.questions,
      curatorNotes: input.curatorNotes,
      publishedAt,
    })
    .onConflictDoUpdate({
      target: decks.deckDate,
      set: {
        questions: input.questions,
        curatorNotes: input.curatorNotes,
        publishedAt,
      },
    })
    .returning();
  return deck;
}

// ---------------------------------------------------------------------------
// Submissions (T5)
// ---------------------------------------------------------------------------

export async function getSubmission(db: DB, teamId: string, deckDate: DeckDate) {
  const [row] = await db
    .select()
    .from(dailySubmissions)
    .where(
      and(
        eq(dailySubmissions.teamId, teamId),
        eq(dailySubmissions.deckDate, deckDate),
      ),
    )
    .limit(1);
  return row ?? null;
}

export class AlreadySubmittedError extends Error {
  constructor() {
    super("This team has already played today.");
    this.name = "AlreadySubmittedError";
  }
}

/**
 * Scores answers server-side and records the submission. Enforces one
 * submission per team per day via the unique index — a duplicate throws
 * AlreadySubmittedError, which routes map to a friendly message (no 500).
 */
export async function submitAnswers(
  db: DB,
  params: { teamId: string; deck: Deck; answers: number[] },
): Promise<{ score: number; rank: number }> {
  const questions = params.deck.questions as ValidQuestion[];
  const score = scoreAnswers(questions, params.answers);

  let inserted;
  try {
    [inserted] = await db
      .insert(dailySubmissions)
      .values({
        teamId: params.teamId,
        deckDate: params.deck.deckDate,
        answers: params.answers,
        score,
      })
      .returning();
  } catch (err) {
    if (isUniqueViolation(err)) throw new AlreadySubmittedError();
    throw err;
  }

  const rank = await rankOf(db, params.deck.deckDate, score, inserted.submittedAt);
  // Persist the rank snapshot (display flavor only).
  await db
    .update(dailySubmissions)
    .set({ rankSnapshot: rank })
    .where(eq(dailySubmissions.id, inserted.id));

  return { score, rank };
}

/**
 * Computes a submission's rank within its day: 1 + the number of submissions
 * that beat it. Ordering rule (LOCKED): higher score wins; ties broken by
 * earlier submitted_at.
 */
async function rankOf(
  db: DB,
  deckDate: DeckDate,
  score: number,
  submittedAt: Date,
): Promise<number> {
  const [{ ahead }] = await db
    .select({ ahead: sql<number>`count(*)::int` })
    .from(dailySubmissions)
    .where(
      and(
        eq(dailySubmissions.deckDate, deckDate),
        sql`(${dailySubmissions.score} > ${score} or (${dailySubmissions.score} = ${score} and ${dailySubmissions.submittedAt} < ${submittedAt}))`,
      ),
    );
  return Number(ahead) + 1;
}

// ---------------------------------------------------------------------------
// Leaderboard (T6)
// ---------------------------------------------------------------------------

export interface LeaderboardRow {
  rank: number;
  teamId: string;
  displayName: string;
  score: number;
  submittedAt: Date;
}

/**
 * Daily leaderboard: every team's submission for the day, ordered by score
 * desc then submitted_at asc (earlier wins ties). Rank recomputed live on read.
 */
export async function getDailyLeaderboard(
  db: DB,
  deckDate: DeckDate,
  limit = 100,
): Promise<LeaderboardRow[]> {
  const rows = await db
    .select({
      teamId: dailySubmissions.teamId,
      displayName: teams.displayName,
      score: dailySubmissions.score,
      submittedAt: dailySubmissions.submittedAt,
    })
    .from(dailySubmissions)
    .innerJoin(teams, eq(teams.id, dailySubmissions.teamId))
    .where(eq(dailySubmissions.deckDate, deckDate))
    .orderBy(desc(dailySubmissions.score), asc(dailySubmissions.submittedAt))
    .limit(limit);

  return rows.map((r, i) => ({ rank: i + 1, ...r }));
}

/**
 * Weekly aggregate (top teams across a 7-day window): total score across the
 * window, ties broken by earliest most-recent submission. v1 scope: top 10.
 */
export async function getWeeklyLeaderboard(
  db: DB,
  window: DeckDate[],
  limit = 10,
): Promise<{ rank: number; teamId: string; displayName: string; total: number; daysPlayed: number }[]> {
  if (window.length === 0) return [];
  const start = window[0];
  const end = window[window.length - 1];

  const rows = await db
    .select({
      teamId: dailySubmissions.teamId,
      displayName: teams.displayName,
      total: sql<number>`sum(${dailySubmissions.score})::int`,
      daysPlayed: sql<number>`count(*)::int`,
      lastSubmittedAt: sql<Date>`max(${dailySubmissions.submittedAt})`,
    })
    .from(dailySubmissions)
    .innerJoin(teams, eq(teams.id, dailySubmissions.teamId))
    .where(
      and(
        gte(dailySubmissions.deckDate, start),
        lte(dailySubmissions.deckDate, end),
      ),
    )
    .groupBy(dailySubmissions.teamId, teams.displayName)
    .orderBy(desc(sql`sum(${dailySubmissions.score})`), asc(sql`max(${dailySubmissions.submittedAt})`))
    .limit(limit);

  return rows.map((r, i) => ({
    rank: i + 1,
    teamId: r.teamId,
    displayName: r.displayName,
    total: Number(r.total),
    daysPlayed: Number(r.daysPlayed),
  }));
}

/** Used by the OG card route: a team's standing for a given day. */
export async function getTeamDailyStanding(
  db: DB,
  teamId: string,
  deckDate: DeckDate,
): Promise<{ team: Team; score: number; rank: number; total: number } | null> {
  const team = await getTeamById(db, teamId);
  if (!team) return null;
  const submission = await getSubmission(db, teamId, deckDate);
  if (!submission) return null;

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(dailySubmissions)
    .where(eq(dailySubmissions.deckDate, deckDate));

  const rank = await rankOf(db, deckDate, submission.score, submission.submittedAt);
  return { team, score: submission.score, rank, total: Number(total) };
}

/** Distinct dates that have at least one submission — used by the smoke test. */
export async function getDeckByDate(db: DB, deckDate: DeckDate): Promise<Deck | null> {
  const [deck] = await db
    .select()
    .from(decks)
    .where(eq(decks.deckDate, deckDate))
    .limit(1);
  return deck ?? null;
}

// Re-export so route modules import a single barrel.
export { inArray };
