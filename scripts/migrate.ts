/**
 * Applies pending migrations to the production database (`DATABASE_URL`).
 * Run in CI/CD before the app boots: `npm run db:migrate`.
 *
 * Local dev (PGlite) auto-migrates on first DB use, so this is only needed
 * for real Postgres.
 */

import path from "node:path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required to run migrations.");
  process.exit(1);
}

const client = postgres(url, { max: 1 });
const db = drizzle(client);

await migrate(db, {
  migrationsFolder: path.resolve(process.cwd(), "drizzle"),
});

console.log("Migrations applied.");
await client.end();
