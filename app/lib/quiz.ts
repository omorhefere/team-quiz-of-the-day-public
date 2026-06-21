/**
 * Quiz domain logic: the canonical deck/question shape, validation, and scoring.
 *
 * A valid daily deck is EXACTLY 10 multiple-choice questions, each with EXACTLY
 * 4 choices and one correct index. This invariant is enforced here and relied on
 * by the seed loader (manual deck ingestion) and the pre-deploy smoke test (T10).
 */

import { z } from "zod";

export const QUESTIONS_PER_DECK = 10;
export const CHOICES_PER_QUESTION = 4;
export const MAX_SCORE = QUESTIONS_PER_DECK;

export const questionSchema = z.object({
  q: z.string().min(1, "Question text is required"),
  choices: z
    .array(z.string().min(1))
    .length(CHOICES_PER_QUESTION, `Each question needs exactly ${CHOICES_PER_QUESTION} choices`),
  correct_idx: z.number().int().min(0).max(CHOICES_PER_QUESTION - 1),
  source_quote: z.string().optional(),
});

export const deckQuestionsSchema = z
  .array(questionSchema)
  .length(QUESTIONS_PER_DECK, `A deck must have exactly ${QUESTIONS_PER_DECK} questions`);

export const deckInputSchema = z.object({
  deck_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "deck_date must be YYYY-MM-DD"),
  questions: deckQuestionsSchema,
  curator_notes: z.string().optional(),
});

export type DeckInput = z.infer<typeof deckInputSchema>;
export type ValidQuestion = z.infer<typeof questionSchema>;

// --- Custom quizzes (league-owned; built by hand or AI-generated) -----------
// Custom quizzes are fixed at 10 questions (same as the daily deck).
export const MIN_CUSTOM_QUESTIONS = 1;
export const MAX_CUSTOM_QUESTIONS = 10;
export const CUSTOM_QUIZ_TITLE_MAX = 80;

export const customQuizQuestionsSchema = z
  .array(questionSchema)
  .min(MIN_CUSTOM_QUESTIONS, "Add at least one question")
  .max(MAX_CUSTOM_QUESTIONS, `A quiz can have at most ${MAX_CUSTOM_QUESTIONS} questions`);

export const customQuizInputSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(CUSTOM_QUIZ_TITLE_MAX),
  questions: customQuizQuestionsSchema,
});

export type CustomQuizInput = z.infer<typeof customQuizInputSchema>;

/** Validates the answers for a custom quiz of `questionCount` questions. */
export function customAnswersSchema(questionCount: number) {
  return z
    .array(z.number().int().min(0).max(CHOICES_PER_QUESTION - 1))
    .length(questionCount);
}

/** The answers a team submits: one chosen index per question. */
export const answersSchema = z
  .array(z.number().int().min(0).max(CHOICES_PER_QUESTION - 1))
  .length(QUESTIONS_PER_DECK);

/**
 * Scores a submission. The score is the number of answers matching the
 * question's correct index. Defensive about length: only positions present in
 * both arrays are compared, so a malformed submission scores conservatively
 * rather than throwing.
 */
export function scoreAnswers(
  questions: Pick<ValidQuestion, "correct_idx">[],
  answers: number[],
): number {
  let score = 0;
  const n = Math.min(questions.length, answers.length);
  for (let i = 0; i < n; i++) {
    if (answers[i] === questions[i].correct_idx) score++;
  }
  return score;
}

/**
 * Validates a deck's questions, returning a typed result. Used by the smoke
 * test and seed loader to guarantee `/play` never serves a malformed deck.
 */
export function validateDeckQuestions(value: unknown):
  | { ok: true; questions: ValidQuestion[] }
  | { ok: false; error: string } {
  const result = deckQuestionsSchema.safeParse(value);
  if (result.success) return { ok: true, questions: result.data };
  return { ok: false, error: result.error.issues.map((i) => i.message).join("; ") };
}
