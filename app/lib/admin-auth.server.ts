import * as argon2 from "argon2";
import { eq, and } from "drizzle-orm";
import { redirect } from "react-router";
import { getDb, type DB } from "~/db/client";
import { leagueAdmins } from "~/db/schema";
import { getLeagueByCode } from "~/db/repository";
import { getAdminSession } from "~/lib/admin-session.server";

export async function createLeagueAdmin(
  db: DB,
  leagueId: string,
  email: string,
  password: string,
): Promise<string> {
  const passwordHash = await argon2.hash(password);
  const [admin] = await db
    .insert(leagueAdmins)
    .values({ leagueId, email, passwordHash })
    .returning({ id: leagueAdmins.id });
  return admin.id;
}

/** Sign in by email alone (email is globally unique). Returns id + leagueId. */
export async function verifyAdminPasswordByEmail(
  db: DB,
  email: string,
  password: string,
): Promise<{ id: string; leagueId: string } | null> {
  const [admin] = await db
    .select()
    .from(leagueAdmins)
    .where(eq(leagueAdmins.email, email.toLowerCase()))
    .limit(1);

  if (!admin) return null;
  const valid = await argon2.verify(admin.passwordHash, password);
  if (!valid) return null;
  return { id: admin.id, leagueId: admin.leagueId };
}

export async function verifyLeagueAdminPassword(
  db: DB,
  leagueId: string,
  email: string,
  password: string,
): Promise<{ id: string } | null> {
  const [admin] = await db
    .select()
    .from(leagueAdmins)
    .where(
      and(
        eq(leagueAdmins.leagueId, leagueId),
        eq(leagueAdmins.email, email.toLowerCase()),
      ),
    )
    .limit(1);

  if (!admin) return null;
  const valid = await argon2.verify(admin.passwordHash, password);
  if (!valid) return null;
  return { id: admin.id };
}

export async function getLeagueAdminByLeagueId(
  db: DB,
  leagueId: string,
): Promise<{ id: string; email: string } | null> {
  const [admin] = await db
    .select({ id: leagueAdmins.id, email: leagueAdmins.email })
    .from(leagueAdmins)
    .where(eq(leagueAdmins.leagueId, leagueId))
    .limit(1);
  return admin ?? null;
}

/**
 * Requires the request to have a valid admin session for the given league code.
 * Redirects to the admin login page if not authenticated.
 */
export async function requireLeagueAdminAuth(
  request: Request,
  code: string,
) {
  const db = await getDb();
  const league = await getLeagueByCode(db, code);
  if (!league) throw new Response("League not found", { status: 404 });

  const adminSession = await getAdminSession(request);
  if (adminSession?.leagueId === league.id) {
    return { db, league, adminId: adminSession.adminId };
  }

  throw redirect(`/league/${league.code}/admin/login`);
}
