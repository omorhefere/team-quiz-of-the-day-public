import { Form, Link, redirect } from "react-router";
import type { Route } from "./+types/home";
import { getDb } from "~/db/client";
import { getTeamById } from "~/db/repository";
import { getTeamId } from "~/lib/session.server";

export function meta(_: Route.MetaArgs) {
  return [
    { title: "Office Trivia League" },
    {
      name: "description",
      content:
        "One daily trivia deck. Every team. One global leaderboard. Play with your team after standup.",
    },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const teamId = await getTeamId(request);
  if (teamId) {
    const db = await getDb();
    const team = await getTeamById(db, teamId);
    // Bonded device → straight to today's quiz.
    if (team) throw redirect("/play");
  }
  return null;
}

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-950 text-gray-100">
      <div className="mx-auto flex max-w-2xl flex-col items-center px-6 py-20 text-center">
        <p className="mb-4 text-sm font-semibold uppercase tracking-widest text-indigo-400">
          Office Trivia League
        </p>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          One quiz a day.
          <br />
          Every team. One league.
        </h1>
        <p className="mt-5 max-w-md text-lg text-gray-400">
          Gather the team after standup, play today&rsquo;s 10 questions
          together, and climb the global leaderboard.
        </p>

        <div className="mt-12 w-full max-w-sm space-y-8">
          {/* New team */}
          <Form method="post" action="/register" className="space-y-3">
            <label
              htmlFor="displayName"
              className="block text-left text-sm font-medium text-gray-300"
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

          {/* Returning team */}
          <Form method="post" action="/join" className="space-y-3">
            <label
              htmlFor="code"
              className="block text-left text-sm font-medium text-gray-300"
            >
              Already have a code?
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
              Play as our team
            </button>
          </Form>
        </div>

        <Link
          to="/leaderboard"
          className="mt-12 text-sm text-gray-500 underline-offset-4 hover:text-gray-300 hover:underline"
        >
          View the global leaderboard →
        </Link>
      </div>
    </main>
  );
}
