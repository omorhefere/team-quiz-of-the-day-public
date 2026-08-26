/**
 * Data-access layer — the ONLY file that talks to the database tables.
 * Routes never write SQL; they call the named functions below. For a plain-
 * English tour of the whole `app/db/` folder, see `app/db/README.md`.
 *
 * How to read this file: it's split into labelled sections (look for the
 * `// ----` banners), in roughly the order a team experiences them:
 *   1. Teams            — create a team (with a unique code) and look one up.
 *   2. Decks            — fetch today's published deck; upsert decks (seeding).
 *   3. Submissions      — score answers server-side, enforce one play per day,
 *                         record a snapshot rank.
 *   4. Leaderboards     — global daily + weekly standings (live rank on read).
 *   5. Private leagues  — create/join leagues and their member-scoped boards.
 *   6. Team stats       — totals, streak, and history for the dashboard.
 *
 * `isUniqueViolation` (just below) turns a database "duplicate key" error into a
 * clean handled outcome — that's how a duplicate submission or a code collision
 * becomes a friendly message instead of a 500.
 */

import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import type { DB } from "./client";
import {
  customQuizSubmissions,
  customQuizzes,
  dailySubmissions,
  decks,
  leagueMemberships,
  leagues,
  sources,
  teams,
  type CustomQuiz,
  type Deck,
  type League,
  type Source,
  type Team,
} from "./schema";
import { generateTeamCode, normalizeTeamCode } from "~/lib/code";
import { scoreAnswers, type ValidQuestion } from "~/lib/quiz";
import { addDeckDays, currentUtcDeckDate, type DeckDate } from "~/lib/date";

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
        sql`(${dailySubmissions.score} > ${score} or (${dailySubmissions.score} = ${score} and ${dailySubmissions.submittedAt} < ${submittedAt.toISOString()}))`,
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

// ---------------------------------------------------------------------------
// Private leagues
// ---------------------------------------------------------------------------

/** Creates a league with a unique join code and adds the creator as a member. */
export async function createLeague(
  db: DB,
  params: { name: string; createdByTeamId: string | null },
): Promise<League> {
  const name = params.name.trim();
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const [league] = await db
        .insert(leagues)
        .values({
          code: generateTeamCode(),
          name,
          createdByTeamId: params.createdByTeamId,
        })
        .returning();
      if (params.createdByTeamId) {
        await joinLeague(db, league.id, params.createdByTeamId);
      }
      return league;
    } catch (err) {
      if (isUniqueViolation(err) && attempt < 4) continue;
      throw err;
    }
  }
  throw new Error("Could not generate a unique league code after 5 attempts");
}

export async function getLeagueByCode(
  db: DB,
  code: string,
): Promise<League | null> {
  const [league] = await db
    .select()
    .from(leagues)
    .where(eq(leagues.code, normalizeTeamCode(code)))
    .limit(1);
  return league ?? null;
}

export async function getLeagueById(
  db: DB,
  id: string,
): Promise<League | null> {
  const [league] = await db
    .select()
    .from(leagues)
    .where(eq(leagues.id, id))
    .limit(1);
  return league ?? null;
}

/** Adds a team to a league. Idempotent — re-joining is a no-op. */
export async function joinLeague(
  db: DB,
  leagueId: string,
  teamId: string,
): Promise<void> {
  await db
    .insert(leagueMemberships)
    .values({ leagueId, teamId })
    .onConflictDoNothing();
}

export async function isLeagueMember(
  db: DB,
  leagueId: string,
  teamId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: leagueMemberships.id })
    .from(leagueMemberships)
    .where(
      and(
        eq(leagueMemberships.leagueId, leagueId),
        eq(leagueMemberships.teamId, teamId),
      ),
    )
    .limit(1);
  return !!row;
}

/** Leagues a team belongs to, each with its current member count. */
export async function getLeaguesForTeam(
  db: DB,
  teamId: string,
): Promise<{ league: League; memberCount: number }[]> {
  const memberships = await db
    .select()
    .from(leagueMemberships)
    .innerJoin(leagues, eq(leagues.id, leagueMemberships.leagueId))
    .where(eq(leagueMemberships.teamId, teamId))
    .orderBy(asc(leagues.name));

  const result: { league: League; memberCount: number }[] = [];
  for (const m of memberships) {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(leagueMemberships)
      .where(eq(leagueMemberships.leagueId, m.league.id));
    result.push({ league: m.league, memberCount: Number(count) });
  }
  return result;
}

/** Daily leaderboard scoped to a league's members. Same ordering rule as global. */
export async function getLeagueDailyLeaderboard(
  db: DB,
  leagueId: string,
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
    .innerJoin(
      leagueMemberships,
      and(
        eq(leagueMemberships.teamId, dailySubmissions.teamId),
        eq(leagueMemberships.leagueId, leagueId),
      ),
    )
    .innerJoin(teams, eq(teams.id, dailySubmissions.teamId))
    .where(eq(dailySubmissions.deckDate, deckDate))
    .orderBy(desc(dailySubmissions.score), asc(dailySubmissions.submittedAt))
    .limit(limit);

  return rows.map((r, i) => ({ rank: i + 1, ...r }));
}

/** Weekly aggregate scoped to a league's members. */
export async function getLeagueWeeklyLeaderboard(
  db: DB,
  leagueId: string,
  window: DeckDate[],
  limit = 100,
): Promise<
  { rank: number; teamId: string; displayName: string; total: number; daysPlayed: number }[]
> {
  if (window.length === 0) return [];
  const start = window[0];
  const end = window[window.length - 1];

  const rows = await db
    .select({
      teamId: dailySubmissions.teamId,
      displayName: teams.displayName,
      total: sql<number>`sum(${dailySubmissions.score})::int`,
      daysPlayed: sql<number>`count(*)::int`,
    })
    .from(dailySubmissions)
    .innerJoin(
      leagueMemberships,
      and(
        eq(leagueMemberships.teamId, dailySubmissions.teamId),
        eq(leagueMemberships.leagueId, leagueId),
      ),
    )
    .innerJoin(teams, eq(teams.id, dailySubmissions.teamId))
    .where(
      and(
        gte(dailySubmissions.deckDate, start),
        lte(dailySubmissions.deckDate, end),
      ),
    )
    .groupBy(dailySubmissions.teamId, teams.displayName)
    .orderBy(
      desc(sql`sum(${dailySubmissions.score})`),
      asc(sql`max(${dailySubmissions.submittedAt})`),
    )
    .limit(limit);

  return rows.map((r, i) => ({
    rank: i + 1,
    teamId: r.teamId,
    displayName: r.displayName,
    total: Number(r.total),
    daysPlayed: Number(r.daysPlayed),
  }));
}

// ---------------------------------------------------------------------------
// Team stats & history (for the team dashboard)
// ---------------------------------------------------------------------------

export interface TeamStats {
  totalPoints: number;
  daysPlayed: number;
  bestScore: number;
  /** Consecutive UTC days played, counting back from today or yesterday. */
  currentStreak: number;
}

export async function getTeamStats(db: DB, teamId: string): Promise<TeamStats> {
  const [agg] = await db
    .select({
      totalPoints: sql<number>`coalesce(sum(${dailySubmissions.score}), 0)::int`,
      daysPlayed: sql<number>`count(*)::int`,
      bestScore: sql<number>`coalesce(max(${dailySubmissions.score}), 0)::int`,
    })
    .from(dailySubmissions)
    .where(eq(dailySubmissions.teamId, teamId));

  // Streak: pull the played dates and count consecutive days from today/yesterday.
  const playedRows = await db
    .select({ deckDate: dailySubmissions.deckDate })
    .from(dailySubmissions)
    .where(eq(dailySubmissions.teamId, teamId))
    .orderBy(desc(dailySubmissions.deckDate));

  const played = new Set(playedRows.map((r) => r.deckDate));
  const today = currentUtcDeckDate();
  const yesterday = addDeckDays(today, -1);
  let cursor = played.has(today) ? today : played.has(yesterday) ? yesterday : null;
  let currentStreak = 0;
  while (cursor && played.has(cursor)) {
    currentStreak++;
    cursor = addDeckDays(cursor, -1);
  }

  return {
    totalPoints: Number(agg.totalPoints),
    daysPlayed: Number(agg.daysPlayed),
    bestScore: Number(agg.bestScore),
    currentStreak,
  };
}

/** Recent daily results for a team, newest first. */
export async function getTeamHistory(
  db: DB,
  teamId: string,
  limit = 14,
): Promise<{ deckDate: DeckDate; score: number }[]> {
  const rows = await db
    .select({
      deckDate: dailySubmissions.deckDate,
      score: dailySubmissions.score,
    })
    .from(dailySubmissions)
    .where(eq(dailySubmissions.teamId, teamId))
    .orderBy(desc(dailySubmissions.deckDate))
    .limit(limit);
  return rows.map((r) => ({ deckDate: r.deckDate, score: r.score }));
}

// ---------------------------------------------------------------------------
// Custom quizzes (league-owned)
// ---------------------------------------------------------------------------

/** v1 "light admin": the league's creator is its admin. */
export function isLeagueAdmin(league: League, teamId: string | null): boolean {
  return !!teamId && league.createdByTeamId === teamId;
}

/** Whether a league is on the paid tier (gates AI generation later). */
export function isLeaguePro(league: League): boolean {
  return league.plan === "pro";
}

export async function renameLeague(
  db: DB,
  leagueId: string,
  name: string,
): Promise<void> {
  await db
    .update(leagues)
    .set({ name: name.trim() })
    .where(eq(leagues.id, leagueId));
}

/** Permanently deletes a league and all its data (cascade handles children). */
export async function deleteLeague(db: DB, leagueId: string): Promise<void> {
  await db.delete(leagues).where(eq(leagues.id, leagueId));
}

/** Removes a single team from a league (used by admin to kick, or by member to leave). */
export async function removeTeamFromLeague(
  db: DB,
  leagueId: string,
  teamId: string,
): Promise<void> {
  await db
    .delete(leagueMemberships)
    .where(
      and(
        eq(leagueMemberships.leagueId, leagueId),
        eq(leagueMemberships.teamId, teamId),
      ),
    );
}

/**
 * All members of a league with their display name, team code, and join date.
 *
 * The team code is a bearer credential (entering it signs you in as that
 * team), so this is only ever surfaced to a league admin.
 */
export async function getLeagueMembers(
  db: DB,
  leagueId: string,
): Promise<
  { teamId: string; displayName: string; code: string; joinedAt: Date }[]
> {
  const rows = await db
    .select({
      teamId: leagueMemberships.teamId,
      displayName: teams.displayName,
      code: teams.code,
      joinedAt: leagueMemberships.joinedAt,
    })
    .from(leagueMemberships)
    .innerJoin(teams, eq(teams.id, leagueMemberships.teamId))
    .where(eq(leagueMemberships.leagueId, leagueId))
    .orderBy(asc(leagueMemberships.joinedAt));
  return rows;
}

/** Test/admin helper to flip a league's plan (real billing wires in later). */
export async function setLeaguePlan(
  db: DB,
  leagueId: string,
  plan: "free" | "pro",
): Promise<void> {
  await db.update(leagues).set({ plan }).where(eq(leagues.id, leagueId));
}

export async function createCustomQuiz(
  db: DB,
  params: { leagueId: string; title: string; questions: ValidQuestion[]; topic?: string },
): Promise<CustomQuiz> {
  const [quiz] = await db
    .insert(customQuizzes)
    .values({
      leagueId: params.leagueId,
      title: params.title.trim(),
      questions: params.questions,
      topic: params.topic ?? null,
    })
    .returning();
  return quiz;
}

export async function updateCustomQuiz(
  db: DB,
  quizId: string,
  params: { title: string; questions: ValidQuestion[]; topic?: string | null },
): Promise<void> {
  await db
    .update(customQuizzes)
    .set({
      title: params.title.trim(),
      questions: params.questions,
      ...(params.topic !== undefined ? { topic: params.topic } : {}),
      updatedAt: new Date(),
    })
    .where(eq(customQuizzes.id, quizId));
}

export async function getCustomQuiz(
  db: DB,
  quizId: string,
): Promise<CustomQuiz | null> {
  const [quiz] = await db
    .select()
    .from(customQuizzes)
    .where(eq(customQuizzes.id, quizId))
    .limit(1);
  return quiz ?? null;
}

export async function listCustomQuizzes(
  db: DB,
  leagueId: string,
): Promise<CustomQuiz[]> {
  return db
    .select()
    .from(customQuizzes)
    .where(eq(customQuizzes.leagueId, leagueId))
    .orderBy(asc(customQuizzes.scheduledDate), desc(customQuizzes.createdAt));
}

export async function setCustomQuizSchedule(
  db: DB,
  quizId: string,
  scheduledDate: string | null,
): Promise<void> {
  await db
    .update(customQuizzes)
    .set({ scheduledDate, updatedAt: new Date() })
    .where(eq(customQuizzes.id, quizId));
}

export async function deleteCustomQuiz(db: DB, quizId: string): Promise<void> {
  // Clear it as any league's active quiz first, then delete.
  await db
    .update(leagues)
    .set({ activeCustomQuizId: null })
    .where(eq(leagues.activeCustomQuizId, quizId));
  await db.delete(customQuizzes).where(eq(customQuizzes.id, quizId));
}

/** Sets (or clears, with null) the league's "quiz of the day". */
export async function setActiveCustomQuiz(
  db: DB,
  leagueId: string,
  quizId: string | null,
): Promise<void> {
  await db
    .update(leagues)
    .set({ activeCustomQuizId: quizId })
    .where(eq(leagues.id, leagueId));
}

export async function getActiveCustomQuiz(
  db: DB,
  league: League,
): Promise<CustomQuiz | null> {
  if (!league.activeCustomQuizId) return null;
  return getCustomQuiz(db, league.activeCustomQuizId);
}

export async function getCustomQuizSubmission(
  db: DB,
  quizId: string,
  teamId: string,
) {
  const [row] = await db
    .select()
    .from(customQuizSubmissions)
    .where(
      and(
        eq(customQuizSubmissions.customQuizId, quizId),
        eq(customQuizSubmissions.teamId, teamId),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * Scores and records a one-shot custom-quiz play. Mirrors `submitAnswers`:
 * server-side scoring, one play per team per quiz (unique index →
 * AlreadySubmittedError), snapshot rank.
 */
export async function submitCustomQuizAnswers(
  db: DB,
  params: { quiz: CustomQuiz; teamId: string; answers: number[] },
): Promise<{ score: number; rank: number }> {
  const questions = params.quiz.questions as ValidQuestion[];
  const score = scoreAnswers(questions, params.answers);

  let inserted;
  try {
    [inserted] = await db
      .insert(customQuizSubmissions)
      .values({
        customQuizId: params.quiz.id,
        teamId: params.teamId,
        answers: params.answers,
        score,
      })
      .returning();
  } catch (err) {
    if (isUniqueViolation(err)) throw new AlreadySubmittedError();
    throw err;
  }

  const [{ ahead }] = await db
    .select({ ahead: sql<number>`count(*)::int` })
    .from(customQuizSubmissions)
    .where(
      and(
        eq(customQuizSubmissions.customQuizId, params.quiz.id),
        sql`(${customQuizSubmissions.score} > ${score} or (${customQuizSubmissions.score} = ${score} and ${customQuizSubmissions.submittedAt} < ${inserted.submittedAt.toISOString()}))`,
      ),
    );
  const rank = Number(ahead) + 1;
  await db
    .update(customQuizSubmissions)
    .set({ rankSnapshot: rank })
    .where(eq(customQuizSubmissions.id, inserted.id));

  return { score, rank };
}

export async function getCustomQuizLeaderboard(
  db: DB,
  quizId: string,
  limit = 100,
): Promise<LeaderboardRow[]> {
  const rows = await db
    .select({
      teamId: customQuizSubmissions.teamId,
      displayName: teams.displayName,
      score: customQuizSubmissions.score,
      submittedAt: customQuizSubmissions.submittedAt,
    })
    .from(customQuizSubmissions)
    .innerJoin(teams, eq(teams.id, customQuizSubmissions.teamId))
    .where(eq(customQuizSubmissions.customQuizId, quizId))
    .orderBy(desc(customQuizSubmissions.score), asc(customQuizSubmissions.submittedAt))
    .limit(limit);
  return rows.map((r, i) => ({ rank: i + 1, ...r }));
}

// ---------------------------------------------------------------------------
// Sources (ingested documents a league generates quizzes from)
// ---------------------------------------------------------------------------

export async function createSource(
  db: DB,
  params: {
    leagueId: string;
    kind: "url" | "pdf";
    label: string;
    text: string;
    summary?: string;
    status?: "ready" | "error";
    error?: string | null;
  },
): Promise<Source> {
  const [source] = await db
    .insert(sources)
    .values({
      leagueId: params.leagueId,
      kind: params.kind,
      label: params.label,
      text: params.text,
      summary: params.summary ?? null,
      status: params.status ?? "ready",
      error: params.error ?? null,
    })
    .returning();
  return source;
}

export async function listSources(db: DB, leagueId: string) {
  return db
    .select({
      id: sources.id,
      kind: sources.kind,
      label: sources.label,
      status: sources.status,
      error: sources.error,
      summary: sources.summary,
      createdAt: sources.createdAt,
      chars: sql<number>`length(${sources.text})`,
      preview: sql<string>`substr(${sources.text}, 1, 240)`,
    })
    .from(sources)
    .where(eq(sources.leagueId, leagueId))
    .orderBy(desc(sources.createdAt));
}

/**
 * Ready sources only — what quiz generation will feed to the model. A source
 * that errored during ingestion is excluded so it can't poison generation.
 */
export async function getReadySources(
  db: DB,
  leagueId: string,
): Promise<Source[]> {
  return db
    .select()
    .from(sources)
    .where(and(eq(sources.leagueId, leagueId), eq(sources.status, "ready")))
    .orderBy(desc(sources.createdAt));
}

export async function getSource(db: DB, sourceId: string, leagueId: string) {
  const rows = await db
    .select()
    .from(sources)
    .where(and(eq(sources.id, sourceId), eq(sources.leagueId, leagueId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function deleteSource(
  db: DB,
  leagueId: string,
  sourceId: string,
): Promise<void> {
  await db
    .delete(sources)
    .where(and(eq(sources.id, sourceId), eq(sources.leagueId, leagueId)));
}

// Re-export so route modules import a single barrel.
export { inArray };
