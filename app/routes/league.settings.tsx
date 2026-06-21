import { Form, Link, redirect } from "react-router";
import type { Route } from "./+types/league.settings";
import {
  deleteLeague,
  getLeagueMembers,
  removeTeamFromLeague,
  renameLeague,
} from "~/db/repository";
import { requireLeagueAdmin } from "~/lib/custom-quiz.server";

export function meta() {
  return [{ title: "League settings · Team Quiz of the Day" }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { db, league, teamId } = await requireLeagueAdmin(request, params.code);
  const members = await getLeagueMembers(db, league.id);
  return {
    code: league.code,
    name: league.name,
    adminTeamId: teamId,
    members,
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  const { db, league, teamId } = await requireLeagueAdmin(request, params.code);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  if (intent === "rename") {
    const name = String(form.get("name") ?? "").trim();
    if (name.length >= 2 && name.length <= 60) {
      await renameLeague(db, league.id, name);
    }
    throw redirect(`/league/${league.code}/settings`);
  }

  if (intent === "remove-member") {
    const targetId = form.get("teamId");
    // Prevent the admin from removing themselves via this path.
    if (typeof targetId === "string" && targetId !== teamId) {
      await removeTeamFromLeague(db, league.id, targetId);
    }
    throw redirect(`/league/${league.code}/settings`);
  }

  if (intent === "delete") {
    await deleteLeague(db, league.id);
    throw redirect("/");
  }

  throw redirect(`/league/${league.code}/settings`);
}

export default function LeagueSettings({ loaderData }: Route.ComponentProps) {
  const { code, name, adminTeamId, members } = loaderData;
  return (
    <main className="min-h-screen bg-gray-950 text-gray-100">
      <div className="mx-auto max-w-2xl px-6 py-12">
        <Link
          to={`/league/${code}/manage`}
          className="text-sm text-indigo-400 hover:underline"
        >
          ← Back to quizzes
        </Link>
        <h1 className="mt-2 text-2xl font-bold">League settings</h1>

        {/* Rename */}
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-gray-500">
            Name
          </h2>
          <Form method="post" className="flex gap-3">
            <input type="hidden" name="intent" value="rename" />
            <input
              name="name"
              defaultValue={name}
              maxLength={60}
              minLength={2}
              required
              className="flex-1 rounded-lg border border-gray-700 bg-gray-900 px-4 py-2 text-gray-100 outline-none focus:border-indigo-500"
            />
            <button className="rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-500">
              Save
            </button>
          </Form>
        </section>

        {/* Members */}
        <section className="mt-10">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-gray-500">
            Members ({members.length})
          </h2>
          <div className="divide-y divide-gray-800 overflow-hidden rounded-xl border border-gray-800">
            {members.map((m) => (
              <div key={m.teamId} className="flex items-center gap-3 px-4 py-3">
                <span className="flex-1 truncate font-medium">
                  {m.displayName}
                  {m.teamId === adminTeamId && (
                    <span className="ml-2 text-xs text-indigo-400">admin</span>
                  )}
                </span>
                <span className="text-xs text-gray-600">
                  joined {new Date(m.joinedAt).toLocaleDateString()}
                </span>
                {m.teamId !== adminTeamId && (
                  <Form
                    method="post"
                    onSubmit={(e) => {
                      if (!confirm(`Remove ${m.displayName} from the league?`))
                        e.preventDefault();
                    }}
                  >
                    <input type="hidden" name="intent" value="remove-member" />
                    <input type="hidden" name="teamId" value={m.teamId} />
                    <button className="text-xs font-semibold text-gray-500 hover:text-red-400">
                      Remove
                    </button>
                  </Form>
                )}
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-gray-600">
            Invite code:{" "}
            <span className="select-all font-mono text-indigo-300">{code}</span>
          </p>
        </section>

        {/* Danger zone */}
        <section className="mt-12 rounded-xl border border-red-500/20 p-5">
          <h2 className="mb-1 text-sm font-semibold text-red-400">Danger zone</h2>
          <p className="mb-4 text-sm text-gray-500">
            Deleting the league removes all quizzes, sources, and scores permanently.
          </p>
          <Form
            method="post"
            onSubmit={(e) => {
              if (!confirm("Delete this league and all its data? This cannot be undone."))
                e.preventDefault();
            }}
          >
            <input type="hidden" name="intent" value="delete" />
            <button className="rounded-lg border border-red-500/40 px-4 py-2 text-sm font-semibold text-red-400 hover:bg-red-500/10">
              Delete league
            </button>
          </Form>
        </section>
      </div>
    </main>
  );
}
