/**
 * T9 — Server-side observability (Sentry).
 *
 * Entirely env-gated: with no SENTRY_DSN set, every function here is a no-op,
 * so local dev and tests run untouched. In production, set SENTRY_DSN and errors
 * thrown from loaders/actions/render are reported.
 *
 * Server-only (`.server` suffix).
 */

import * as Sentry from "@sentry/node";
import { env } from "./env";

let initialized = false;

/** Initializes Sentry once, if a DSN is configured. Safe to call repeatedly. */
export function initSentry(): void {
  if (initialized || !env.sentryDsn) return;
  Sentry.init({
    dsn: env.sentryDsn,
    environment: env.nodeEnv,
    tracesSampleRate: env.isProduction ? 0.1 : 1.0,
  });
  initialized = true;
}

/** Reports an error to Sentry (no-op when Sentry isn't configured). */
export function captureException(error: unknown): void {
  if (!env.sentryDsn) return;
  Sentry.captureException(error);
}
