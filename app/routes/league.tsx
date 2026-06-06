import { Form, Link } from "react-router";
import type { Route } from "./+types/league";
import { getDb } from "~/db/client";
import {
  getLeagueByCode,
  getLeagueDailyLeaderboard,
  getLeagueWeeklyLeaderboard,
  isLeagueMember,
} from "~/db/repository";
import { currentUtcDeckDate, weeklyWindow } from "~/lib/date";
import { getTeamId } from "~/lib/session.server";
import { MAX_SCORE } from "~/lib/quiz";

export function meta({ data }: Route.MetaArgs) {
  return [{ title: `${data?.league.name ?? "League"} · Office Trivia League` }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const db = await getDb();
  const league = await getLeagueByCode(db, params.code);
  if (!league) {
    throw new Response("League not found", { status: 404 });
  }

  const deckDate = currentUtcDeckDate();
  const teamId = await getTeamId(request);
  const [daily, weekly, member] = await Promise.all([
    getLeagueDailyLeaderboard(db, league.id, deckDate),
    getLeagueWeeklyLeaderboard(db, league.id, weeklyWindow(deckDate)),
    teamId ? isLeagueMember(db, league.id, teamId) : Promise.resolve(false),
  ]);

  return { league, deckDate, daily, weekly, teamId, member };
}

export default function LeaguePage({ loaderData }: Route.ComponentProps) {
  const { league, deckDate, daily, weekly, teamId, member } = loaderData;
  return (
    <main className="min-h-screen bg-gray-950 text-gray-100">
      <div className="mx-auto max-w-2xl px-6 py-12">
        <div className="mb-2 flex items-center justify-between">
          <Link to="/" className="text-sm text-indigo-400 hover:underline">
            ← Home
          </Link>
          <Link to="/leaderboard" className="text-sm text-gray-500 hover:underline">
            Global leaderboard
          </Link>
        </div>

        <h1 className="text-3xl font-bold">{league.name}</h1>
        <p className="mt-1 text-sm text-gray-400">
          Private league · invite code{" "}
          <span className="select-all font-mono text-indigo-300">{league.code}</span>
        </p>

        {teamId && !member && (
          <Form method="post" action="/leagues/join" className="mt-4">
            <input type="hidden" name="code" value={league.code} />
            <button className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500">
              Join this league
            </button>
          </Form>
        )}
        {member && (
          <p className="mt-4 inline-block rounded-lg border border-indigo-500/40 bg-indigo-500/10 px-3 py-1 text-xs text-indigo-300">
            Your team is in this league. Share the code to add more teams.
          </p>
        )}

        <Section
          title={`Today · ${deckDate}`}
          empty="No member has played today yet."
        >
          {daily.map((row) => (
            <Row
              key={row.teamId}
              rank={row.rank}
              name={row.displayName}
              value={`${row.score}/${MAX_SCORE}`}
              highlight={row.teamId === teamId}
            />
          ))}
        </Section>

        <Section
          title="This week"
          subtitle="Total score across the last 7 days"
          empty="No scores in this league this week yet."
        >
          {weekly.map((row) => (
            <Row
              key={row.teamId}
              rank={row.rank}
              name={row.displayName}
              value={`${row.total} pts`}
              meta={`${row.daysPlayed} ${row.daysPlayed === 1 ? "day" : "days"}`}
              highlight={row.teamId === teamId}
            />
          ))}
        </Section>
      </div>
    </main>
  );
}

function Section({
  title,
  subtitle,
  empty,
  children,
}: {
  title: string;
  subtitle?: string;
  empty: string;
  children: React.ReactNode[];
}) {
  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold">{title}</h2>
      {subtitle && <p className="mb-2 text-sm text-gray-500">{subtitle}</p>}
      <div className="mt-3 divide-y divide-gray-800 overflow-hidden rounded-xl border border-gray-800">
        {children.length > 0 ? (
          children
        ) : (
          <p className="px-4 py-8 text-center text-gray-500">{empty}</p>
        )}
      </div>
    </section>
  );
}

function Row({
  rank,
  name,
  value,
  meta,
  highlight,
}: {
  rank: number;
  name: string;
  value: string;
  meta?: string;
  highlight?: boolean;
}) {
  const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : null;
  return (
    <div
      className={`flex items-center gap-4 px-4 py-3 ${highlight ? "bg-indigo-500/10" : ""}`}
    >
      <span className="w-8 shrink-0 text-center font-mono text-gray-500">
        {medal ?? rank}
      </span>
      <span className="flex-1 truncate font-medium">
        {name}
        {highlight && <span className="ml-2 text-xs text-indigo-400">you</span>}
      </span>
      {meta && <span className="text-sm text-gray-500">{meta}</span>}
      <span className="font-semibold text-indigo-300">{value}</span>
    </div>
  );
}
