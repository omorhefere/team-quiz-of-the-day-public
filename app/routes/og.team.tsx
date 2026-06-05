import type { Route } from "./+types/og.team";
import { getDb } from "~/db/client";
import { getTeamDailyStanding } from "~/db/repository";
import { isDeckDate } from "~/lib/date";
import { renderScoreCardPng } from "~/lib/og-card";

export async function loader({ params }: Route.LoaderArgs) {
  const { teamId, deckDate } = params;
  if (!isDeckDate(deckDate)) {
    return new Response("Bad deck date", { status: 400 });
  }

  const db = await getDb();
  const standing = await getTeamDailyStanding(db, teamId, deckDate);
  if (!standing) {
    return new Response("Not found", { status: 404 });
  }

  const png = renderScoreCardPng({
    displayName: standing.team.displayName,
    deckDate,
    score: standing.score,
    rank: standing.rank,
    total: standing.total,
  });

  return new Response(png as unknown as BodyInit, {
    headers: {
      "Content-Type": "image/png",
      // Rank is live as more teams play, so cache briefly rather than forever.
      "Cache-Control": "public, max-age=300, stale-while-revalidate=600",
    },
  });
}
