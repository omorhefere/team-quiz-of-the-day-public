/**
 * A deterministic stand-in for the real model. It lets the entire
 * generate -> review -> publish pipeline run (and be tested) WITHOUT an API key
 * or spending money. Used automatically in dev/CI when ANTHROPIC_API_KEY is unset,
 * and in unit tests. It is obviously not "intelligent" — it just produces
 * schema-valid questions seeded from the source text.
 */

import {
  type GenerateParams,
  type GeneratedQuiz,
  type LLMService,
  type VerifyParams,
  type VerifyResult,
} from "./schema";

function firstSentence(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  const match = trimmed.match(/^.{20,160}?[.!?]/);
  return (match?.[0] ?? trimmed.slice(0, 120)) || "Sample source sentence.";
}

export class FakeLLMService implements LLMService {
  async generateQuiz(params: GenerateParams): Promise<GeneratedQuiz> {
    const isTopicMode = params.mode === "topic";
    const sources = isTopicMode
      ? [{ label: params.topic ?? "general knowledge", text: `Questions about ${params.topic ?? "general knowledge"}.` }]
      : params.sources.length
      ? params.sources
      : [{ label: "sample", text: "The company was founded in 2019." }];

    const questions = Array.from({ length: Math.max(1, params.count) }, (_, i) => {
      const source = sources[i % sources.length];
      const quote = firstSentence(source.text);
      return {
        q: `[DEV] Question ${i + 1} based on "${source.label}"?`,
        choices: [
          "Correct answer (from source)",
          "Plausible wrong answer A",
          "Plausible wrong answer B",
          "Plausible wrong answer C",
        ],
        correct_idx: 0,
        source_quote: quote,
      };
    });

    return { questions };
  }

  async summariseSource(text: string, label: string): Promise<string> {
    return `[DEV] Summary of "${label}". Contains ${Math.ceil(text.length / 100)} paragraphs of content. Topics include sample facts for development use.`;
  }

  async verifyQuiz(params: VerifyParams): Promise<VerifyResult> {
    return {
      verdicts: params.questions.map(() => ({ verdict: "confident" as const })),
    };
  }
}
