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
  type GenerateParams,
  type GeneratedQuiz,
  type LLMService,
} from "./schema";

/** Defensive cap on total source text fed to the model (chars). */
const MAX_SOURCE_CHARS = 200_000;

/**
 * The instruction block. Kept stable (and first) so it sits in the cacheable
 * prefix. The hard rule — "answerable ONLY from the sources, and quote the
 * passage" — is what makes the output checkable rather than trusted.
 */
const SYSTEM_INSTRUCTIONS = `You write multiple-choice quiz questions for a company's internal trivia game, based ONLY on the source documents provided.

Rules:
- Every question must be answerable purely from the sources. Never use outside knowledge.
- For each question, set "source_quote" to the exact verbatim sentence(s) from the sources that prove the correct answer. If you cannot find a supporting quote, do not write the question.
- Exactly 4 answer choices. One is correct; the other three must be plausible but clearly wrong per the sources.
- Prefer concrete, checkable facts (names, numbers, policies, definitions) over vague or opinion-based questions.
- Keep questions and choices concise. Do not reference "the document" or "the text" in the question wording.`;

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
    const sourceText = buildSourceText(params.sources);
    const topicLine = params.topic
      ? ` Focus on: ${params.topic}.`
      : "";

    const response = await this.client.messages.parse({
      model: this.model,
      max_tokens: 8000,
      system: [
        { type: "text", text: SYSTEM_INSTRUCTIONS },
        // The volatile-but-large source text, cached so re-generation is cheap.
        {
          type: "text",
          text: `SOURCE DOCUMENTS:\n\n${sourceText}`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `Generate ${params.count} multiple-choice questions based strictly on the source documents above.${topicLine}${difficultyInstruction(params.difficulty)}`,
        },
      ],
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
}
