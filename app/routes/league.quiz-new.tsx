import { Link, redirect, useActionData } from "react-router";
import type { Route } from "./+types/league.quiz-new";
import { createCustomQuiz } from "~/db/repository";
import { parseQuizPayload, requireLeagueAdmin } from "~/lib/custom-quiz.server";
import { QuizBuilder } from "~/components/QuizBuilder";

export function meta() {
  return [{ title: "Build a quiz · Office Trivia League" }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { league } = await requireLeagueAdmin(request, params.code);
  return { code: league.code };
}

export async function action({ request, params }: Route.ActionArgs) {
  const { db, league } = await requireLeagueAdmin(request, params.code);
  const result = parseQuizPayload(await request.formData());
  if (!result.ok) return { error: result.error };

  await createCustomQuiz(db, {
    leagueId: league.id,
    title: result.data.title,
    questions: result.data.questions,
  });
  throw redirect(`/league/${league.code}/manage`);
}

export default function NewQuiz({ loaderData }: Route.ComponentProps) {
  const actionData = useActionData<typeof action>();
  return (
    <main className="min-h-screen bg-gray-950 text-gray-100">
      <div className="mx-auto max-w-2xl px-6 py-12">
        <Link
          to={`/league/${loaderData.code}/manage`}
          className="text-sm text-indigo-400 hover:underline"
        >
          ← Back to quizzes
        </Link>
        <h1 className="mb-6 mt-2 text-2xl font-bold">Build a quiz</h1>
        <QuizBuilder
          action={`/league/${loaderData.code}/quizzes/new`}
          submitLabel="Create quiz"
          error={actionData?.error}
        />
      </div>
    </main>
  );
}
