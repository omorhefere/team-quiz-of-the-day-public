import { Link, redirect, useActionData } from "react-router";
import type { Route } from "./+types/leagues.create";
import { getDb } from "~/db/client";
import { createLeague, getTeamById } from "~/db/repository";
import { getTeamId } from "~/lib/session.server";
import { validateDisplayName, DISPLAY_NAME_ERROR_MESSAGES } from "~/lib/profanity";

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
  const name = String(form.get("name") ?? "");

  // Reuse the team-name validation rules for league names (length + profanity).
  const error = validateDisplayName(name);
  if (error) {
    return { error: DISPLAY_NAME_ERROR_MESSAGES[error] };
  }

  const league = await createLeague(db, {
    name,
    createdByTeamId: team.id,
  });
  throw redirect(`/league/${league.code}/admin/setup`);
}

export default function CreateLeague() {
  const result = useActionData<typeof action>();
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-950 px-6 text-center text-gray-100">
      <h1 className="text-2xl font-bold text-red-400">Couldn&rsquo;t create league</h1>
      <p className="mt-3 max-w-sm text-gray-400">{result?.error}</p>
      <Link to="/" className="mt-8 inline-block text-indigo-400 hover:underline">
        ← Back home
      </Link>
    </main>
  );
}
