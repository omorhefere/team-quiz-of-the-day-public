/**
 * L2 — the real generation service, backed by Claude.
 *
 * Design choices (and why):
 * - `messages.parse()` + `zodOutputFormat`: structured outputs. The model is
 *   constrained to our exact JSON shape and the SDK validates it against the Zod
 *   schema — so we never hand-parse loose text into the DB. Reliability first.
 * - Prompt caching on the source documents: the sources are the big, stable part
 *   of the prompt and don't change between re-generations for a league. Caching
 *   them means the 2nd+ generation only pays ~0.1x for that text. (Note: caching
 *   only kicks in above ~4k tokens on Opus — small corpora just won't cache, which
 *   is fine.)
 * - `claude-sonnet-4-6` by default: great quality for structured extraction at
 *   ~10x lower cost than Opus. Override with LLM_MODEL env var if needed.
 *
 * Server-only (`.server`).
 */

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import {
  generatedQuizSchema,
  verifyResultSchema,
  type GenerateParams,
  type GeneratedQuiz,
  type LLMService,
  type VerifyParams,
  type VerifyResult,
} from "./schema";

/** Defensive cap on total source text fed to the model (chars). */
const MAX_SOURCE_CHARS = 200_000;

/**
 * The instruction block. Kept stable (and first) so it sits in the cacheable
 * prefix. The hard rule — "answerable ONLY from the sources, and quote the
 * passage" — is what makes the output checkable rather than trusted.
 */
const TOPIC_SYSTEM_INSTRUCTIONS = `You write multiple-choice quiz questions for a company's internal trivia game.

Rules:
- Write questions about the topic provided. Use your general knowledge — there are no source documents.
- Exactly 4 answer choices. One is correct; the other three must be plausible but clearly wrong.
- Prefer concrete, checkable facts (names, numbers, dates, definitions) over vague or opinion-based questions.
- Set "source_quote" to the exact fact that proves the answer, written as a plain sentence (since there is no document to quote from, state the fact directly, e.g. "The Eiffel Tower was completed in 1889.").
- Keep questions and choices concise.`;

const SYSTEM_INSTRUCTIONS = `You write multiple-choice quiz questions for a company's internal trivia game, based ONLY on the source documents provided.

Rules:
- Every question must be answerable purely from the sources. Never use outside knowledge.
- For each question, set "source_quote" to the exact verbatim sentence(s) from the sources that prove the correct answer. If you cannot find a supporting quote, do not write the question.
- Exactly 4 answer choices. One is correct; the other three must be plausible but clearly wrong per the sources.
- Prefer concrete, checkable facts (names, numbers, policies, definitions) over vague or opinion-based questions.
- Keep questions and choices concise. Do not reference "the document" or "the text" in the question wording.`;

const VERIFY_SYSTEM_INSTRUCTIONS = `You are an adversarial quiz verifier. For each question, try to find a reason it is wrong or unfair.

For each question assign one of three verdicts:
- "confident": the correct answer is unambiguously right; the three wrong answers are clearly wrong; the question is fair and unambiguous.
- "review": the answer is probably right but the question is ambiguous, or a wrong answer could be argued as correct, or the wording is confusing.
- "flagged": the stated correct answer is wrong, or multiple answers are correct, or the question is unanswerable.

Set "reason" for any "review" or "flagged" verdict — one short sentence explaining the problem.`;

function difficultyInstruction(d: GenerateParams["difficulty"]): string {
  if (d === "easy") return "\nDifficulty: EASY — favour questions where the answer is stated plainly and obviously in the source. Avoid trick questions or fine distinctions.";
  if (d === "hard") return "\nDifficulty: HARD — favour questions that require careful reading, specific recall, or distinguishing between closely related facts. Avoid questions with an obvious answer.";
  return "\nDifficulty: MEDIUM — mix straightforward and moderately challenging questions.";
}

function buildSourceText(sources: GenerateParams["sources"]): string {
  const joined = sources
    .map((s) => `## Source: ${s.label}\n${s.text}`)
    .join("\n\n---\n\n");
  return joined.slice(0, MAX_SOURCE_CHARS);
}

export class AnthropicLLMService implements LLMService {
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  async generateQuiz(params: GenerateParams): Promise<GeneratedQuiz> {
    const isTopicMode = params.mode === "topic";
    const topicLine = params.topic ? ` Focus on: ${params.topic}.` : "";

    const systemBlocks: Anthropic.Messages.TextBlockParam[] = isTopicMode
      ? [{ type: "text", text: TOPIC_SYSTEM_INSTRUCTIONS }]
      : [
          { type: "text", text: SYSTEM_INSTRUCTIONS },
          // The volatile-but-large source text, cached so re-generation is cheap.
          {
            type: "text",
            text: `SOURCE DOCUMENTS:\n\n${buildSourceText(params.sources)}`,
            cache_control: { type: "ephemeral" },
          },
        ];

    const userContent = isTopicMode
      ? `Generate ${params.count} multiple-choice questions about: ${params.topic ?? "general knowledge"}.${difficultyInstruction(params.difficulty)}`
      : `Generate ${params.count} multiple-choice questions based strictly on the source documents above.${topicLine}${difficultyInstruction(params.difficulty)}`;

    const response = await this.client.messages.parse({
      model: this.model,
      max_tokens: isTopicMode ? 8000 : 32000,
      ...(isTopicMode ? {} : { thinking: { type: "adaptive" } }),
      system: systemBlocks,
      messages: [{ role: "user", content: userContent }],
      output_config: {
        format: zodOutputFormat(generatedQuizSchema),
      },
    });

    // parsed_output is null if the model refused or hit the token cap.
    if (!response.parsed_output) {
      throw new Error(
        `Generation did not return a valid quiz (stop reason: ${response.stop_reason}).`,
      );
    }
    return response.parsed_output;
  }

  async verifyQuiz(params: VerifyParams): Promise<VerifyResult> {
    const questionList = params.questions
      .map((q, i) => {
        const choices = q.choices
          .map((c, ci) => `  ${ci === q.correct_idx ? "✓" : " "} ${ci}. ${c}`)
          .join("\n");
        const quote =
          params.mode === "topic"
            ? `Stated fact: ${q.source_quote}`
            : `Source quote: "${q.source_quote}"`;
        return `Q${i + 1}: ${q.q}\n${choices}\n${quote}`;
      })
      .join("\n\n");

    const response = await this.client.messages.parse({
      model: this.model,
      max_tokens: 2000,
      system: [{ type: "text", text: VERIFY_SYSTEM_INSTRUCTIONS }],
      messages: [
        {
          role: "user",
          content: `Verify these ${params.questions.length} questions. Return one verdict per question in the same order.\n\n${questionList}`,
        },
      ],
      output_config: { format: zodOutputFormat(verifyResultSchema) },
    });

    if (!response.parsed_output) {
      return {
        verdicts: params.questions.map(() => ({
          verdict: "review" as const,
          reason: "Verification call failed — please review manually.",
        })),
      };
    }

    const verdicts = response.parsed_output.verdicts.slice(0, params.questions.length);
    while (verdicts.length < params.questions.length) {
      verdicts.push({ verdict: "review" as const, reason: "No verdict returned." });
    }
    return { verdicts };
  }
}
