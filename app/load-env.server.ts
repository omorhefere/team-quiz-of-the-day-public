/**
 * Loads a local `.env` file into `process.env` at server boot.
 *
 * WHY: Vite only exposes `VITE_`-prefixed vars to the client; it does NOT
 * populate `process.env` for server code. So server-only secrets (like
 * ANTHROPIC_API_KEY) read via `process.env` wouldn't be picked up in dev. This
 * uses Node's native `process.loadEnvFile()` (no dependency) and must be the
 * FIRST import in the server entry so `.env` is loaded before any module reads
 * `process.env`. In production, real environment variables are already set, so a
 * missing `.env` file is fine — we swallow that error.
 */
try {
  process.loadEnvFile();
} catch {
  // No .env file (e.g. production) — real env vars are already in process.env.
}
