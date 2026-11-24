# Team Quiz of the Day

A daily trivia game for teams, plus private leagues where an admin turns their
company's own web pages and PDFs into quizzes with Claude.

Teams play the day's 10 questions together after standup, score out of 10, and
climb a global leaderboard. League admins can add their own sources, generate a
grounded quiz draft with AI, check it, and publish it to their league.

## What the AI does

Language models can state wrong answers with full confidence, so generation is
built so that every question can be checked before anyone plays it:

1. **Ingest:** an admin adds URLs or uploads PDFs. The text is extracted once
   (Mozilla Readability for pages, `pdf-parse` for PDFs) and stored, so
   generation never depends on a slow or flaky site.
2. **Grounded generation:** Claude writes questions using **only** the stored
   source text. Structured outputs (`messages.parse` with a Zod schema) force
   the exact JSON shape: question, 4 choices, correct index, and a
   **verbatim `source_quote`** that proves the answer.
3. **Adversarial verification:** a second, cheaper model pass checks each
   question against its quote and flags any that the quote doesn't support.
4. **Human review:** the result is a *draft* in the quiz builder. The admin
   edits and publishes it. AI suggests, a person decides.

Prompt caching on the source documents makes regenerations for the same league
much cheaper. A fake LLM service is used when no API key is set, so the
whole app runs locally and in tests without paying for API calls.

Code: [`app/lib/llm/`](./app/lib/llm) (contract, Claude implementation, fake,
factory) and [`app/lib/ingest.server.ts`](./app/lib/ingest.server.ts).

## Features

- One global daily deck that rolls over at 00:00 UTC, one play per team per day
- Anonymous team identity: a team code (`BLUE-FOX-71`) and a signed cookie, no sign-up
- Live global leaderboard, answer review after playing, and a PNG share card
- Private leagues with invite codes, daily and weekly boards, and admin accounts
- Custom quizzes: build by hand, or generate from sources with Claude

## Tech stack

- **React Router 7** (server-rendered) · **TypeScript** · **Tailwind CSS**
- **Drizzle ORM** on **Postgres** (Neon in production, in-process **PGlite**
  for local dev and tests, so you don't need Docker)
- **Anthropic SDK** (Claude) with Zod structured outputs
- **Vitest** tests, GitHub Actions CI, Dockerfile + `fly.toml` for deployment
- `@resvg/resvg-js` for share cards, optional Sentry and Cloudflare Analytics

## Running it locally

```bash
npm install
npm run seed   # load the sample decks into a local PGlite database
npm run dev    # http://localhost:5173
```

Copy `.env.example` to `.env` to configure it. Every variable is optional
locally; set `ANTHROPIC_API_KEY` to use real AI generation instead of the fake.

| Command | What it does |
| --- | --- |
| `npm test` | Unit and integration tests (against PGlite) |
| `npm run typecheck` | Generate route types and run `tsc` |
| `npm run build` | Production build |
| `npm run smoke` | Content check: is there a valid deck for today? |
| `npm run db:generate` | Create a new migration from the schema |

Daily decks are JSON files in [`app/data/decks/`](./app/data/decks), one per
UTC day with exactly 10 questions. `npm run seed` validates and loads them.

## Project layout

```
app/routes/      pages and actions (play, leaderboard, leagues, sources, generate)
app/lib/         product rules (dates, scoring, codes) and server adapters
app/lib/llm/     AI quiz generation and verification
app/db/          schema, database client, all queries
app/data/decks/  daily trivia decks
drizzle/         migrations
scripts/         seed, migrate, smoke test
```

[`app/db/README.md`](./app/db/README.md) and
[`app/lib/README.md`](./app/lib/README.md) explain the data layer and helpers
in plain English.
