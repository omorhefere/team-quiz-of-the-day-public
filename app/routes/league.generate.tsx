import { redirect } from "react-router";
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

export async function action({ request, params }: Route.ActionArgs) {
  const { db, league } = await requireLeagueAdmin(request, params.code);

  function redirectWithError(msg: string): never {
    throw redirect(`/league/${league.code}/sources?error=${encodeURIComponent(msg)}`);
  }

  // Paid feature: AI generation is gated behind the pro plan.
  if (!isLeaguePro(league)) {
    redirectWithError("AI generation is a Pro feature. Upgrade your league to use it.");
  }

  const sources = await getReadySources(db, league.id);
  if (sources.length === 0) {
    redirectWithError("Add at least one source before generating a quiz.");
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
    // Map the generated shape into our stored question shape. 
    // The source_quote is preserved so the admin can review it.
    questions = result.questions.map((q) => ({
      q: q.q,
      choices: q.choices,
      correct_idx: q.correct_idx,
      source_quote: q.source_quote,
    }));
  } catch (err) {
    redirectWithError(
      err instanceof Error
        ? `Generation failed: ${err.message}`
        : "Generation failed.",
    );
  }

  // Save as a draft quiz and open it in the builder for the admin to review/edit.
  const quiz = await createCustomQuiz(db, {
    leagueId: league.id,
    title: `AI draft · ${new Date().toISOString().slice(0, 10)}${topic ? ` · ${topic}` : ""}`,
    questions,
  });
  throw redirect(`/league/${league.code}/quizzes/${quiz.id}/edit`);
}
