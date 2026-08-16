import { redirect } from "react-router";
import { z } from "zod";
import type { Route } from "./+types/league.generate";
import {
  createCustomQuiz,
  getCustomQuiz,
  getReadySources,
  updateCustomQuiz,
} from "~/db/repository";
import { requireLeagueAdmin } from "~/lib/custom-quiz.server";
import { getLLMService } from "~/lib/llm/index.server";
import type { VerifyResult } from "~/lib/llm/schema";
import {
  CUSTOM_QUIZ_TITLE_MAX,
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

  const form = await request.formData();
  const countSchema = z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_CUSTOM_QUESTIONS)
    .default(5);
  const count = countSchema.catch(5).parse(form.get("count") ?? undefined);
  // Cap topic to prevent prompt injection via an unusually long free-text field.
  const topic = (String(form.get("topic") ?? "").replace(/[\r\n]+/g, " ").trim().slice(0, 200)) || undefined;
  const difficultyRaw = String(form.get("difficulty") ?? "").trim();
  const difficulty = (["easy", "medium", "hard"].includes(difficultyRaw)
    ? difficultyRaw
    : "medium") as "easy" | "medium" | "hard";
  const modeRaw = String(form.get("mode") ?? "").trim();
  const mode = modeRaw === "topic" ? "topic" : "document";
  const appendToQuizId = String(form.get("appendToQuizId") ?? "").trim();

  const sources = mode === "document" ? await getReadySources(db, league.id) : [];
  if (mode === "document" && sources.length === 0) {
    await redirectWithError("Add at least one source before generating a quiz.");
  }
  if (mode === "topic" && !topic && !appendToQuizId) {
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

  // Run adversarial verifier — non-fatal; a failure just omits verdicts.
  let verifyResult: VerifyResult | null = null;
  try {
    verifyResult = await getLLMService().verifyQuiz({
      questions: questions.map((q) => ({
        q: q.q,
        choices: q.choices,
        correct_idx: q.correct_idx,
        source_quote: q.source_quote ?? "",
      })),
      mode,
    });
  } catch (err) {
    console.error("[generate] verifier error (non-fatal):", err);
  }

  const verifiedQuestions = questions.map((q, i) => ({
    ...q,
    verification: verifyResult?.verdicts[i] ?? undefined,
  }));

  // If appending to an existing quiz, merge questions in and go back to edit.
  if (appendToQuizId) {
    const existing = await getCustomQuiz(db, appendToQuizId);
    if (existing && existing.leagueId === league.id) {
      const merged = [...(existing.questions as ValidQuestion[]), ...verifiedQuestions];
      await updateCustomQuiz(db, existing.id, {
        title: existing.title,
        questions: merged,
        topic: topic ?? existing.topic ?? null,
      });
      throw redirect(`/league/${league.code}/quizzes/${existing.id}/edit`);
    }
  }

  // Save as a draft quiz and open it in the builder for the admin to review/edit.
  const dateStr = new Date().toISOString().slice(0, 10);
  const prefix = mode === "topic" ? `AI draft (topic) · ${dateStr}` : `AI draft · ${dateStr}`;
  const topicSuffix = topic ? ` · ${topic}` : "";
  const title = (prefix + topicSuffix).slice(0, CUSTOM_QUIZ_TITLE_MAX);

  const quiz = await createCustomQuiz(db, {
    leagueId: league.id,
    title,
    questions: verifiedQuestions,
    topic,
  });
  throw redirect(`/league/${league.code}/quizzes/${quiz.id}/edit`);
}

