import { Form, Link, data, redirect, useActionData, useNavigation } from "react-router";
import { Nav } from "~/components/Nav";
import type { Route } from "./+types/home";
import { getDb } from "~/db/client";
import {
  getLeagueById,
  getLeaguesForTeam,
  getPublishedDeck,
  getSubmission,
  getTeamById,
  getTeamHistory,
  getTeamStats,
} from "~/db/repository";
import { currentUtcDeckDate } from "~/lib/date";
import { verifyAdminPasswordByEmail } from "~/lib/admin-auth.server";
import { commitAdminSession } from "~/lib/admin-session.server";
import { getTeamId } from "~/lib/session.server";
import { MAX_SCORE } from "~/lib/quiz";

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  // "Create league" from landing — redirect to register with league name in URL.
  if (intent === "create-league") {
    const name = String(form.get("name") ?? "").trim().slice(0, 30);
    if (!name) return data({ error: "Enter a league name." }, { status: 400 });
    throw redirect(`/register?league=${encodeURIComponent(name)}`);
  }

  // Admin sign-in.
  const email = String(form.get("email") ?? "").toLowerCase().trim();
  const password = String(form.get("password") ?? "");

  if (!email || !password) {
    return data({ error: "Email and password are required." }, { status: 400 });
  }

  const db = await getDb();
  const admin = await verifyAdminPasswordByEmail(db, email, password);
  if (!admin) {
    return data({ error: "Incorrect email or password." }, { status: 401 });
  }

  const league = await getLeagueById(db, admin.leagueId);
  if (!league) {
    return data({ error: "League not found." }, { status: 404 });
  }

  const cookie = await commitAdminSession(request, admin.id, admin.leagueId);
  throw redirect(`/league/${league.code}/sources`, {
    headers: { "Set-Cookie": cookie },
  });
}

export function meta(_: Route.MetaArgs) {
  return [
    { title: "Team Quiz of the Day" },
    {
      name: "description",
      content:
        "One daily trivia deck. Every team. One global leaderboard. Play with your team after standup.",
    },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const teamId = await getTeamId(request);
  if (!teamId) return { state: "landing" as const };

  const db = await getDb();
  const team = await getTeamById(db, teamId);
  // Stale cookie (team deleted) → fall back to the landing page.
  if (!team) return { state: "landing" as const };

  const deckDate = currentUtcDeckDate();
  const [deck, submission, stats, history, leagues] = await Promise.all([
    getPublishedDeck(db, deckDate),
    getSubmission(db, team.id, deckDate),
    getTeamStats(db, team.id),
    getTeamHistory(db, team.id),
    getLeaguesForTeam(db, team.id),
  ]);

  const todayStatus = !deck ? "no-deck" : submission ? "played" : "available";

  return {
    state: "dashboard" as const,
    team,
    deckDate,
    todayStatus,
    todayScore: submission?.score ?? null,
    stats,
    history,
    leagues: leagues.map((l) => ({
      code: l.league.code,
      name: l.league.name,
      memberCount: l.memberCount,
      isCreator: l.league.createdByTeamId === team.id,
    })),
  };
}

export default function Home({ loaderData, actionData }: Route.ComponentProps) {
  if (loaderData.state === "dashboard") {
    return <Dashboard data={loaderData} />;
  }
  return <Landing adminError={actionData?.error} />;
}

// ---------------------------------------------------------------------------
// Bonded team dashboard
// ---------------------------------------------------------------------------

function Dashboard({
  data,
}: {
  data: Extract<Route.ComponentProps["loaderData"], { state: "dashboard" }>;
}) {
  const navigation = useNavigation();
  const navigatingToPlay =
    navigation.state === "loading" && navigation.location?.pathname === "/play";
  const creatingLeague =
    navigation.state === "submitting" &&
    navigation.formAction?.endsWith("/leagues/create");
  const joiningLeague =
    navigation.state === "submitting" &&
    navigation.formAction?.endsWith("/leagues/join");
  return (
    <main className="min-h-screen bg-gray-950 text-gray-100">
      <Nav
        items={[
          { to: "/play", label: "Play" },
          { to: "/leaderboard", label: "Leaderboard" },
        ]}
        showSignOut
      />
      <div className="mx-auto max-w-2xl px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold">{data.team.displayName}</h1>
          <p className="font-mono text-sm text-gray-500">{data.team.code}</p>
        </div>

        {/* Today */}
        <section className="rounded-2xl border border-gray-800 bg-gray-900/50 p-6">
          <p className="text-sm uppercase tracking-widest text-indigo-400">
            Today · {data.deckDate}
          </p>
          {data.todayStatus === "available" && (
            <>
              <h2 className="mt-2 text-xl font-semibold">Today&rsquo;s quiz is ready</h2>
              <Link
                to="/play"
                className={`mt-4 inline-block rounded-lg bg-indigo-600 px-6 py-3 text-lg font-semibold text-white hover:bg-indigo-500 ${navigatingToPlay ? "pointer-events-none opacity-60" : ""}`}
                aria-disabled={navigatingToPlay}
              >
                {navigatingToPlay ? "Loading quiz…" : "Play today's quiz →"}
              </Link>
            </>
          )}
          {data.todayStatus === "played" && (
            <>
              <h2 className="mt-2 text-xl font-semibold">
                You scored {data.todayScore}/{MAX_SCORE} today
              </h2>
              <div className="mt-4 flex flex-wrap gap-3">
                <Link
                  to="/play"
                  className="rounded-lg bg-indigo-600 px-5 py-3 font-semibold text-white hover:bg-indigo-500"
                >
                  See results &amp; review
                </Link>
                <Link
                  to="/leaderboard"
                  className="rounded-lg border border-gray-700 px-5 py-3 font-semibold text-gray-200 hover:bg-gray-900"
                >
                  Leaderboard
                </Link>
              </div>
            </>
          )}
          {data.todayStatus === "no-deck" && (
            <h2 className="mt-2 text-xl font-semibold text-gray-300">
              🌙 No quiz today — check back tomorrow.
            </h2>
          )}
        </section>

        {/* Stats */}
        <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Streak" value={`${data.stats.currentStreak}🔥`} />
          <Stat label="Total pts" value={data.stats.totalPoints} />
          <Stat label="Best" value={`${data.stats.bestScore}/${MAX_SCORE}`} />
          <Stat label="Days played" value={data.stats.daysPlayed} />
        </section>

        {/* Recent history */}
        {data.history.length > 0 && (
          <section className="mt-8">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-400">
              Recent quizzes
            </h3>
            <div className="divide-y divide-gray-800 overflow-hidden rounded-xl border border-gray-800">
              {data.history.map((h) => (
                <div
                  key={h.deckDate}
                  className="flex items-center justify-between px-4 py-2.5 text-sm"
                >
                  <span className="text-gray-400">{h.deckDate}</span>
                  <span className="font-semibold text-indigo-300">
                    {h.score}/{MAX_SCORE}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Leagues */}
        <section className="mt-8">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-400">
            Your leagues
          </h3>
          {data.leagues.length > 0 ? (
            <div className="mb-4 divide-y divide-gray-800 overflow-hidden rounded-xl border border-gray-800">
              {data.leagues.map((l) => (
                <div
                  key={l.code}
                  className="flex items-center justify-between px-4 py-3"
                >
                  <Link to={`/league/${l.code}`} className="font-medium hover:text-indigo-300">
                    {l.name}
                  </Link>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-gray-500">
                      {l.memberCount} {l.memberCount === 1 ? "team" : "teams"}
                    </span>
                    {l.isCreator && (
                      <Link
                        to={`/league/${l.code}/sources`}
                        className="rounded-md border border-gray-700 px-2.5 py-1 text-xs font-semibold text-gray-300 hover:border-indigo-500 hover:text-indigo-300"
                      >
                        Manage →
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mb-4 text-sm text-gray-500">
              You&rsquo;re not in any leagues yet. Create one and invite other
              teams, or join with a code.
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <Form
              method="post"
              action="/leagues/create"
              className="space-y-2 rounded-xl border border-gray-800 p-4"
            >
              <label className="block text-sm font-medium text-gray-300">
                Create a league
              </label>
              <input
                name="name"
                required
                maxLength={30}
                placeholder="e.g. Acme Engineering"
                className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm"
              />
              <button disabled={creatingLeague} className="w-full rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60">
                {creatingLeague ? "Creating…" : "Create & get invite code"}
              </button>
            </Form>

            <Form
              method="post"
              action="/leagues/join"
              className="space-y-2 rounded-xl border border-gray-800 p-4"
            >
              <label className="block text-sm font-medium text-gray-300">
                Join a league
              </label>
              <input
                name="code"
                required
                placeholder="JADE-LYNX-08"
                autoCapitalize="characters"
                className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm uppercase tracking-wider"
              />
              <button disabled={joiningLeague} className="w-full rounded-lg border border-gray-700 px-3 py-2 text-sm font-semibold text-gray-200 hover:bg-gray-900 disabled:opacity-60">
                {joiningLeague ? "Joining…" : "Join with code"}
              </button>
            </Form>
          </div>
        </section>

        <div className="mt-10 text-center">
          <Link
            to="/leaderboard"
            className="text-sm text-gray-500 hover:text-gray-300 hover:underline"
          >
            View the global leaderboard →
          </Link>
        </div>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4 text-center">
      <p className="text-2xl font-bold text-indigo-300">{value}</p>
      <p className="mt-1 text-xs uppercase tracking-wide text-gray-500">{label}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Anonymous landing
// ---------------------------------------------------------------------------

function Landing({ adminError }: { adminError?: string }) {
  const navigation = useNavigation();
  const signingIn = navigation.state === "submitting" && !navigation.formAction?.includes("/register") && !navigation.formAction?.includes("/join");
  return (
    <main className="min-h-screen bg-gray-950 text-gray-100">
      <div className="mx-auto max-w-4xl px-6 py-16">
        {/* Hero */}
        <div className="mb-12 text-center">
          <p className="mb-4 text-sm font-semibold uppercase tracking-widest text-indigo-400">
            Team Quiz of the Day
          </p>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            One quiz a day.
            <br />
            Every team. One league.
          </h1>
          <p className="mt-5 text-lg text-gray-400">
            Gather the team after standup, play today&rsquo;s 10 questions
            together, and climb the global leaderboard.
          </p>
        </div>

        {/* Two columns */}
        <div className="grid gap-6 sm:grid-cols-2">
          {/* Left: Player */}
          <div className="rounded-2xl border border-gray-800 bg-gray-900/50 p-6">
            <p className="mb-5 text-xs font-semibold uppercase tracking-widest text-indigo-400">
              Players
            </p>
            <div className="space-y-6">
              <Form method="post" action="/register" className="space-y-3">
                <label
                  htmlFor="displayName"
                  className="block text-sm font-medium text-gray-300"
                >
                  Start a new team
                </label>
                <input
                  id="displayName"
                  name="displayName"
                  type="text"
                  required
                  maxLength={30}
                  placeholder="e.g. Platform Engineering"
                  className="w-full rounded-lg border border-gray-700 bg-gray-900 px-4 py-3 text-base outline-none focus:border-indigo-500"
                />
                <button
                  type="submit"
                  className="w-full rounded-lg bg-indigo-600 px-4 py-3 font-semibold text-white transition hover:bg-indigo-500"
                >
                  Get our team code
                </button>
              </Form>

              <div className="flex items-center gap-3 text-xs text-gray-600">
                <span className="h-px flex-1 bg-gray-800" />
                OR
                <span className="h-px flex-1 bg-gray-800" />
              </div>

              <Form method="post" action="/join" className="space-y-3">
                <label
                  htmlFor="code"
                  className="block text-sm font-medium text-gray-300"
                >
                  Already have a team code?
                </label>
                <input
                  id="code"
                  name="code"
                  type="text"
                  required
                  placeholder="BLUE-FOX-71"
                  autoCapitalize="characters"
                  className="w-full rounded-lg border border-gray-700 bg-gray-900 px-4 py-3 text-base uppercase tracking-wider outline-none focus:border-indigo-500"
                />
                <button
                  type="submit"
                  className="w-full rounded-lg border border-gray-700 px-4 py-3 font-semibold text-gray-200 transition hover:bg-gray-900"
                >
                  Play as your team
                </button>
              </Form>
            </div>
          </div>

          {/* Right: League admin */}
          <div className="rounded-2xl border border-gray-800 bg-gray-900/50 p-6">
            <p className="mb-5 text-xs font-semibold uppercase tracking-widest text-indigo-400">
              League admins
            </p>
            <div className="space-y-6">
              <Form method="post" className="space-y-3">
                <input type="hidden" name="intent" value="create-league" />
                <label className="block text-sm font-medium text-gray-300">
                  Create a league
                </label>
                <input
                  name="name"
                  required
                  maxLength={30}
                  placeholder="e.g. Acme Engineering"
                  className="w-full rounded-lg border border-gray-700 bg-gray-900 px-4 py-3 text-base outline-none focus:border-indigo-500"
                />
                <button
                  type="submit"
                  className="w-full rounded-lg bg-indigo-600 px-4 py-3 font-semibold text-white transition hover:bg-indigo-500"
                >
                  Create league
                </button>
              </Form>

              <div className="flex items-center gap-3 text-xs text-gray-600">
                <span className="h-px flex-1 bg-gray-800" />
                OR
                <span className="h-px flex-1 bg-gray-800" />
              </div>

              <Form method="post" className="space-y-3">
                <label className="block text-sm font-medium text-gray-300">
                  Sign in to manage your league
                </label>
                {adminError && (
                  <p className="rounded-lg bg-red-900/40 px-4 py-3 text-sm text-red-300">
                    {adminError}
                  </p>
                )}
                <input
                  name="email"
                  type="email"
                  required
                  placeholder="you@example.com"
                  autoComplete="email"
                  className="w-full rounded-lg border border-gray-700 bg-gray-900 px-4 py-3 text-base outline-none focus:border-indigo-500"
                />
                <input
                  name="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  placeholder="Password"
                  className="w-full rounded-lg border border-gray-700 bg-gray-900 px-4 py-3 text-base outline-none focus:border-indigo-500"
                />
                <button
                  type="submit"
                  disabled={signingIn}
                  className="w-full rounded-lg border border-gray-700 px-4 py-3 font-semibold text-gray-200 transition hover:bg-gray-900 disabled:opacity-60"
                >
                  {signingIn ? "Signing in…" : "Sign in →"}
                </button>
              </Form>
            </div>
          </div>
        </div>

        <div className="mt-10 text-center">
          <Link
            to="/leaderboard"
            className="text-sm text-gray-500 underline-offset-4 hover:text-gray-300 hover:underline"
          >
            View the global leaderboard →
          </Link>
        </div>
      </div>
    </main>
  );
}
