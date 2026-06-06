# The helpers (`app/lib/`), in plain English

If `app/db/` is the database, `app/lib/` is the **brain and the small adapters**.
It holds two kinds of file:

- **Pure logic** — the actual rules of the product (how scoring works, when a new
  day starts, what a valid team name is). These take inputs and return outputs
  with no side effects, which is exactly why they're easy to test.
- **Server-only adapters** — thin wrappers around the outside world (the session
  cookie, error reporting, turning data into an image). These end in
  `.server.ts`, a signal to the build tool: *never ship this to the browser.*

The important rule: **`app/lib/` never imports `app/db/`.** The logic doesn't know
or care about the database. Routes glue the two together.

| File | Kind | Job |
|------|------|-----|
| `date.ts` | pure | What day is it? (one deck per UTC day) |
| `quiz.ts` | pure | The quiz rules: validation + scoring |
| `code.ts` | pure | Generate team/league codes |
| `profanity.ts` | pure | Validate a team/league name |
| `og-card.ts` | pure | Build the shareable score image |
| `env.ts` | adapter | Read configuration from the environment |
| `session.server.ts` | adapter | The signed login cookie |
| `observability.server.ts` | adapter | Error reporting (Sentry) |

---

## The pure logic

### `date.ts` — the single notion of "today"

The whole product runs on **one shared quiz per day, rolling over at 00:00 UTC**.
That sounds simple until you remember the server, the players, and the database
might all be in different timezones. So *every* "what day is it?" decision goes
through this one file, and nowhere else calls `new Date()` for deck logic.

- `currentUtcDeckDate()` → today as `"2026-06-06"` in UTC.
- `addDeckDays(date, n)` → move forward/back by days (handles month boundaries).
- `weeklyWindow(date)` → the 7 days ending on `date` (for the weekly leaderboard).
- `isDeckDate(str)` → is this a real `YYYY-MM-DD`? (rejects `2026-13-40`.)

Because it's pure, the tests can pass in a fake `now` and prove the midnight
rollover behaves — no waiting for real midnight.

### `quiz.ts` — the rules of the game

This file owns two things: **what a valid quiz is**, and **how you score it**.

- The **shape rules** are Zod schemas: a deck is *exactly* 10 questions, each with
  *exactly* 4 choices and one correct index. `deckInputSchema` is what the seed
  loader checks before saving a deck, so a malformed deck can never reach players.
- `answersSchema` validates what a team submits (10 answers, each 0–3) — this is
  the check that stops a tampered form from writing junk to the database.
- `scoreAnswers(questions, answers)` is the scoring itself: count how many picks
  match the correct index. It lives here, on the server, so the browser never
  gets to decide its own score.

Constants like `QUESTIONS_PER_DECK` and `MAX_SCORE` are exported so the rest of
the app references one source of truth instead of hard-coding `10`.

### `code.ts` — the memorable codes

Teams and leagues are identified by codes like `BLUE-FOX-71` (an adjective, an
animal, two digits). They're picked from **curated, family-safe wordlists** so a
code is always speakable and never accidentally rude.

- `generateTeamCode()` → a fresh random code (uses crypto-grade randomness).
- `normalizeTeamCode(input)` → upper-cases and trims, so `blue-fox-71` matches.
- `isTeamCodeFormat(code)` → does it look like a code at all?

This file just *generates* codes. The "is it actually unique?" guarantee is the
database's job (a unique column) — the repository retries if it ever collides.

### `profanity.ts` — keeping public names clean

The team/league name is the one piece of text a stranger can type that shows up
publicly (leaderboard, share card). `validateDisplayName(name)` checks length and
runs a profanity filter (`bad-words`), returning a specific error code the route
turns into a friendly message. This is deliberately the *only* abuse defense in
v1 — the rest is trusted to the workplace context.

### `og-card.ts` — the share image

Turns a result into the 1200×630 PNG people paste into Slack. It's split in two on
purpose:

- `scoreCardSvg(card)` builds the image as an **SVG string** (and carefully
  escapes the team name so a weird name can't break the markup).
- `renderScoreCardPng(card)` rasterizes that SVG to a PNG using `@resvg/resvg-js`,
  a native Node renderer.

Keeping it pure and synchronous means a test can render a card and check it's a
valid PNG without a browser or a running server.

---

## The server-only adapters

### `env.ts` — configuration in one place

Everything reads settings (database URL, secrets, the app's public URL) through
the single `env` object instead of poking at `process.env` all over the codebase.
Most values are optional so the app boots locally with an empty `.env`. The
exception is `sessionSecret`: in **production** it *throws* if unset, because
signing login cookies with a default value would let anyone forge one.

### `session.server.ts` — the "logged in as this team" cookie

This is the device-bonding mechanism. When a team registers or enters their code,
we drop a small **signed** cookie (`otl_team`) holding just their team id, good for
~180 days.

- `commitTeamId(request, id)` → the `Set-Cookie` header that bonds this device.
- `getTeamId(request)` → reads/verifies the cookie on later visits.
- `clearTeam(request)` → sign-out.

"Signed" means the server can detect tampering — a user can't edit the cookie to
become a different team. It's `.server.ts` because it uses the secret.

### `observability.server.ts` — error reporting

A thin wrapper over Sentry. `initSentry()` and `captureException(err)` do nothing
unless `SENTRY_DSN` is configured, so local development and tests run untouched.
In production, errors thrown from loaders/actions get reported automatically.

---

## How it all fits

A typical request pulls from several of these at once. When a team submits the
quiz, `app/routes/play.tsx`:

1. reads the cookie via **`session.server.ts`** (who is this team?),
2. figures out today via **`date.ts`**,
3. validates the answers via **`quiz.ts`** (`answersSchema`),
4. then hands off to the repository to score and save.

So `lib/` answers the small, sharp questions — *who, when, is-this-valid, what's
the score* — and the route orchestrates them. Pure logic in, easy tests, no
database knowledge required.
