import { redirect } from "react-router";
import { z } from "zod";
import type { Route } from "./+types/league.generate";
import {
  createCustomQuiz,
  getCustomQuiz,
  getReadySources,
  getSource,
  updateCustomQuiz,
} from "~/db/repository";
import { requireLeagueAdmin } from "~/lib/custom-quiz.server";
import { getLLMService } from "~/lib/llm/index.server";
import type { VerifyResult } from "~/lib/llm/schema";
import {
  CUSTOM_QUIZ_TITLE_MAX,
  parseQuestionCount,
  type ValidQuestion,
} from "~/lib/quiz";
import { flashError } from "~/lib/session.server";

// GET visits to this URL (e.g. direct navigation) are meaningless — redirect
// to home. The real entry point is the POST from league.sources.tsx.
export async function loader({ params }: Route.LoaderArgs) {
  throw redirect(`/league/${params.code}/sources`);
}

/**
 * Turn a generation failure into something the admin can act on.
 *
 * This used to be a single "check that your sources have enough content" for
 * every failure — including auth errors, rate limits, and an SDK guard that
 * rejected the request before it was ever sent. That message sent us hunting
 * through source records for a bug that was in the request config, so each
 * distinct cause now names itself. The full error is still logged.
 */
function describeGenerationError(err: unknown): string {
  const status = (err as { status?: number } | null)?.status;
  const message = err instanceof Error ? err.message : String(err);

  if (status === 401 || status === 403) {
    return "AI generation isn't authenticated — the API key is missing or invalid.";
  }
  if (status === 429) {
    return "The AI provider is rate limiting us. Wait a minute and try again.";
  }
  if (status === 529 || (typeof status === "number" && status >= 500)) {
    return "The AI provider is unavailable right now. Try again shortly.";
  }
  if (/stop reason: max_tokens/i.test(message)) {
    return "The quiz was cut off before it finished. Try generating fewer questions.";
  }
  if (/stop reason: refusal/i.test(message)) {
    return "The AI declined to generate from this source. Try a different source or topic.";
  }
  if (/streaming is required/i.test(message)) {
    return "Generation is misconfigured on the server (streaming required). This is a bug — please report it.";
  }
  return "Generation failed. The error has been logged; try again shortly.";
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
  const count = parseQuestionCount(form.get("count"));
  // Cap topic to prevent prompt injection via an unusually long free-text field.
  const topic = (String(form.get("topic") ?? "").replace(/[\r\n]+/g, " ").trim().slice(0, 200)) || undefined;
  // Left undefined when nothing was picked — no silent fallback to medium, so
  // an unselected form produces no difficulty instruction at all.
  const difficultyRaw = String(form.get("difficulty") ?? "").trim();
  const difficulty = ["easy", "medium", "hard"].includes(difficultyRaw)
    ? (difficultyRaw as "easy" | "medium" | "hard")
    : undefined;
  const modeRaw = String(form.get("mode") ?? "").trim();
  const mode = modeRaw === "topic" ? "topic" : "document";
  const appendToQuizId = String(form.get("appendToQuizId") ?? "").trim();
  const sourceId = String(form.get("sourceId") ?? "").trim();

  let sources: Awaited<ReturnType<typeof getReadySources>> = [];
  if (mode === "document") {
    if (sourceId) {
      const single = await getSource(db, sourceId, league.id);
      if (single && single.status === "ready") sources = [single];
    } else {
      sources = await getReadySources(db, league.id);
    }
    if (sources.length === 0) {
      await redirectWithError("Add at least one source before generating a quiz.");
    }
  }
  if (mode === "topic" && !topic && !appendToQuizId) {
    await redirectWithError("Enter a topic to generate from.");
  }

  // When appending, fetch existing questions now so we can pass them to the LLM.
  let existingForAppend: ValidQuestion[] | undefined;
  if (appendToQuizId) {
    const existing = await getCustomQuiz(db, appendToQuizId);
    if (existing && existing.leagueId === league.id) {
      existingForAppend = existing.questions as ValidQuestion[];
    }
  }

  let questions: ValidQuestion[] = [];
  try {
    const result = await getLLMService().generateQuiz({
      sources: sources.map((s) => ({ label: s.label, text: s.text })),
      count,
      topic,
      difficulty,
      mode,
      existingQuestions: existingForAppend?.map((q) => q.q),
    });
    questions = result.questions.map((q) => ({
      q: q.q,
      choices: q.choices,
      correct_idx: q.correct_idx,
      source_quote: q.source_quote,
    }));
  } catch (err) {
    console.error("[generate] LLM error:", err);
    await redirectWithError(describeGenerationError(err));
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
  if (appendToQuizId && existingForAppend !== undefined) {
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

