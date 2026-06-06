# Office Trivia League

One AI-free daily trivia deck, every team, one global leaderboard. Teams play
today's 10 questions together after standup, score out of 10, and climb a
cross-company leaderboard. Built on React Router 7 (SSR) + TypeScript + Tailwind
+ Drizzle/Postgres.

See **[HANDOFF.md](./HANDOFF.md)** for the full build status, what's needed to
go live, and architecture decisions. **[PROGRESS.md](./PROGRESS.md)** has the
task table.

## Getting Started

```bash
npm install
npm run seed   # load sample decks into a local PGlite DB
npm run dev    # http://localhost:5173
```

Useful commands: `npm test`, `npm run typecheck`, `npm run build`,
`npm run smoke` (content gate), `npm run db:generate` (new migration).

Decks are JSON in `app/data/decks/` (one per UTC day, exactly 10 questions);
`npm run seed` validates and loads them.

## Understanding the code

New to the codebase? Two plain-English guides explain the core layers:

- **[`app/db/README.md`](./app/db/README.md)** — the data layer: the tables, how
  we connect, and where every query lives.
- **[`app/lib/README.md`](./app/lib/README.md)** — the helpers: the product rules
  (dates, scoring, codes) and the server-only adapters (session, env).

---

## Built on React Router

The sections below are the underlying template's docs.

### Development

Start the development server with HMR:

```bash
npm run dev
```

Your application will be available at `http://localhost:5173`.

## Building for Production

Create a production build:

```bash
npm run build
```

## Deployment

### Docker Deployment

To build and run using Docker:

```bash
docker build -t my-app .

# Run the container
docker run -p 3000:3000 my-app
```

The containerized application can be deployed to any platform that supports Docker, including:

- AWS ECS
- Google Cloud Run
- Azure Container Apps
- Digital Ocean App Platform
- Fly.io
- Railway

### DIY Deployment

If you're familiar with deploying Node applications, the built-in app server is production-ready.

Make sure to deploy the output of `npm run build`

```
├── package.json
├── package-lock.json (or pnpm-lock.yaml, or bun.lockb)
├── build/
│   ├── client/    # Static assets
│   └── server/    # Server-side code
```

## Styling

This template comes with [Tailwind CSS](https://tailwindcss.com/) already configured for a simple default starting experience. You can use whatever CSS framework you prefer.

---

Built with ❤️ using React Router.
