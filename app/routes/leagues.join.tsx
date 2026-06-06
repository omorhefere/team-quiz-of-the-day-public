import { Link, redirect, useActionData } from "react-router";
import type { Route } from "./+types/leagues.join";
import { getDb } from "~/db/client";
import { getLeagueByCode, getTeamById, joinLeague } from "~/db/repository";
import { isTeamCodeFormat } from "~/lib/code";
import { getTeamId } from "~/lib/session.server";

export async function loader() {
  return null;
}

export async function action({ request }: Route.ActionArgs) {
  const teamId = await getTeamId(request);
  if (!teamId) throw redirect("/");

  const db = await getDb();
  const team = await getTeamById(db, teamId);
  if (!team) throw redirect("/");

  const form = await request.formData();
  const code = String(form.get("code") ?? "");

  if (!isTeamCodeFormat(code)) {
    return { error: "That doesn't look like a league code (e.g. JADE-LYNX-08)." };
  }

  const league = await getLeagueByCode(db, code);
  if (!league) {
    return { error: "No league found with that code." };
  }

  await joinLeague(db, league.id, team.id);
  throw redirect(`/league/${league.code}`);
}

export default function JoinLeague() {
  const result = useActionData<typeof action>();
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-950 px-6 text-center text-gray-100">
      <h1 className="text-2xl font-bold text-red-400">Couldn&rsquo;t join league</h1>
      <p className="mt-3 max-w-sm text-gray-400">{result?.error}</p>
      <Link to="/" className="mt-8 inline-block text-indigo-400 hover:underline">
        ← Back home
      </Link>
    </main>
  );
}
