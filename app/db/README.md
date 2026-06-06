# The data layer (`app/db/`), in plain English

This folder is everything about **how data is stored and read**. There are only
three source files, and they have clearly separated jobs:

| File | Job | One-liner |
|------|-----|-----------|
| `schema.ts` | **What** the data looks like | Defines the tables and their columns/indexes. |
| `client.ts` | **How** we connect to the database | Opens the connection and runs migrations. |
| `repository.ts` | **Reading and writing** the data | Every database query lives here, as named functions. |

The golden rule: **routes never write SQL.** A route (e.g. `app/routes/play.tsx`)
calls a function like `submitAnswers(...)` from `repository.ts`. The repository is
the only code that touches the tables. This keeps all the database logic in one
place and makes the rest of the app easy to read and test.

---

## 1. The data model — what we actually store

Five tables. Here's what one row of each *means*:

- **`team`** — one playing team. Has a shareable `code` (like `BLUE-FOX-71`) and a
  `display_name`. That's it — v1 is anonymous, so there's no email or password.
- **`deck`** — the quiz for one calendar day (in UTC). The `deck_date` (e.g.
  `2026-06-06`) is the key, and `questions` is a JSON blob of 10 questions. A deck
  is only "live" once `published_at` is set.
- **`daily_submission`** — one team's answers for one day. Stores the chosen
  answers, the computed `score` (0–10), and when they submitted. There's a
  **unique rule**: a team can have at most one submission per deck date. This is
  what makes "one play per team per day" impossible to cheat.
- **`league`** — a private group of teams. Has its own invite `code` and a `name`.
- **`league_membership`** — a link row saying "team X is in league Y." A team can
  be in many leagues; a league has many teams. This is a classic
  many-to-many join table.

How they relate:

```
team ──< daily_submission >── deck        (a team submits once per deck/day)
team ──< league_membership >── league     (teams join many leagues)
```

(`──<` means "one of these has many of those.")

---

## 2. `schema.ts` — the table definitions

This file is the **single source of truth** for the database shape. Each table is
a `pgTable(...)` block listing its columns and types. A few things to notice:

- **IDs** use `ulid()` — a sortable, random, unguessable string ID (nicer than
  auto-increment integers for public-facing things).
- **Indexes** (the performance + safety rules) are declared at the bottom of a
  table:
  - `daily_submission_team_date_uq` — the **unique** "one per team per day" rule.
  - `daily_submission_leaderboard_idx` — makes the leaderboard query fast (it
    sorts by date, then score, then submit time).
  - `league_membership_uq` — a team can't join the same league twice.
- **`questions`** is typed as `Question[]` but stored as JSONB. The "exactly 10
  questions, 4 choices each" rule isn't enforced by the database — it's enforced
  when we *write* a deck, by the Zod validator in `app/lib/quiz.ts`.

When you change this file, you regenerate the SQL migration with
`npm run db:generate`. That writes a file into `drizzle/` describing the change.
You never hand-write SQL migrations.

---

## 3. `client.ts` — connecting to the database

This file answers "which database, and how do I get a handle to it?" The clever
bit is the **driver switch**, controlled by whether `DATABASE_URL` is set:

- **In production** (`DATABASE_URL` is set) → connect to real Postgres.
- **Locally and in tests** (no `DATABASE_URL`) → use **PGlite**, a full Postgres
  that runs *inside the Node process* — no Docker, no separate database server.

Both run the exact same schema and migrations, so what passes in tests behaves
the same in production. You call `getDb()` to get the shared connection; it
applies any pending migrations the first time it's used, then caches itself so we
don't reopen the connection on every request. `createTestDb()` makes a fresh,
empty, in-memory database for a single test.

---

## 4. `repository.ts` — every query, as a function

This is the biggest file and where the real work happens. It's organized into
labelled sections (search for the `// ---` banners):

**Teams** — `createTeam` makes a team with a fresh random code, and *retries* if
that code happens to collide with an existing one. `getTeamByCode` / `getTeamById`
look one up.

**Decks** — `getPublishedDeck` returns today's live deck (or `null` if none is
published). `upsertDeck` is how the seed script loads decks.

**Submissions** — the heart of it:
- `submitAnswers(...)` does three things in order:
  1. **Scores the answers on the server** (using `scoreAnswers` from `lib/quiz`)
     — the client never decides its own score.
  2. **Inserts the submission.** If the team already played today, the unique
     index rejects it and we throw `AlreadySubmittedError` (which the route turns
     into a friendly "you already played" message, not a crash).
  3. **Records a rank snapshot** — "you were #3 when you submitted." This is just
     for flavor; the live leaderboard always recomputes the real rank.

**Leaderboards** — `getDailyLeaderboard` and `getWeeklyLeaderboard` return the
standings, ordered by **score (high to low), then earliest submission wins ties**.
Rank is computed fresh each time it's read, so it's always current.

**Leagues** — `createLeague` (creator auto-joins), `joinLeague` (idempotent — joining
twice is harmless), `getLeaguesForTeam`, and league-scoped versions of the
leaderboard that only count member teams (they `JOIN` through
`league_membership`).

**Stats** (for the dashboard) — `getTeamStats` computes total points, best score,
days played, and the **current streak** (it pulls the set of days the team played
and counts backwards from today/yesterday while each previous day is present).
`getTeamHistory` returns recent results newest-first.

One small helper to know: `isUniqueViolation(err)` checks whether a database error
is the "duplicate key" error (Postgres code `23505`). That's how we turn a
duplicate submission or a code collision into a clean, handled outcome instead of
a 500.

---

## Two end-to-end flows

**A team plays today's quiz:**
1. `play.tsx` loader calls `getPublishedDeck(db, today)` → shows the questions.
2. On submit, the action calls `submitAnswers(db, { teamId, deck, answers })`.
3. That scores server-side, enforces one-per-day, and returns `{ score, rank }`.
4. The results screen then reads `getTeamDailyStanding` to show the live rank.

**A team views a league:**
1. `league.tsx` loader calls `getLeagueByCode(db, code)`.
2. Then `getLeagueDailyLeaderboard` / `getLeagueWeeklyLeaderboard`, which only
   include teams that appear in `league_membership` for that league.

That's the whole layer. If you remember one thing: **`repository.ts` is the door
to the database, and everything else just walks through it.**
