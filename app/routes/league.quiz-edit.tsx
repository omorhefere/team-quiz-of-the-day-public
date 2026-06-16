import { Link, redirect, useActionData } from "react-router";
import type { Route } from "./+types/league.quiz-edit";
import { getCustomQuiz, updateCustomQuiz } from "~/db/repository";
import { parseQuizPayload, requireLeagueAdmin } from "~/lib/custom-quiz.server";
import { QuizBuilder } from "~/components/QuizBuilder";
import type { ValidQuestion } from "~/lib/quiz";

export function meta() {
  return [{ title: "Edit quiz · Office Trivia League" }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { db, league } = await requireLeagueAdmin(request, params.code);
  const quiz = await getCustomQuiz(db, params.quizId);
  // Guard: the quiz must belong to this league.
  if (!quiz || quiz.leagueId !== league.id) {
    throw new Response("Quiz not found", { status: 404 });
  }
  return {
    code: league.code,
    quizId: quiz.id,
    title: quiz.title,
    questions: quiz.questions as ValidQuestion[],
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  const { db, league } = await requireLeagueAdmin(request, params.code);
  const quiz = await getCustomQuiz(db, params.quizId);
  if (!quiz || quiz.leagueId !== league.id) {
    throw new Response("Quiz not found", { status: 404 });
  }

  const result = parseQuizPayload(await request.formData());
  if (!result.ok) return { error: result.error };

  await updateCustomQuiz(db, quiz.id, {
    title: result.data.title,
    questions: result.data.questions,
  });
  throw redirect(`/league/${league.code}/manage`);
}

export default function EditQuiz({ loaderData }: Route.ComponentProps) {
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
        <h1 className="mb-6 mt-2 text-2xl font-bold">Edit quiz</h1>
        <QuizBuilder
          action={`/league/${loaderData.code}/quizzes/${loaderData.quizId}/edit`}
          initialTitle={loaderData.title}
          initialQuestions={loaderData.questions}
          submitLabel="Save changes"
          error={actionData?.error}
        />
      </div>
    </main>
  );
}
