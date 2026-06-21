import { Form, data, redirect, useActionData, useNavigation } from "react-router";
import type { Route } from "./+types/league.admin.login";
import { getDb } from "~/db/client";
import { getLeagueByCode } from "~/db/repository";
import { verifyLeagueAdminPassword } from "~/lib/admin-auth.server";
import { commitAdminSession, getAdminSession } from "~/lib/admin-session.server";

export async function loader({ request, params }: Route.LoaderArgs) {
  const code = params.code as string;
  const db = await getDb();
  const league = await getLeagueByCode(db, code);
  if (!league) throw new Response("League not found", { status: 404 });

  // Already logged in — go straight to the league page.
  const adminSession = await getAdminSession(request);
  if (adminSession?.leagueId === league.id) throw redirect(`/league/${code}`);

  return { leagueName: league.name };
}

export async function action({ request, params }: Route.ActionArgs) {
  const code = params.code as string;
  const db = await getDb();
  const league = await getLeagueByCode(db, code);
  if (!league) throw new Response("League not found", { status: 404 });

  const form = await request.formData();
  const email = String(form.get("email") ?? "").toLowerCase().trim();
  const password = String(form.get("password") ?? "");

  const admin = await verifyLeagueAdminPassword(db, league.id, email, password);
  if (!admin) {
    return data({ error: "Incorrect email or password." }, { status: 401 });
  }

  const cookie = await commitAdminSession(request, admin.id, league.id);
  throw redirect(`/league/${league.code}`, {
    headers: { "Set-Cookie": cookie },
  });
}

export default function AdminLogin({ loaderData }: Route.ComponentProps) {
  const result = useActionData<typeof action>();
  const navigation = useNavigation();
  const submitting = navigation.state === "submitting";

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-950 px-6 text-gray-100">
      <div className="w-full max-w-sm">
        <p className="text-sm font-semibold uppercase tracking-widest text-indigo-400">
          {loaderData.leagueName}
        </p>
        <h1 className="mt-3 text-2xl font-bold">League admin login</h1>

        <Form method="post" className="mt-8 space-y-4">
          {result?.error && (
            <p className="rounded-lg bg-red-900/40 px-4 py-3 text-sm text-red-300">
              {result.error}
            </p>
          )}
          <div className="space-y-2">
            <label className="block text-sm text-gray-400" htmlFor="email">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              disabled={submitting}
              className="w-full rounded-lg border border-gray-700 bg-gray-900 px-4 py-3 disabled:opacity-50"
            />
          </div>
          <div className="space-y-2">
            <label className="block text-sm text-gray-400" htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              disabled={submitting}
              className="w-full rounded-lg border border-gray-700 bg-gray-900 px-4 py-3 disabled:opacity-50"
            />
          </div>
          <button
            disabled={submitting}
            className="w-full rounded-lg bg-indigo-600 px-4 py-3 font-semibold disabled:opacity-60"
          >
            {submitting ? "Signing in…" : "Sign in →"}
          </button>
        </Form>
      </div>
    </main>
  );
}
