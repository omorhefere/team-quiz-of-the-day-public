/**
 * L1 — the LLM contract.
 *
 * This file defines WHAT we ask the model for and WHAT shape we expect back,
 * with zero dependency on any provider SDK. Everything downstream (the Anthropic
 * implementation, the fake, the routes) programs against this interface — so
 * swapping Claude for another model later is a one-file change (the design's
 * "Strangler Fig" decision, D7).
 *
 * WHY a `source_quote` on every question: the core risk of AI trivia is the
 * model confidently marking a WRONG answer correct. We can't use the Citations
 * API here (it's incompatible with structured outputs), so instead we force the
 * model to quote the exact passage from the source that proves the answer. That
 * quote is the grounding evidence a human (and, later, a validator) checks
 * before the quiz goes live — it's the trust boundary made concrete.
 */

import { z } from "zod";

/** A single AI-generated question, with its grounding evidence. */
export const generatedQuestionSchema = z.object({
  q: z.string().min(1),
  choices: z.array(z.string().min(1)).length(4),
  correct_idx: z.number().int().min(0).max(3),
  /** Verbatim passage from the source documents that proves `correct_idx`. */
  source_quote: z.string().min(1).max(500),
});

export const generatedQuizSchema = z.object({
  // min(1): if the model returns [] (source too thin to ground any question),
  // we reject rather than saving an empty draft that confuses the admin.
  questions: z.array(generatedQuestionSchema).min(1, "Generation returned no questions"),
});

export type GeneratedQuestion = z.infer<typeof generatedQuestionSchema>;
export type GeneratedQuiz = z.infer<typeof generatedQuizSchema>;

/** What a generation request needs. */
export interface GenerateParams {
  /** The league's ingested source texts (already extracted, see step 3). */
  sources: { label: string; text: string }[];
  /** How many questions to generate. */
  count: number;
  /** Optional focus, e.g. "our refund policy". */
  topic?: string;
  /** Controls how obvious the questions should be. Defaults to "medium". */
  difficulty?: "easy" | "medium" | "hard";
  /** "document" (default) grounds questions in sources. "topic" uses model knowledge — unverified. */
  mode?: "document" | "topic";
  /** Existing question prompts to avoid duplicating. */
  existingQuestions?: string[];
}

export interface VerificationResult {
  verdict: "confident" | "review" | "flagged";
  /** Short explanation, shown to the admin. */
  reason?: string;
}

export interface VerifyParams {
  questions: Array<{
    q: string;
    choices: string[];
    correct_idx: number;
    source_quote: string;
  }>;
  /** "topic" mode questions have no source document — verifier uses general knowledge. */
  mode: "document" | "topic";
}

export interface VerifyResult {
  /** One entry per question, same order as VerifyParams.questions. */
  verdicts: VerificationResult[];
}

export const verificationResultSchema = z.object({
  verdict: z.enum(["confident", "review", "flagged"]),
  reason: z.string().optional(),
});

export const verifyResultSchema = z.object({
  verdicts: z.array(verificationResultSchema),
});

/**
 * The provider-agnostic generation service. Implemented by `AnthropicLLMService`
 * (real) and `FakeLLMService` (deterministic, for dev/tests without a key).
 */
export interface LLMService {
  generateQuiz(params: GenerateParams): Promise<GeneratedQuiz>;
  verifyQuiz(params: VerifyParams): Promise<VerifyResult>;
  /** Returns a 2–3 sentence plain-English summary of the source text. */
  summariseSource(text: string, label: string): Promise<string>;
}

export class LLMUnavailableError extends Error {
  constructor() {
    super("AI generation isn't configured (missing ANTHROPIC_API_KEY).");
    this.name = "LLMUnavailableError";
  }
}
