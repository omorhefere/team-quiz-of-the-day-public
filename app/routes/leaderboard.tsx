import { Link } from "react-router";
import type { Route } from "./+types/leaderboard";
import { getDb } from "~/db/client";
import { getDailyLeaderboard, getWeeklyLeaderboard } from "~/db/repository";
import { currentUtcDeckDate, weeklyWindow } from "~/lib/date";
import { getTeamId } from "~/lib/session.server";
import { MAX_SCORE } from "~/lib/quiz";

export function meta() {
  return [{ title: "Global Leaderboard · Team Quiz of the Day" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const db = await getDb();
  const deckDate = currentUtcDeckDate();
  const [daily, weekly, teamId] = await Promise.all([
    getDailyLeaderboard(db, deckDate),
    getWeeklyLeaderboard(db, weeklyWindow(deckDate)),
    getTeamId(request),
  ]);
  return { deckDate, daily, weekly, teamId };
}

export default function Leaderboard({ loaderData }: Route.ComponentProps) {
  const { deckDate, daily, weekly, teamId } = loaderData;
  return (
    <main className="min-h-screen bg-gray-950 text-gray-100">
      <div className="mx-auto max-w-2xl px-6 py-12">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-2xl font-bold">Global Leaderboard</h1>
          <Link to="/play" className="text-sm text-indigo-400 hover:underline">
            ← Today&rsquo;s quiz
          </Link>
        </div>

        <Section title={`Today · ${deckDate}`} empty="No teams have played yet today. Be the first!">
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
          empty="No scores this week yet."
          subtitle="Top 10 teams · total score across the last 7 days"
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
    <section className="mb-12">
      <h2 className="text-lg font-semibold">{title}</h2>
      {subtitle && <p className="mb-3 text-sm text-gray-500">{subtitle}</p>}
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
      className={`flex items-center gap-4 px-4 py-3 ${
        highlight ? "bg-indigo-500/10" : ""
      }`}
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
