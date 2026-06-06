/**
 * Shared server helpers for the custom-quiz admin routes: resolve the league +
 * enforce the light admin role, and parse/validate the builder payload.
 */

import { redirect } from "react-router";
import { getDb } from "~/db/client";
import { getLeagueByCode, getTeamById, isLeagueAdmin } from "~/db/repository";
import type { DB } from "~/db/client";
import type { League } from "~/db/schema";
import { getTeamId } from "~/lib/session.server";
import { customQuizInputSchema, type CustomQuizInput } from "~/lib/quiz";

/**
 * Loads the league for `code` and requires the current team to be its admin.
 * Throws a redirect (to the league page, or home) otherwise.
 */
export async function requireLeagueAdmin(
  request: Request,
  code: string,
): Promise<{ db: DB; league: League; teamId: string }> {
  const teamId = await getTeamId(request);
  if (!teamId) throw redirect("/");

  const db = await getDb();
  const team = await getTeamById(db, teamId);
  if (!team) throw redirect("/");

  const league = await getLeagueByCode(db, code);
  if (!league) throw new Response("League not found", { status: 404 });

  if (!isLeagueAdmin(league, teamId)) {
    // Not the admin — bounce to the public league page.
    throw redirect(`/league/${league.code}`);
  }
  return { db, league, teamId };
}

/** Parses the builder's hidden `payload` field and validates it. */
export function parseQuizPayload(
  form: FormData,
):
  | { ok: true; data: CustomQuizInput }
  | { ok: false; error: string } {
  const raw = form.get("payload");
  if (typeof raw !== "string") {
    return { ok: false, error: "Missing quiz data." };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "Could not read the quiz data." };
  }
  const result = customQuizInputSchema.safeParse(parsed);
  if (!result.success) {
    return {
      ok: false,
      error: result.error.issues.map((i) => i.message).join("; "),
    };
  }
  return { ok: true, data: result.data };
}
