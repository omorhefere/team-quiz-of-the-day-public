import { Form, Link, data, redirect, useActionData, useNavigation } from "react-router";
import type { Route } from "./+types/league.admin.setup";
import { getDb } from "~/db/client";
import { getLeagueByCode, isLeagueAdmin } from "~/db/repository";
import { getTeamId } from "~/lib/session.server";
import { getLeagueAdminByLeagueId, createLeagueAdmin } from "~/lib/admin-auth.server";
import { commitAdminSession } from "~/lib/admin-session.server";

export async function loader({ request, params }: Route.LoaderArgs) {
  const code = params.code as string;
  const db = await getDb();
  const league = await getLeagueByCode(db, code);
  if (!league) throw new Response("League not found", { status: 404 });

  // Only the league creator (via team cookie) can set up admin credentials.
  const teamId = await getTeamId(request);
  if (!teamId || !isLeagueAdmin(league, teamId)) throw redirect(`/league/${code}`);

  // If credentials already exist, go straight to login.
  const existing = await getLeagueAdminByLeagueId(db, league.id);
  if (existing) throw redirect(`/league/${code}/admin/login`);

  return { leagueName: league.name };
}

export async function action({ request, params }: Route.ActionArgs) {
  const code = params.code as string;
  const db = await getDb();
  const league = await getLeagueByCode(db, code);
  if (!league) throw new Response("League not found", { status: 404 });

  const teamId = await getTeamId(request);
  if (!teamId || !isLeagueAdmin(league, teamId)) throw redirect(`/league/${code}`);

  const form = await request.formData();
  const email = String(form.get("email") ?? "").toLowerCase().trim();
  const password = String(form.get("password") ?? "");
  const confirm = String(form.get("confirm") ?? "");

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return data({ error: "Please enter a valid email address.", loginUrl: null }, { status: 400 });
  }
  if (password.length < 8) {
    return data({ error: "Password must be at least 8 characters.", loginUrl: null }, { status: 400 });
  }
  if (password !== confirm) {
    return data({ error: "Passwords don't match.", loginUrl: null }, { status: 400 });
  }

  let adminId: string;
  try {
    adminId = await createLeagueAdmin(db, league.id, email, password);
  } catch (err: unknown) {
    // Postgres unique-constraint violation on email
    const code = (err as { cause?: { code?: string } })?.cause?.code;
    if (code === "23505") {
      return data(
        { error: "An admin account with this email already exists. Sign in instead.", loginUrl: `/league/${league.code}/admin/login` },
        { status: 409 },
      );
    }
    throw err;
  }
  const cookie = await commitAdminSession(request, adminId, league.id);

  throw redirect(`/league/${league.code}/manage`, {
    headers: { "Set-Cookie": cookie },
  });
}

export default function AdminSetup({ loaderData }: Route.ComponentProps) {
  const result = useActionData<typeof action>();
  const navigation = useNavigation();
  const submitting = navigation.state === "submitting";

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-950 px-6 text-gray-100">
      <div className="w-full max-w-sm">
        <p className="text-sm font-semibold uppercase tracking-widest text-indigo-400">
          {loaderData.leagueName}
        </p>
        <h1 className="mt-3 text-2xl font-bold">Set up your admin account</h1>
        <p className="mt-3 text-sm text-gray-400">
          Create an email and password so you can manage this league from any device.
        </p>

        <Form method="post" className="mt-8 space-y-4">
          {result?.error && (
            <div className="rounded-lg bg-red-900/40 px-4 py-3 text-sm text-red-300">
              {result.error}
              {result.loginUrl && (
                <Link to={result.loginUrl} className="ml-1 underline underline-offset-2 hover:text-red-200">
                  Sign in →
                </Link>
              )}
            </div>
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
              minLength={8}
              autoComplete="new-password"
              disabled={submitting}
              className="w-full rounded-lg border border-gray-700 bg-gray-900 px-4 py-3 disabled:opacity-50"
            />
          </div>
          <div className="space-y-2">
            <label className="block text-sm text-gray-400" htmlFor="confirm">Confirm password</label>
            <input
              id="confirm"
              name="confirm"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              disabled={submitting}
              className="w-full rounded-lg border border-gray-700 bg-gray-900 px-4 py-3 disabled:opacity-50"
            />
          </div>
          <button
            disabled={submitting}
            className="w-full rounded-lg bg-indigo-600 px-4 py-3 font-semibold disabled:opacity-60"
          >
            {submitting ? "Creating account…" : "Create admin account →"}
          </button>
        </Form>
      </div>
    </main>
  );
}
