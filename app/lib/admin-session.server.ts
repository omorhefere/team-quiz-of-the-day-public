import { createCookieSessionStorage } from "react-router";
import { env } from "./env";

type AdminSessionData = {
  adminId: string;
  leagueId: string;
};

const storage = createCookieSessionStorage<AdminSessionData>({
  cookie: {
    name: "otl_admin",
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secrets: [env.adminSessionSecret],
    secure: env.isProduction,
    maxAge: 60 * 60 * 24 * 30, // 30 days
  },
});

export async function getAdminSession(
  request: Request,
): Promise<{ adminId: string; leagueId: string } | null> {
  const session = await storage.getSession(request.headers.get("Cookie"));
  const adminId = session.get("adminId");
  const leagueId = session.get("leagueId");
  if (!adminId || !leagueId) return null;
  return { adminId, leagueId };
}

export async function commitAdminSession(
  request: Request,
  adminId: string,
  leagueId: string,
): Promise<string> {
  const session = await storage.getSession(request.headers.get("Cookie"));
  session.set("adminId", adminId);
  session.set("leagueId", leagueId);
  return storage.commitSession(session);
}

export async function clearAdminSession(request: Request): Promise<string> {
  const session = await storage.getSession(request.headers.get("Cookie"));
  return storage.destroySession(session);
}
