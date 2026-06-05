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

const storage = createCookieSessionStorage<SessionData>({
  cookie: {
    name: "otl_team",
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
