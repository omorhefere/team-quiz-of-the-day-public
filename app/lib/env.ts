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

  /**
   * Secret used to sign the team-session cookie. REQUIRED in production —
   * falling back to a public constant there would let anyone forge a team
   * cookie. Dev/test get a fixed insecure default for convenience.
   */
  get sessionSecret(): string {
    const value = read("SESSION_SECRET");
    if (value) return value;
    if (this.isProduction) {
      throw new Error(
        "SESSION_SECRET is required in production — refusing to sign cookies with a public default.",
      );
    }
    return "dev-insecure-session-secret";
  },

  get adminSessionSecret(): string {
    const value = read("ADMIN_SESSION_SECRET");
    if (value) return value;
    if (this.isProduction) {
      throw new Error(
        "ADMIN_SESSION_SECRET is required in production — refusing to sign admin cookies with a public default.",
      );
    }
    return "dev-insecure-admin-session-secret";
  },

  /** Sentry DSN. When absent, Sentry is a no-op. */
  sentryDsn: read("SENTRY_DSN"),

  /** Cloudflare Web Analytics token. When absent, the beacon is not injected. */
  cloudflareAnalyticsToken: read("CLOUDFLARE_ANALYTICS_TOKEN"),

  /** Public base URL, used for absolute OG image URLs. */
  appUrl: read("APP_URL") ?? "http://localhost:5173",

  /**
   * Anthropic API key for AI quiz generation. Read lazily (getter) so it's
   * picked up after `.env` loads at boot. Absent = generation is unavailable.
   */
  get anthropicApiKey(): string | undefined {
    return read("ANTHROPIC_API_KEY");
  },

  /**
   * Model used for quiz generation. Defaults to Sonnet 5.5 — a strong, cheaper
   * model that's plenty for grounded generation (the quality is enforced by the
   * prompt + source_quote + human review, not raw model horsepower). Override
   * with LLM_MODEL=claude-opus-5-5 for max quality.
   */
  get llmModel(): string {
    return read("LLM_MODEL") ?? "claude-sonnet-5-5";
  },

  /**
   * Model used for the adversarial verifier pass. Checking existing questions
   * against a quote is a much lighter job than writing them, and this call is
   * serial with generation — so it runs on Haiku by default to keep it off the
   * admin's wait. Override with LLM_VERIFY_MODEL.
   */
  get llmVerifyModel(): string {
    return read("LLM_VERIFY_MODEL") ?? "claude-haiku-5-5";
  },
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
