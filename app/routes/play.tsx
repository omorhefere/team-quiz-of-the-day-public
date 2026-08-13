import { Form, Link, redirect, useActionData, useNavigation } from "react-router";
import type { Route } from "./+types/play";
import { getDb } from "~/db/client";
import {
  AlreadySubmittedError,
  getPublishedDeck,
  getSubmission,
  getTeamById,
  getTeamDailyStanding,
  submitAnswers,
} from "~/db/repository";
import { currentUtcDeckDate } from "~/lib/date";
import { env } from "~/lib/env";
import { clearTeam, getTeamId } from "~/lib/session.server";
import { answersSchema, MAX_SCORE, QUESTIONS_PER_DECK } from "~/lib/quiz";
import type { ValidQuestion } from "~/lib/quiz";

export function meta() {
  return [{ title: "Today's Quiz · Team Quiz of the Day" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const teamId = await getTeamId(request);
  if (!teamId) throw redirect("/");

  const db = await getDb();
  const team = await getTeamById(db, teamId);
  if (!team) {
    // Cookie points at a deleted team — clear it and start over.
    throw redirect("/", { headers: { "Set-Cookie": await clearTeam(request) } });
  }

  const deckDate = currentUtcDeckDate();
  const deck = await getPublishedDeck(db, deckDate);
  if (!deck) {
    return { state: "no-deck" as const, deckDate, team };
  }

  // Already played today → show results (PRG target).
  const existing = await getSubmission(db, team.id, deckDate);
  if (existing) {
    const standing = await getTeamDailyStanding(db, team.id, deckDate);
    // Safe to reveal correct answers now — the team has submitted.
    const review = (deck.questions as ValidQuestion[]).map((q, i) => ({
      q: q.q,
      choices: q.choices,
      correctIdx: q.correct_idx,
      yourIdx: existing.answers[i] ?? null,
    }));
    return {
      state: "done" as const,
      deckDate,
      team,
      score: existing.score,
      rank: standing?.rank ?? existing.rankSnapshot ?? 1,
      total: standing?.total ?? 1,
      ogUrl: `${env.appUrl}/og/team/${team.id}/${deckDate}`,
      appUrl: env.appUrl,
      review,
    };
  }

  // Strip correct answers before sending the deck to the client.
  const questions = (deck.questions as ValidQuestion[]).map((q) => ({
    q: q.q,
    choices: q.choices,
  }));
  return { state: "play" as const, deckDate, team, questions };
}

export async function action({ request }: Route.ActionArgs) {
  const teamId = await getTeamId(request);
  if (!teamId) throw redirect("/");

  const db = await getDb();
  const team = await getTeamById(db, teamId);
  if (!team) throw redirect("/");

  const deckDate = currentUtcDeckDate();
  const deck = await getPublishedDeck(db, deckDate);
  if (!deck) throw redirect("/play");

  const form = await request.formData();
  const rawAnswers: number[] = [];
  for (let i = 0; i < QUESTIONS_PER_DECK; i++) {
    const raw = form.get(`q-${i}`);
    if (raw === null) {
      return { error: "Please answer every question before submitting." };
    }
    rawAnswers.push(Number(raw));
  }

  // Validate shape + range (10 answers, each 0–3) before it reaches the DB.
  const parsed = answersSchema.safeParse(rawAnswers);
  if (!parsed.success) {
    return { error: "Please answer every question before submitting." };
  }
  const answers = parsed.data;

  try {
    await submitAnswers(db, { teamId: team.id, deck, answers });
  } catch (err) {
    if (err instanceof AlreadySubmittedError) {
      // Race / double-submit: fall through to the results view.
      throw redirect("/play");
    }
    throw err;
  }

  // Post/Redirect/Get → refresh-safe; loader renders the results state.
  throw redirect("/play");
}

export default function Play({ loaderData }: Route.ComponentProps) {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submitting = navigation.state === "submitting";

  if (loaderData.state === "no-deck") {
    return (
      <Shell team={loaderData.team}>
        <div className="text-center">
          <p className="text-6xl">🌙</p>
          <h1 className="mt-6 text-2xl font-bold">No quiz yet for today</h1>
          <p className="mt-3 text-gray-400">
            Today&rsquo;s deck ({loaderData.deckDate} UTC) hasn&rsquo;t been
            published. Check back soon — a new quiz drops every day.
          </p>
          <Link
            to="/leaderboard"
            className="mt-8 inline-block text-indigo-400 hover:underline"
          >
            See the leaderboard →
          </Link>
        </div>
      </Shell>
    );
  }

  if (loaderData.state === "done") {
    return (
      <Shell team={loaderData.team}>
        <Results data={loaderData} />
      </Shell>
    );
  }

  // state === "play"
  return (
    <Shell team={loaderData.team}>
      <header className="mb-8 text-center">
        <p className="text-sm uppercase tracking-widest text-indigo-400">
          {loaderData.deckDate} · Today&rsquo;s Deck
        </p>
        <h1 className="mt-2 text-2xl font-bold">10 questions. Play together.</h1>
      </header>

      {actionData?.error && (
        <p className="mb-6 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-center text-red-300">
          {actionData.error}
        </p>
      )}

      <Form method="post" className="space-y-8">
        {loaderData.questions.map((question, qi) => (
          <fieldset
            key={qi}
            className="rounded-xl border border-gray-800 bg-gray-900/50 p-5"
          >
            <legend className="px-2 text-sm text-gray-500">
              Question {qi + 1} of {QUESTIONS_PER_DECK}
            </legend>
            <p className="mb-4 text-lg font-medium">{question.q}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {question.choices.map((choice, ci) => (
                <label
                  key={ci}
                  className="flex cursor-pointer items-center gap-3 rounded-lg border border-gray-800 px-4 py-3 transition hover:border-indigo-500 has-[:checked]:border-indigo-500 has-[:checked]:bg-indigo-500/10"
                >
                  <input
                    type="radio"
                    name={`q-${qi}`}
                    value={ci}
                    required
                    className="accent-indigo-500"
                  />
                  <span>{choice}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ))}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-indigo-600 px-4 py-4 text-lg font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-60"
        >
          {submitting ? "Scoring…" : "Submit our answers"}
        </button>
      </Form>
    </Shell>
  );
}

function Results({
  data,
}: {
  data: Extract<Route.ComponentProps["loaderData"], { state: "done" }>;
}) {
  const shareText = `Team Quiz of the Day — ${data.deckDate}\n${data.team.displayName}: ${data.score}/${MAX_SCORE} · Rank #${data.rank} of ${data.total}\n${data.appUrl}`;
  return (
    <div className="text-center">
      <p className="text-sm uppercase tracking-widest text-indigo-400">
        {data.deckDate}
      </p>
      <h1 className="mt-2 text-3xl font-bold">{data.team.displayName}</h1>
      <p className="mt-6 text-6xl font-bold text-indigo-300">
        {data.score}
        <span className="text-2xl text-gray-500">/{MAX_SCORE}</span>
      </p>
      <p className="mt-3 text-lg text-gray-300">
        Rank <span className="font-bold">#{data.rank}</span> of {data.total}{" "}
        {data.total === 1 ? "team" : "teams"} today
      </p>

      <img
        src={data.ogUrl}
        alt="Shareable score card"
        width={600}
        height={315}
        className="mx-auto mt-8 w-full max-w-md rounded-xl border border-gray-800"
      />

      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <a
          href={data.ogUrl}
          download={`otl-${data.deckDate}.png`}
          className="rounded-lg bg-indigo-600 px-5 py-3 font-semibold text-white hover:bg-indigo-500"
        >
          Download share card
        </a>
        <CopyButton text={shareText} />
        <Link
          to="/leaderboard"
          className="rounded-lg border border-gray-700 px-5 py-3 font-semibold text-gray-200 hover:bg-gray-900"
        >
          Leaderboard
        </Link>
      </div>
      <p className="mt-6 text-sm text-gray-500">
        Come back tomorrow for a new deck. One play per team per day.
      </p>

      <AnswerReview review={data.review} />
    </div>
  );
}

function AnswerReview({
  review,
}: {
  review: Extract<
    Route.ComponentProps["loaderData"],
    { state: "done" }
  >["review"];
}) {
  return (
    <div className="mt-12 text-left">
      <h2 className="mb-4 text-center text-lg font-semibold text-gray-300">
        Review the answers
      </h2>
      <ol className="space-y-4">
        {review.map((item, qi) => {
          const gotItRight = item.yourIdx === item.correctIdx;
          return (
            <li
              key={qi}
              className="rounded-xl border border-gray-800 bg-gray-900/50 p-5"
            >
              <div className="mb-3 flex items-start gap-2">
                <span className="text-lg">{gotItRight ? "✅" : "❌"}</span>
                <p className="font-medium">
                  {qi + 1}. {item.q}
                </p>
              </div>
              <div className="space-y-2">
                {item.choices.map((choice, ci) => {
                  const isCorrect = ci === item.correctIdx;
                  const isYours = ci === item.yourIdx;
                  return (
                    <div
                      key={ci}
                      className={`flex items-center justify-between rounded-lg border px-4 py-2 text-sm ${
                        isCorrect
                          ? "border-green-500/50 bg-green-500/10 text-green-200"
                          : isYours
                            ? "border-red-500/50 bg-red-500/10 text-red-200"
                            : "border-gray-800 text-gray-400"
                      }`}
                    >
                      <span>{choice}</span>
                      <span className="ml-3 shrink-0 text-xs font-medium">
                        {isCorrect && "Correct"}
                        {isYours && !isCorrect && "Your pick"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        navigator.clipboard?.writeText(text);
        const el = e.currentTarget;
        const original = el.textContent;
        el.textContent = "Copied!";
        setTimeout(() => (el.textContent = original), 1500);
      }}
      className="rounded-lg border border-gray-700 px-5 py-3 font-semibold text-gray-200 hover:bg-gray-900"
    >
      Copy result
    </button>
  );
}

function Shell({
  team,
  children,
}: {
  team: { displayName: string; code: string };
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-gray-950 text-gray-100">
      <div className="mx-auto max-w-2xl px-6 py-10">
        <div className="mb-10 flex items-center justify-between text-sm">
          <span className="font-semibold text-gray-300">{team.displayName}</span>
          <span className="font-mono text-gray-600">{team.code}</span>
        </div>
        {children}
      </div>
    </main>
  );
}
