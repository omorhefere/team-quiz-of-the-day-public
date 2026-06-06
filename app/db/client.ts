/**
 * T2 — Database client with a driver switch.
 *
 * Production: `postgres` (postgres-js) over `DATABASE_URL`.
 * Local dev / tests / CI: PGlite — an in-process WASM Postgres. No Docker
 * required, and it runs the exact same Drizzle schema and migrations.
 *
 * The instance is cached on `globalThis` so React Router's dev HMR doesn't open
 * a new pool / PGlite instance on every reload.
 */

import path from "node:path";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { migrate as migratePostgres } from "drizzle-orm/postgres-js/migrator";

import { env } from "~/lib/env";
import { schema } from "./schema";

export type DB = PgliteDatabase<typeof schema>;

const MIGRATIONS_FOLDER = path.resolve(process.cwd(), "drizzle");

type Cache = {
  db?: DB;
  ready?: Promise<DB>;
};

const globalCache = globalThis as unknown as { __otl_db?: Cache };
const cache: Cache = (globalCache.__otl_db ??= {});

async function build(): Promise<DB> {
  if (env.databaseUrl) {
    // Production / any real Postgres.
    const postgres = (await import("postgres")).default;
    const client = postgres(env.databaseUrl, { max: 10 });
    const db = drizzlePostgres(client, { schema }) as unknown as DB;
    await migratePostgres(db as unknown as PostgresJsDatabase<typeof schema>, {
      migrationsFolder: MIGRATIONS_FOLDER,
    });
    return db;
  }

  // Local dev / test: PGlite. In-memory unless PGLITE_DATA_DIR is set so dev
  // data (seeded decks, registered teams) survives a server restart.
  const dataDir = process.env.PGLITE_DATA_DIR;
  const { PGlite } = await import("@electric-sql/pglite");
  const client = dataDir ? new PGlite(dataDir) : new PGlite();
  const db = drizzlePglite(client, { schema });
  await migratePglite(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return db;
}

/** Returns the shared database instance, running migrations on first use. */
export function getDb(): Promise<DB> {
  if (cache.db) return Promise.resolve(cache.db);
  cache.ready ??= build().then((db) => {
    cache.db = db;
    return db;
  });
  return cache.ready;
}

/**
 * Creates a throwaway in-memory PGlite database with migrations applied.
 * For tests that need full isolation.
 */
export async function createTestDb(): Promise<DB> {
  const { PGlite } = await import("@electric-sql/pglite");
  const db = drizzlePglite(new PGlite(), { schema });
  await migratePglite(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return db;
}
