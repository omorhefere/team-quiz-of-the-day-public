import { Form, Link, redirect } from "react-router";
import type { Route } from "./+types/league.manage";
import {
  deleteCustomQuiz,
  listCustomQuizzes,
  setActiveCustomQuiz,
  setLeaguePlan,
} from "~/db/repository";
import { requireLeagueAdmin } from "~/lib/custom-quiz.server";

export function meta() {
  return [{ title: "Manage quizzes · Office Trivia League" }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { db, league } = await requireLeagueAdmin(request, params.code);
  const quizzes = await listCustomQuizzes(db, league.id);
  return {
    league: { code: league.code, name: league.name, plan: league.plan },
    activeQuizId: league.activeCustomQuizId,
    quizzes: quizzes.map((q) => ({
      id: q.id,
      title: q.title,
      count: (q.questions as unknown[]).length,
    })),
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  const { db, league } = await requireLeagueAdmin(request, params.code);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const quizId = form.get("quizId");

  if (intent === "setActive" && typeof quizId === "string") {
    await setActiveCustomQuiz(db, league.id, quizId);
  } else if (intent === "clearActive") {
    await setActiveCustomQuiz(db, league.id, null);
  } else if (intent === "delete" && typeof quizId === "string") {
    await deleteCustomQuiz(db, quizId);
  } else if (intent === "setPlan") {
    const plan = form.get("plan") === "pro" ? "pro" : "free";
    await setLeaguePlan(db, league.id, plan);
  }
  throw redirect(`/league/${league.code}/manage`);
}

export default function ManageLeague({ loaderData }: Route.ComponentProps) {
  const { league, activeQuizId, quizzes } = loaderData;
  return (
    <main className="min-h-screen bg-gray-950 text-gray-100">
      <div className="mx-auto max-w-2xl px-6 py-12">
        <div className="mb-2 flex items-center justify-between">
          <Link to={`/league/${league.code}`} className="text-sm text-indigo-400 hover:underline">
            ← {league.name}
          </Link>
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
            to={`/league/${league.code}/quizzes/new`}
            className="rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-500"
          >
            + Build a quiz
          </Link>
          {activeQuizId && (
            <Form method="post">
              <input type="hidden" name="intent" value="clearActive" />
              <button className="rounded-lg border border-gray-700 px-4 py-2 text-sm font-semibold text-gray-200 hover:bg-gray-900">
                Clear active quiz
              </button>
            </Form>
          )}
        </div>

        <div className="mt-8 space-y-3">
          {quizzes.length === 0 && (
            <p className="rounded-xl border border-gray-800 px-4 py-8 text-center text-gray-500">
              No quizzes yet. Build your first one.
            </p>
          )}
          {quizzes.map((quiz) => {
            const isActive = quiz.id === activeQuizId;
            return (
              <div
                key={quiz.id}
                className={`rounded-xl border p-4 ${
                  isActive ? "border-indigo-500/50 bg-indigo-500/10" : "border-gray-800"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold">{quiz.title}</p>
                    <p className="text-xs text-gray-500">
                      {quiz.count} {quiz.count === 1 ? "question" : "questions"}
                      {isActive && " · live now"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {!isActive && (
                      <Form method="post">
                        <input type="hidden" name="intent" value="setActive" />
                        <input type="hidden" name="quizId" value={quiz.id} />
                        <button className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500">
                          Set active
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
                      <button className="rounded-lg px-3 py-1.5 text-xs font-semibold text-gray-500 hover:text-red-400">
                        Delete
                      </button>
                    </Form>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Dev-only plan toggle — real billing wires in later. AI generation
            (coming next) is gated behind the pro plan. */}
        <div className="mt-12 rounded-xl border border-dashed border-gray-800 p-4 text-sm text-gray-500">
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
        </div>
      </div>
    </main>
  );
}
