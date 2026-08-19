import { Form, Link, redirect, useActionData, useNavigation } from "react-router";
import { SubmitButton } from "~/components/SubmitButton";
import type { Route } from "./+types/league.play";
import { getDb } from "~/db/client";
import {
  AlreadySubmittedError,
  getActiveCustomQuiz,
  getCustomQuizLeaderboard,
  getCustomQuizSubmission,
  getLeagueByCode,
  getTeamById,
  isLeagueMember,
  submitCustomQuizAnswers,
} from "~/db/repository";
import { getTeamId } from "~/lib/session.server";
import { customAnswersSchema, type ValidQuestion } from "~/lib/quiz";

export function meta({ data }: Route.MetaArgs) {
  return [{ title: `${data?.quizTitle ?? "Quiz"} · Team Quiz of the Day` }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const teamId = await getTeamId(request);
  const db = await getDb();
  const league = await getLeagueByCode(db, params.code);
  if (!league) throw new Response("League not found", { status: 404 });

  // Must be a member of this league to play its quiz.
  if (!teamId || !(await isLeagueMember(db, league.id, teamId))) {
    throw redirect(`/league/${league.code}`);
  }

  const quiz = await getActiveCustomQuiz(db, league);
  if (!quiz) {
    return { state: "no-quiz" as const, code: league.code, leagueName: league.name };
  }

  const team = await getTeamById(db, teamId);
  const total = (quiz.questions as ValidQuestion[]).length;
  const existing = await getCustomQuizSubmission(db, quiz.id, teamId);

  if (existing) {
    const leaderboard = await getCustomQuizLeaderboard(db, quiz.id);
    const rank =
      leaderboard.find((r) => r.teamId === teamId)?.rank ??
      existing.rankSnapshot ??
      1;
    const review = (quiz.questions as ValidQuestion[]).map((q, i) => ({
      q: q.q,
      choices: q.choices,
      correctIdx: q.correct_idx,
      yourIdx: existing.answers[i] ?? null,
    }));
    return {
      state: "done" as const,
      code: league.code,
      teamId,
      quizTitle: quiz.title,
      score: existing.score,
      total,
      rank,
      review,
      leaderboard,
    };
  }

  const questions = (quiz.questions as ValidQuestion[]).map((q) => ({
    q: q.q,
    choices: q.choices,
  }));
  return {
    state: "play" as const,
    code: league.code,
    quizTitle: quiz.title,
    teamName: team?.displayName ?? "",
    questions,
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  const teamId = await getTeamId(request);
  const db = await getDb();
  const league = await getLeagueByCode(db, params.code);
  if (!league) throw new Response("League not found", { status: 404 });
  if (!teamId || !(await isLeagueMember(db, league.id, teamId))) {
    throw redirect(`/league/${league.code}`);
  }
  const quiz = await getActiveCustomQuiz(db, league);
  if (!quiz) throw redirect(`/league/${league.code}/play`);

  const count = (quiz.questions as ValidQuestion[]).length;
  const form = await request.formData();
  const answers: number[] = [];
  for (let i = 0; i < count; i++) {
    const raw = form.get(`q-${i}`);
    if (raw === null) {
      return { error: "Please answer every question before submitting." };
    }
    answers.push(Number(raw));
  }
  const parsed = customAnswersSchema(count).safeParse(answers);
  if (!parsed.success) {
    return { error: "Please answer every question before submitting." };
  }

  try {
    await submitCustomQuizAnswers(db, { quiz, teamId, answers: parsed.data });
  } catch (err) {
    if (err instanceof AlreadySubmittedError) throw redirect(`/league/${league.code}/play`);
    throw err;
  }
  throw redirect(`/league/${league.code}/play`);
}

export default function LeaguePlay({ loaderData }: Route.ComponentProps) {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submitting = navigation.state === "submitting";

  if (loaderData.state === "no-quiz") {
    return (
      <Shell code={loaderData.code}>
        <div className="text-center">
          <p className="text-5xl">🗓️</p>
          <h1 className="mt-4 text-2xl font-bold">No quiz set yet</h1>
          <p className="mt-2 text-gray-400">
            Your league admin hasn&rsquo;t set a quiz of the day yet.
          </p>
        </div>
      </Shell>
    );
  }

  if (loaderData.state === "done") {
    return (
      <Shell code={loaderData.code}>
        <div className="text-center">
          <p className="text-sm uppercase tracking-widest text-indigo-400">
            {loaderData.quizTitle}
          </p>
          <p className="mt-4 text-6xl font-bold text-indigo-300">
            {loaderData.score}
            <span className="text-2xl text-gray-500">/{loaderData.total}</span>
          </p>
          <p className="mt-2 text-gray-300">
            Rank #{loaderData.rank} in your league
          </p>
        </div>

        <h2 className="mb-3 mt-10 text-sm font-semibold uppercase tracking-wide text-gray-400">
          League leaderboard
        </h2>
        <div className="divide-y divide-gray-800 overflow-hidden rounded-xl border border-gray-800">
          {loaderData.leaderboard.map((r) => (
            <div
              key={r.teamId}
              className={`flex items-center justify-between px-4 py-2.5 ${
                r.teamId === loaderData.teamId ? "bg-indigo-500/10" : ""
              }`}
            >
              <span className="text-sm">
                <span className="mr-3 font-mono text-gray-500">{r.rank}</span>
                {r.displayName}
              </span>
              <span className="font-semibold text-indigo-300">
                {r.score}/{loaderData.total}
              </span>
            </div>
          ))}
        </div>

        <AnswerReview review={loaderData.review} />
      </Shell>
    );
  }

  // play
  return (
    <Shell code={loaderData.code}>
      <header className="mb-8 text-center">
        <p className="text-sm uppercase tracking-widest text-indigo-400">
          {loaderData.teamName}
        </p>
        <h1 className="mt-2 text-2xl font-bold">{loaderData.quizTitle}</h1>
      </header>

      {actionData?.error && (
        <p className="mb-6 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-center text-red-300">
          {actionData.error}
        </p>
      )}

      <Form method="post" className="space-y-8">
        {loaderData.questions.map((question, qi) => (
          <fieldset key={qi} className="rounded-xl border border-gray-800 bg-gray-900/50 p-5">
            <legend className="px-2 text-sm text-gray-500">
              Question {qi + 1} of {loaderData.questions.length}
            </legend>
            <p className="mb-4 text-lg font-medium">{question.q}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {question.choices.map((choice, ci) => (
                <label
                  key={ci}
                  className="flex cursor-pointer items-center gap-3 rounded-lg border border-gray-800 px-4 py-3 transition hover:border-indigo-500 has-[:checked]:border-indigo-500 has-[:checked]:bg-indigo-500/10"
                >
                  <input type="radio" name={`q-${qi}`} value={ci} required className="accent-indigo-500" />
                  <span>{choice}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ))}
        <SubmitButton
          type="submit"
          pending={submitting}
          pendingLabel="Scoring…"
          spinnerClassName="h-5 w-5"
          className="w-full rounded-lg bg-indigo-600 px-4 py-4 text-lg font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-60"
        >
          Submit our answers
        </SubmitButton>
      </Form>
    </Shell>
  );
}

function AnswerReview({
  review,
}: {
  review: { q: string; choices: string[]; correctIdx: number; yourIdx: number | null }[];
}) {
  return (
    <div className="mt-10 text-left">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-400">
        Review
      </h2>
      <ol className="space-y-4">
        {review.map((item, qi) => {
          const right = item.yourIdx === item.correctIdx;
          return (
            <li key={qi} className="rounded-xl border border-gray-800 bg-gray-900/50 p-5">
              <p className="mb-3 font-medium">
                {right ? "✅" : "❌"} {qi + 1}. {item.q}
              </p>
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

function Shell({ code, children }: { code: string; children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-gray-950 text-gray-100">
      <div className="mx-auto max-w-2xl px-6 py-10">
        <Link to={`/league/${code}`} className="text-sm text-indigo-400 hover:underline">
          ← Back to league
        </Link>
        <div className="mt-6">{children}</div>
      </div>
    </main>
  );
}
