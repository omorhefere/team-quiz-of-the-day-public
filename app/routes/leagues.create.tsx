import { Form, data, redirect, useActionData, useNavigation } from "react-router";
import type { Route } from "./+types/leagues.create";
import { getDb } from "~/db/client";
import { createLeague } from "~/db/repository";
import { createLeagueAdmin } from "~/lib/admin-auth.server";
import { commitAdminSession } from "~/lib/admin-session.server";

export function meta() {
  return [{ title: "Create a league · Team Quiz of the Day" }];
}

export async function loader() {
  return null;
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const name = String(form.get("name") ?? "").trim().slice(0, 30);
  const email = String(form.get("email") ?? "").toLowerCase().trim();
  const password = String(form.get("password") ?? "");
  const confirm = String(form.get("confirm") ?? "");

  if (!name) return data({ error: "Enter a league name." }, { status: 400 });
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return data({ error: "Enter a valid email address." }, { status: 400 });
  }
  if (password.length < 8) {
    return data({ error: "Password must be at least 8 characters." }, { status: 400 });
  }
  if (password !== confirm) {
    return data({ error: "Passwords don't match." }, { status: 400 });
  }

  const db = await getDb();
  const league = await createLeague(db, { name, createdByTeamId: null });

  let adminId: string;
  try {
    adminId = await createLeagueAdmin(db, league.id, email, password);
  } catch (err: unknown) {
    const code = (err as { cause?: { code?: string } })?.cause?.code;
    if (code === "23505") {
      return data(
        { error: "An admin account with this email already exists." },
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

export default function CreateLeague() {
  const result = useActionData<typeof action>();
  const navigation = useNavigation();
  const submitting = navigation.state === "submitting";

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-950 px-6 text-gray-100">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold">Create a league</h1>
        <p className="mt-2 text-sm text-gray-400">
          Set up your league and admin account in one step.
        </p>

        <Form method="post" className="mt-8 space-y-4">
          {result?.error && (
            <p className="rounded-lg bg-red-900/40 px-4 py-3 text-sm text-red-300">
              {result.error}
            </p>
          )}

          <div className="space-y-2">
            <label className="block text-sm text-gray-400" htmlFor="name">League name</label>
            <input
              id="name"
              name="name"
              type="text"
              required
              maxLength={30}
              placeholder="e.g. Platform Engineering"
              disabled={submitting}
              className="w-full rounded-lg border border-gray-700 bg-gray-900 px-4 py-3 disabled:opacity-50"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm text-gray-400" htmlFor="email">Your email</label>
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
            {submitting ? "Creating league…" : "Create league →"}
          </button>
        </Form>
      </div>
    </main>
  );
}
