import { describe, expect, it } from "vitest";
import {
  deckQuestionsSchema,
  scoreAnswers,
  validateDeckQuestions,
  type ValidQuestion,
} from "./quiz";

function makeQuestions(correct: number[]): ValidQuestion[] {
  return correct.map((c, i) => ({
    q: `Question ${i}`,
    choices: ["A", "B", "C", "D"],
    correct_idx: c,
  }));
}

describe("scoreAnswers", () => {
  const questions = makeQuestions([0, 1, 2, 3, 0, 1, 2, 3, 0, 1]);

  it("scores a perfect submission as 10", () => {
    expect(scoreAnswers(questions, [0, 1, 2, 3, 0, 1, 2, 3, 0, 1])).toBe(10);
  });
  it("scores all-wrong as 0", () => {
    expect(scoreAnswers(questions, [1, 0, 0, 0, 1, 0, 0, 0, 1, 0])).toBe(0);
  });
  it("scores a partial submission", () => {
    expect(scoreAnswers(questions, [0, 1, 2, 0, 0, 1, 0, 3, 0, 0])).toBe(7);
  });
  it("is defensive about mismatched lengths", () => {
    expect(scoreAnswers(questions, [0, 1, 2])).toBe(3);
    expect(scoreAnswers(questions, [])).toBe(0);
  });
});

describe("deck validation", () => {
  const valid = makeQuestions([0, 1, 2, 3, 0, 1, 2, 3, 0, 1]);

  it("accepts a valid 10-question deck", () => {
    expect(deckQuestionsSchema.safeParse(valid).success).toBe(true);
    expect(validateDeckQuestions(valid)).toMatchObject({ ok: true });
  });

  it("rejects a deck without exactly 10 questions", () => {
    expect(validateDeckQuestions(valid.slice(0, 9))).toMatchObject({ ok: false });
  });

  it("rejects a question without exactly 4 choices", () => {
    const bad = structuredClone(valid);
    bad[0].choices = ["A", "B", "C"] as unknown as ValidQuestion["choices"];
    expect(validateDeckQuestions(bad)).toMatchObject({ ok: false });
  });

  it("rejects an out-of-range correct_idx", () => {
    const bad = structuredClone(valid);
    bad[0].correct_idx = 9;
    expect(validateDeckQuestions(bad)).toMatchObject({ ok: false });
  });
});
