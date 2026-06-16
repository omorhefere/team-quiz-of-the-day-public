import { describe, expect, it } from "vitest";
import { FakeLLMService } from "./fake";
import { generatedQuizSchema } from "./schema";

describe("generated quiz schema", () => {
  it("requires 4 choices, an in-range correct_idx, and a source quote", () => {
    const bad = generatedQuizSchema.safeParse({
      questions: [{ q: "?", choices: ["a", "b", "c"], correct_idx: 9 }],
    });
    expect(bad.success).toBe(false);
  });
});

describe("FakeLLMService", () => {
  it("produces the requested count of schema-valid questions grounded in a source", async () => {
    const svc = new FakeLLMService();
    const quiz = await svc.generateQuiz({
      count: 3,
      sources: [
        { label: "about", text: "Acme was founded in 2019 in Bristol. It builds tools." },
      ],
    });
    expect(quiz.questions).toHaveLength(3);
    // Every question validates against the contract.
    expect(generatedQuizSchema.safeParse(quiz).success).toBe(true);
    // Grounding evidence is a real snippet from the source.
    expect(quiz.questions[0].source_quote).toContain("Acme was founded in 2019");
  });
});
