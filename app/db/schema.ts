/**
 * T2 — Drizzle schema for the Office Trivia League.
 *
 * Three tables, matching the data model in the approved design doc:
 *   team             — a playing team, identified by a shareable code
 *   deck             — one global trivia deck per UTC day
 *   daily_submission — a team's scored answers for a given day (one per day)
 *
 * v1 is fully anonymous (decision D1'): no email, no magic-link, no Slack.
 */

import {
  date,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { v7 as uuidv7 } from "uuid";

/**
 * A single multiple-choice question. Stored inside `deck.questions` as JSONB.
 * The "exactly 4 choices / correct_idx in range" invariant is enforced at write
 * time by the Zod schema in `~/lib/quiz`, not by this storage type.
 */
export interface Question {
  /** The question prompt. */
  q: string;
  /** The answer choices (exactly 4, validated on write). */
  choices: string[];
  /** Index (0–3) of the correct choice. */
  correct_idx: number;
}

export const teams = pgTable("team", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),
  /** Public, shareable code e.g. "BLUE-FOX-71". Stored uppercase, unique. */
  code: text("code").notNull().unique(),
  /** Human-friendly team name shown on the leaderboard and OG card. */
  displayName: text("display_name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const decks = pgTable("deck", {
  /** One row per global UTC day. The natural key. */
  deckDate: date("deck_date").primaryKey(),
  /** Array of exactly 10 questions. Shape validated at write time (Zod). */
  questions: jsonb("questions").$type<Question[]>().notNull(),
  curatorNotes: text("curator_notes"),
  /** When the deck went live. Null = staged but not yet published. */
  publishedAt: timestamp("published_at", { withTimezone: true }),
});

export const dailySubmissions = pgTable(
  "daily_submission",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    deckDate: date("deck_date")
      .notNull()
      .references(() => decks.deckDate, { onDelete: "cascade" }),
    /** Chosen answer index per question (length 10). */
    answers: jsonb("answers").$type<number[]>().notNull(),
    /** Server-computed score 0–10. */
    score: smallint("score").notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** Rank at the moment of submission — display flavor only. */
    rankSnapshot: integer("rank_snapshot"),
  },
  (table) => [
    // One submission per team per day. No replays (design: score locked on submit).
    uniqueIndex("daily_submission_team_date_uq").on(
      table.teamId,
      table.deckDate,
    ),
    // T6 — drives the leaderboard query: order by (score desc, submitted_at asc).
    index("daily_submission_leaderboard_idx").on(
      table.deckDate,
      table.score,
      table.submittedAt,
    ),
  ],
);

/**
 * A private league: a named group of teams with its own join code and a
 * leaderboard scoped to its members. Teams can belong to many leagues.
 */
export const leagues = pgTable("league", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),
  /** Shareable join code e.g. "JADE-LYNX-08". Stored uppercase, unique. */
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  /**
   * The team that created the league. Also the league's admin in v1 (the "light
   * admin" — the only team that can manage custom quizzes).
   */
  createdByTeamId: uuid("created_by_team_id").references(() => teams.id, {
    onDelete: "set null",
  }),
  /** Entitlement tier. "pro" unlocks AI quiz generation (billing wired later). */
  plan: text("plan").notNull().default("free"),
  /**
   * The admin's chosen "quiz of the day" — the custom quiz members currently
   * play. Plain pointer (no FK) to avoid a circular league<->quiz constraint;
   * the app keeps it consistent.
   */
  activeCustomQuizId: uuid("active_custom_quiz_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const leagueMemberships = pgTable(
  "league_membership",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    leagueId: uuid("league_id")
      .notNull()
      .references(() => leagues.id, { onDelete: "cascade" }),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // A team is in a league at most once.
    uniqueIndex("league_membership_uq").on(table.leagueId, table.teamId),
    // Look up "which leagues is this team in".
    index("league_membership_team_idx").on(table.teamId),
  ],
);

/**
 * A custom quiz owned by a league — built by hand (this PR) or AI-generated from
 * the company's documents (later). Reuses the `Question` shape; allows a variable
 * number of questions (the global daily deck is fixed at 10, custom quizzes are
 * 1–20).
 */
export const customQuizzes = pgTable("custom_quiz", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),
  leagueId: uuid("league_id")
    .notNull()
    .references(() => leagues.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  questions: jsonb("questions").$type<Question[]>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** A team's one-shot play of a custom quiz (one per team per quiz). */
export const customQuizSubmissions = pgTable(
  "custom_quiz_submission",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    customQuizId: uuid("custom_quiz_id")
      .notNull()
      .references(() => customQuizzes.id, { onDelete: "cascade" }),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    answers: jsonb("answers").$type<number[]>().notNull(),
    score: smallint("score").notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    rankSnapshot: integer("rank_snapshot"),
  },
  (table) => [
    // One play per team per custom quiz.
    uniqueIndex("custom_quiz_submission_uq").on(
      table.customQuizId,
      table.teamId,
    ),
    // Drives the per-quiz leaderboard: order by (quiz, score, submitted_at).
    index("custom_quiz_submission_leaderboard_idx").on(
      table.customQuizId,
      table.score,
      table.submittedAt,
    ),
  ],
);

export type Team = typeof teams.$inferSelect;
export type NewTeam = typeof teams.$inferInsert;
export type Deck = typeof decks.$inferSelect;
export type NewDeck = typeof decks.$inferInsert;
export type DailySubmission = typeof dailySubmissions.$inferSelect;
export type NewDailySubmission = typeof dailySubmissions.$inferInsert;
export type League = typeof leagues.$inferSelect;
export type NewLeague = typeof leagues.$inferInsert;
export type LeagueMembership = typeof leagueMemberships.$inferSelect;
export type CustomQuiz = typeof customQuizzes.$inferSelect;
export type NewCustomQuiz = typeof customQuizzes.$inferInsert;
export type CustomQuizSubmission = typeof customQuizSubmissions.$inferSelect;

export const schema = {
  teams,
  decks,
  dailySubmissions,
  leagues,
  leagueMemberships,
  customQuizzes,
  customQuizSubmissions,
};
