/**
 * Centralized environment access. Server-only.
 *
 * Every value is optional at the type level so the app boots in local dev with
 * an empty `.env`. Features that *require* a value (e.g. a real Postgres URL in
 * production) assert it at their own call site with a clear message.
 */

function read(name: string): string | undefined {
  const value = process.env[name];
  return value && value.length > 0 ? value : undefined;
}

export const env = {
  /** Node environment. */
  nodeEnv: process.env.NODE_ENV ?? "development",
  get isProduction() {
    return this.nodeEnv === "production";
  },

  /** Postgres connection string. When absent, the app uses a local PGlite DB. */
  databaseUrl: read("DATABASE_URL"),

  /** Secret used to sign the team-session cookie. */
  sessionSecret: read("SESSION_SECRET") ?? "dev-insecure-session-secret",

  /** Sentry DSN. When absent, Sentry is a no-op. */
  sentryDsn: read("SENTRY_DSN"),

  /** Cloudflare Web Analytics token. When absent, the beacon is not injected. */
  cloudflareAnalyticsToken: read("CLOUDFLARE_ANALYTICS_TOKEN"),

  /** Public base URL, used for absolute OG image URLs. */
  appUrl: read("APP_URL") ?? "http://localhost:5173",
};

/**
 * Asserts a value is present, throwing a descriptive error otherwise. Use for
 * config that must exist in production.
 */
export function required<T>(value: T | undefined, name: string): T {
  if (value === undefined || value === null) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}
