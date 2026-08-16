import { Form, Link, redirect, useNavigation } from "react-router";
import { LeagueNav } from "~/components/Nav";
import type { Route } from "./+types/league.manage";
import {
  deleteCustomQuiz,
  getCustomQuiz,
  listCustomQuizzes,
  setActiveCustomQuiz,
  setCustomQuizSchedule,
  setLeaguePlan,
} from "~/db/repository";
import { requireLeagueAdmin } from "~/lib/custom-quiz.server";

export function meta() {
  return [{ title: "Manage quizzes · Team Quiz of the Day" }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { db, league } = await requireLeagueAdmin(request, params.code);
  const quizzes = await listCustomQuizzes(db, league.id);
  return {
    league: { code: league.code, name: league.name, plan: league.plan },
    activeQuizId: league.activeCustomQuizId,
    isDev: process.env.NODE_ENV !== "production",
    quizzes: quizzes.map((q) => ({
      id: q.id,
      title: q.title,
      count: (q.questions as unknown[]).length,
      scheduledDate: q.scheduledDate ?? null,
    })),
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  const { db, league } = await requireLeagueAdmin(request, params.code);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const quizId = form.get("quizId");

  if (intent === "playNow" && typeof quizId === "string") {
    const quiz = await getCustomQuiz(db, quizId);
    if (quiz && quiz.leagueId === league.id) {
      const today = new Date().toISOString().slice(0, 10);
      await setCustomQuizSchedule(db, quizId, today);
      await setActiveCustomQuiz(db, league.id, quizId);
    }
  } else if (intent === "setActive" && typeof quizId === "string") {
    // Ownership check: verify the quiz belongs to THIS league before acting.
    // Without this, an admin could set/delete quizzes from other leagues (IDOR).
    const quiz = await getCustomQuiz(db, quizId);
    if (quiz && quiz.leagueId === league.id) {
      await setActiveCustomQuiz(db, league.id, quizId);
    }
  } else if (intent === "clearActive") {
    await setActiveCustomQuiz(db, league.id, null);
  } else if (intent === "delete" && typeof quizId === "string") {
    const quiz = await getCustomQuiz(db, quizId);
    if (quiz && quiz.leagueId === league.id) {
      await deleteCustomQuiz(db, quizId);
    }
  } else if (intent === "schedule" && typeof quizId === "string") {
    const quiz = await getCustomQuiz(db, quizId);
    if (quiz && quiz.leagueId === league.id) {
      const scheduledDate = form.get("scheduledDate");
      await setCustomQuizSchedule(db, quizId, scheduledDate ? String(scheduledDate) : null);
    }
  } else if (intent === "setPlan") {
    const plan = form.get("plan") === "pro" ? "pro" : "free";
    await setLeaguePlan(db, league.id, plan);
  }
  throw redirect(`/league/${league.code}/manage`);
}

export default function ManageLeague({ loaderData }: Route.ComponentProps) {
  const { league, activeQuizId, quizzes, isDev } = loaderData;
  const navigation = useNavigation();
  const submitting = navigation.state === "submitting";
  return (
    <main className="min-h-screen bg-gray-950 text-gray-100">
      <LeagueNav code={league.code} isAdmin />
      <div className="mx-auto max-w-2xl px-6 py-12">
        <div className="mb-1 flex items-center justify-between">
          <p className="text-sm font-semibold uppercase tracking-widest text-indigo-400">
            {league.name}
          </p>
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              league.plan === "pro"
                ? "bg-indigo-500/20 text-indigo-300"
                : "bg-gray-800 text-gray-400"
            }`}
          >
            {league.plan.toUpperCase()} plan
          </span>
        </div>
        <h1 className="text-2xl font-bold">Manage quizzes</h1>
        <p className="mt-1 text-sm text-gray-400">
          Build a quiz and set it as your league&rsquo;s quiz of the day. Members
          play it once.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            to={`/league/${league.code}/sources`}
            className="rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-500"
          >
            Generate quiz with AI →
          </Link>
          <Link
            to={`/league/${league.code}/quizzes/new`}
            className="rounded-lg border border-gray-700 px-4 py-2 font-semibold text-gray-200 hover:bg-gray-900"
          >
            + Build manually
          </Link>
          <Link
            to={`/league/${league.code}/settings`}
            className="rounded-lg border border-gray-700 px-4 py-2 font-semibold text-gray-200 hover:bg-gray-900"
          >
            Settings
          </Link>
        </div>

        <div className="mt-8 space-y-3">
          {quizzes.length === 0 && (
            <div className="rounded-xl border border-gray-800 px-4 py-10 text-center">
              <p className="text-gray-400 font-medium">No quizzes yet</p>
              <p className="mt-1 text-sm text-gray-600">Generate one with AI or build it manually.</p>
              <div className="mt-5 flex justify-center gap-3">
                <Link
                  to={`/league/${league.code}/sources`}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
                >
                  Generate with AI →
                </Link>
                <Link
                  to={`/league/${league.code}/quizzes/new`}
                  className="rounded-lg border border-gray-700 px-4 py-2 text-sm font-semibold text-gray-200 hover:bg-gray-900"
                >
                  + Build manually
                </Link>
              </div>
            </div>
          )}
          {quizzes.map((quiz) => {
            const isActive = quiz.id === activeQuizId;
            const today = new Date().toISOString().slice(0, 10);
            const isPast = quiz.scheduledDate && quiz.scheduledDate < today;
            return (
              <div
                key={quiz.id}
                className={`rounded-xl border p-4 ${
                  isActive ? "border-indigo-500/50 bg-indigo-500/10" : "border-gray-800"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-semibold">{quiz.title}</p>
                    <p className="text-xs text-gray-500">
                      {quiz.count} {quiz.count === 1 ? "question" : "questions"}
                      {isActive && " · live now"}
                    </p>
                    {/* Inline date scheduler */}
                    <Form method="post" className="mt-2 flex items-center gap-2">
                      <input type="hidden" name="intent" value="schedule" />
                      <input type="hidden" name="quizId" value={quiz.id} />
                      <input
                        type="date"
                        name="scheduledDate"
                        defaultValue={quiz.scheduledDate ?? ""}
                        className={`rounded border px-2 py-1 text-xs bg-gray-900 focus:outline-none focus:border-indigo-500 ${
                          isPast ? "border-gray-700 text-gray-500" : "border-gray-700 text-gray-200"
                        }`}
                        onChange={(e) => e.currentTarget.form?.requestSubmit()}
                        disabled={submitting}
                      />
                      {quiz.scheduledDate ? (
                        isPast ? (
                          <span className="text-xs text-gray-600">played</span>
                        ) : (
                          <span className="text-xs text-indigo-400">scheduled</span>
                        )
                      ) : (
                        <span className="text-xs text-gray-600">no date set</span>
                      )}
                    </Form>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {isActive ? (
                      <Form method="post">
                        <input type="hidden" name="intent" value="clearActive" />
                        <button disabled={submitting} className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs font-semibold text-gray-400 hover:bg-gray-900 disabled:opacity-60">
                          Stop
                        </button>
                      </Form>
                    ) : (
                      <Form method="post">
                        <input type="hidden" name="intent" value="playNow" />
                        <input type="hidden" name="quizId" value={quiz.id} />
                        <button disabled={submitting} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-60">
                          Play today
                        </button>
                      </Form>
                    )}
                    <Link
                      to={`/league/${league.code}/quizzes/${quiz.id}/edit`}
                      className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs font-semibold text-gray-200 hover:bg-gray-900"
                    >
                      Edit
                    </Link>
                    <Form
                      method="post"
                      onSubmit={(e) => {
                        if (!confirm("Delete this quiz?")) e.preventDefault();
                      }}
                    >
                      <input type="hidden" name="intent" value="delete" />
                      <input type="hidden" name="quizId" value={quiz.id} />
                      <button disabled={submitting} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-gray-500 hover:text-red-400 disabled:opacity-60">
                        Delete
                      </button>
                    </Form>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Dev-only plan toggle — hidden in production until real billing lands. */}
        {isDev && <div className="mt-12 rounded-xl border border-dashed border-gray-800 p-4 text-sm text-gray-500">
          <p className="mb-2 font-medium text-gray-400">Plan (dev toggle)</p>
          <Form method="post" className="flex items-center gap-2">
            <input type="hidden" name="intent" value="setPlan" />
            <input
              type="hidden"
              name="plan"
              value={league.plan === "pro" ? "free" : "pro"}
            />
            <button className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs font-semibold text-gray-300 hover:bg-gray-900">
              {league.plan === "pro" ? "Downgrade to free" : "Upgrade to pro"}
            </button>
          </Form>
        </div>}
      </div>
    </main>
  );
}
