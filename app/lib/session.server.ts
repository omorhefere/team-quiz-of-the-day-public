/**
 * T4 — Team session cookie.
 *
 * The "save this device as Team X" mechanic: once a team registers (or enters
 * their code), we drop a signed cookie holding their team id so subsequent
 * visits route straight to /play as that team — no re-typing during standup.
 *
 * Server-only (`.server` suffix).
 */

import { createCookieSessionStorage } from "react-router";
import { env } from "./env";

type SessionData = {
  teamId: string;
};

type FlashData = {
  /** One-time error message shown on the next page load (consumed on read). */
  error: string;
};

const storage = createCookieSessionStorage<SessionData, FlashData>({
  cookie: {
    name: "tqotd_team",
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secrets: [env.sessionSecret],
    secure: env.isProduction,
    // ~180 days: the device stays "bonded" to the team for the season.
    maxAge: 60 * 60 * 24 * 180,
  },
});

export async function getTeamId(request: Request): Promise<string | null> {
  const session = await storage.getSession(request.headers.get("Cookie"));
  return session.get("teamId") ?? null;
}

/** Returns a Set-Cookie header value that bonds this device to `teamId`. */
export async function commitTeamId(
  request: Request,
  teamId: string,
): Promise<string> {
  const session = await storage.getSession(request.headers.get("Cookie"));
  session.set("teamId", teamId);
  return storage.commitSession(session);
}

/** Returns a Set-Cookie header value that clears the team bond. */
export async function clearTeam(request: Request): Promise<string> {
  const session = await storage.getSession(request.headers.get("Cookie"));
  return storage.destroySession(session);
}

/**
 * Writes a flash error into the session and returns a Set-Cookie header value.
 * The error is consumed (cleared) on the next read via `getFlashError`.
 */
export async function flashError(request: Request, message: string): Promise<string> {
  const session = await storage.getSession(request.headers.get("Cookie"));
  session.flash("error", message.slice(0, 500));
  return storage.commitSession(session);
}

/**
 * Reads and clears the flash error from the session.
 * Returns `[error | null, Set-Cookie header]` — the caller must include
 * the Set-Cookie header in the response so the flash is consumed.
 */
export async function getFlashError(
  request: Request,
): Promise<[string | null, string]> {
  const session = await storage.getSession(request.headers.get("Cookie"));
  const error = session.get("error") ?? null;
  const cookie = await storage.commitSession(session);
  return [error, cookie];
}
