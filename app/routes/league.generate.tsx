import { Link, redirect } from "react-router";
import type { Route } from "./+types/league.generate";
import {
  createCustomQuiz,
  getReadySources,
  isLeaguePro,
} from "~/db/repository";
import { requireLeagueAdmin } from "~/lib/custom-quiz.server";
import { getLLMService } from "~/lib/llm/index.server";
import {
  MAX_CUSTOM_QUESTIONS,
  type ValidQuestion,
} from "~/lib/quiz";

export async function loader() {
  throw redirect("/");
}

export async function action({ request, params }: Route.ActionArgs) {
  const { db, league } = await requireLeagueAdmin(request, params.code);

  // Paid feature: AI generation is gated behind the pro plan.
  if (!isLeaguePro(league)) {
    return { error: "AI generation is a Pro feature. Upgrade your league to use it." };
  }

  const sources = await getReadySources(db, league.id);
  if (sources.length === 0) {
    return { error: "Add at least one source before generating a quiz." };
  }

  const form = await request.formData();
  const count = Math.min(
    MAX_CUSTOM_QUESTIONS,
    Math.max(1, Number(form.get("count") ?? 5) || 5),
  );
  const topic = String(form.get("topic") ?? "").trim() || undefined;

  let questions: ValidQuestion[];
  try {
    const result = await getLLMService().generateQuiz({
      sources: sources.map((s) => ({ label: s.label, text: s.text })),
      count,
      topic,
    });
    // Map the generated shape into our stored question shape. The source_quote
    // is dropped on save for now — step 5 (review) will surface it before
    // publishing.
    questions = result.questions.map((q) => ({
      q: q.q,
      choices: q.choices,
      correct_idx: q.correct_idx,
    }));
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? `Generation failed: ${err.message}`
          : "Generation failed.",
    };
  }

  // Save as a draft quiz and open it in the builder for the admin to review/edit.
  const quiz = await createCustomQuiz(db, {
    leagueId: league.id,
    title: `AI draft · ${new Date().toISOString().slice(0, 10)}${topic ? ` · ${topic}` : ""}`,
    questions,
  });
  throw redirect(`/league/${league.code}/quizzes/${quiz.id}/edit`);
}

export default function Generate({ actionData }: Route.ComponentProps) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-950 px-6 text-center text-gray-100">
      <h1 className="text-2xl font-bold text-red-400">Couldn&rsquo;t generate</h1>
      <p className="mt-3 max-w-sm text-gray-400">{actionData?.error}</p>
      <Link to="/" className="mt-8 inline-block text-indigo-400 hover:underline">
        ← Back
      </Link>
    </main>
  );
}
