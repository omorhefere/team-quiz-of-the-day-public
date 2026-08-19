import { describe, expect, it } from "vitest";
import {
  MAX_CUSTOM_QUESTIONS,
  deckQuestionsSchema,
  parseQuestionCount,
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

describe("parseQuestionCount", () => {
  it("clamps a request above the cap down to the cap", () => {
    // Regression: the generate forms asked for 15 while the cap was 10, and a
    // `.max()` + `.catch(5)` silently produced 5-question quizzes.
    expect(parseQuestionCount("15")).toBe(MAX_CUSTOM_QUESTIONS);
  });

  it("keeps a valid in-range request", () => {
    expect(parseQuestionCount("3")).toBe(3);
  });

  it("falls back to the cap for missing, junk, or non-positive values", () => {
    expect(parseQuestionCount(null)).toBe(MAX_CUSTOM_QUESTIONS);
    expect(parseQuestionCount("")).toBe(MAX_CUSTOM_QUESTIONS);
    expect(parseQuestionCount("abc")).toBe(MAX_CUSTOM_QUESTIONS);
    expect(parseQuestionCount("2.5")).toBe(MAX_CUSTOM_QUESTIONS);
    expect(parseQuestionCount("0")).toBe(MAX_CUSTOM_QUESTIONS);
    expect(parseQuestionCount("-4")).toBe(MAX_CUSTOM_QUESTIONS);
  });
});
