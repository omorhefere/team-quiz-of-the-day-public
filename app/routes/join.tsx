import { Link, data, redirect, useActionData } from "react-router";
import type { Route } from "./+types/join";
import { getDb } from "~/db/client";
import { getTeamByCode } from "~/db/repository";
import { isTeamCodeFormat } from "~/lib/code";
import { commitTeamId } from "~/lib/session.server";

export async function loader() {
  throw redirect("/");
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const code = String(form.get("code") ?? "");

  if (!isTeamCodeFormat(code)) {
    return data(
      { error: "That doesn't look like a team code. Codes look like BLUE-FOX-71." },
      { status: 400 },
    );
  }

  const db = await getDb();
  const team = await getTeamByCode(db, code);
  if (!team) {
    return data(
      { error: "No team found with that code. Check the code pinned in your Slack channel." },
      { status: 404 },
    );
  }

  const cookie = await commitTeamId(request, team.id);
  throw redirect("/play", { headers: { "Set-Cookie": cookie } });
}

export default function Join() {
  const result = useActionData<typeof action>();
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-950 px-6 text-center text-gray-100">
      <h1 className="text-2xl font-bold text-red-400">Couldn&rsquo;t join</h1>
      <p className="mt-3 max-w-sm text-gray-400">{result?.error}</p>
      <Link to="/" className="mt-8 inline-block text-indigo-400 hover:underline">
        ← Back
      </Link>
    </main>
  );
}
