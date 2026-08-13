import { redirect } from "react-router";
import { z } from "zod";
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
import { flashError } from "~/lib/session.server";

// GET visits to this URL (e.g. direct navigation) are meaningless — redirect
// to home. The real entry point is the POST from league.sources.tsx.
export async function loader({ params }: Route.LoaderArgs) {
  throw redirect(`/league/${params.code}/sources`);
}

export async function action({ request, params }: Route.ActionArgs) {
  const { db, league } = await requireLeagueAdmin(request, params.code);

  async function redirectWithError(msg: string): Promise<never> {
    const cookie = await flashError(request, msg);
    throw redirect(`/league/${league.code}/sources`, {
      headers: { "Set-Cookie": cookie },
    });
  }

  // Paid feature: AI generation is gated behind the pro plan.
  if (!isLeaguePro(league)) {
    await redirectWithError("AI generation is a Pro feature. Upgrade your league to use it.");
  }

  const form = await request.formData();
  const countSchema = z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_CUSTOM_QUESTIONS)
    .default(5);
  const count = countSchema.catch(5).parse(form.get("count") ?? undefined);
  // Cap topic to prevent prompt injection via an unusually long free-text field.
  const topic = (String(form.get("topic") ?? "").trim().slice(0, 200)) || undefined;
  const difficultyRaw = String(form.get("difficulty") ?? "").trim();
  const difficulty = (["easy", "medium", "hard"].includes(difficultyRaw)
    ? difficultyRaw
    : "medium") as "easy" | "medium" | "hard";
  const modeRaw = String(form.get("mode") ?? "").trim();
  const mode = modeRaw === "topic" ? "topic" : "document";

  const sources = mode === "document" ? await getReadySources(db, league.id) : [];
  if (mode === "document" && sources.length === 0) {
    await redirectWithError("Add at least one source before generating a quiz.");
  }
  if (mode === "topic" && !topic) {
    await redirectWithError("Enter a topic to generate from.");
  }

  let questions: ValidQuestion[] = [];
  try {
    const result = await getLLMService().generateQuiz({
      sources: sources.map((s) => ({ label: s.label, text: s.text })),
      count,
      topic,
      difficulty,
      mode,
    });
    questions = result.questions.map((q) => ({
      q: q.q,
      choices: q.choices,
      correct_idx: q.correct_idx,
      source_quote: q.source_quote,
    }));
  } catch (err) {
    console.error("[generate] LLM error:", err);
    await redirectWithError("Generation failed. Check that your sources have enough content.");
  }

  // Defensive guard — belt-and-suspenders.
  if (questions.length === 0) {
    await redirectWithError("Generation returned no questions. Try adding more source content.");
  }

  // Save as a draft quiz and open it in the builder for the admin to review/edit.
  const title = mode === "topic"
    ? `AI draft (topic) · ${new Date().toISOString().slice(0, 10)} · ${topic}`
    : `AI draft · ${new Date().toISOString().slice(0, 10)}${topic ? ` · ${topic}` : ""}`;

  const quiz = await createCustomQuiz(db, {
    leagueId: league.id,
    title,
    questions,
  });
  throw redirect(`/league/${league.code}/quizzes/${quiz.id}/edit`);
}

