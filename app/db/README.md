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

- **IDs** are `uuid` columns generated with **UUIDv7** — a time-sortable,
  unguessable ID (nicer than auto-increment integers for public-facing things).
  See Appendix A.
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

---

## Appendix A: why IDs are UUIDv7

IDs are stored in native Postgres `uuid` columns and generated with **UUIDv7**
(`import { v7 as uuidv7 } from "uuid"`), so we never ask the database for "the
next number."

A plain **UUIDv4** is fully random, 36 hex chars with dashes:
`550e8400-e29b-41d4-a716-446655440000`. Two made back-to-back have no
relationship, so they're unguessable but not sortable.

**UUIDv7** is the same 128 bits and the same familiar format, but the first
**48 bits are a millisecond timestamp**, with the rest random:

```
019e9dbc-301d-7174-bdda-90e6530401e9
└ timestamp ┘ ^ version 7        ^ random
```

Because the timestamp leads, **UUIDv7s sort by creation time when sorted
normally** — `ORDER BY id` ≈ "oldest first," for free. We use them because they:

- are **sortable** (handy for pagination / rough time-ordering with no extra
  column), and give the database good insert locality (new rows land near the end
  of the index instead of scattering it);
- are **unguessable** — unlike sequential integers (`1, 2, 3…`), nobody can
  enumerate your teams or count how many exist (the IDs appear in URLs like
  `/og/team/:teamId/...`);
- are a **real IETF standard** (RFC 9562, 2024) stored in the native 16-byte
  `uuid` column type, and every tool/ORM already understands a UUID.

(Tradeoff: a UUIDv7 leaks its creation time — fine here. An earlier version of
this code used **ULID**, a community spec with the same timestamp+random idea but
a shorter 26-char dash-free string; we switched to UUIDv7 for the standard +
native `uuid` type. ULID is still a reasonable pick if you specifically want the
compact URL string.)

---

## Appendix B: how the indexes work

An **index** is a pre-sorted copy of just the columns you care about, kept in sync
by the database automatically, so a query becomes "jump to the spot and read in
order" instead of "scan the whole table and sort."

Picture `daily_submission` as a pile of cards in the random order teams submitted:

```
Alpha  06-06  score 7      Wolves 06-05  score 10
Beta   06-06  score 10     Alpha  06-05  score 4
Gamma  06-06  score 7      Beta   06-05  score 9
```

To answer "today's (06-06) leaderboard, best first" **without an index**, the DB
reads *every* card, keeps the 06-06 ones, then sorts them. Fine for 6 cards; at 2
million it reads all 2 million on every refresh.

The index `(deck_date, score, submitted_at)` is a second pile, already sorted by
date, then score, then time:

```
06-05  10  Wolves
06-05   9  Beta
06-05   4  Alpha
06-06  10  Beta     ← today starts here
06-06   7  Alpha
06-06   7  Gamma
```

Now the answer is just "find where 06-06 begins and read down" — already grouped
by day, already in score order. No scan, no sort. (Descending = read that block
bottom-to-top; Postgres scans indexes backwards.)

**Column order is the trick.** The pile is sorted by the *first* column first, so
you can jump to a date instantly — but you couldn't jump by score alone, because
scores are scattered across dates. Like a phone book sorted by (lastname,
firstname): great for "find Smith," useless for "find every John." So the leading
column must be the thing you filter on (`deck_date`), followed by what you sort by
(`score`, `submitted_at`).

A **unique** index does all that *plus* refuses to file two cards with the same
value. On insert, the DB checks that slot in the sorted pile; if a card is already
there, it rejects the new one — atomically, so two simultaneous inserts can't both
win. That's how `daily_submission_team_date_uq` enforces "one play per team per
day" and `league_membership_uq` enforces "can't join the same league twice,"
without any check-then-insert race in app code.

The catch: every index is another pile the DB keeps sorted, so each write does a
little extra work and each index costs storage. Add them deliberately — for read
speed or a uniqueness rule — not on every column.

Our three:
- `daily_submission_team_date_uq` — unique `(team_id, deck_date)`: one play per day.
- `daily_submission_leaderboard_idx` — `(deck_date, score, submitted_at)`: fast leaderboard.
- `league_membership_uq` — unique `(league_id, team_id)`: no double-joins.
