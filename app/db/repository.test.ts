import { beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type DB } from "./client";
import {
  AlreadySubmittedError,
  createTeam,
  getDailyLeaderboard,
  getPublishedDeck,
  getTeamByCode,
  getWeeklyLeaderboard,
  submitAnswers,
  upsertDeck,
} from "./repository";
import type { ValidQuestion } from "~/lib/quiz";
import { weeklyWindow } from "~/lib/date";

const DECK_DATE = "2026-06-05";

function deckQuestions(correct: number[]): ValidQuestion[] {
  return correct.map((c, i) => ({
    q: `Q${i}`,
    choices: ["A", "B", "C", "D"],
    correct_idx: c,
  }));
}
const ALL_CORRECT = [0, 1, 2, 3, 0, 1, 2, 3, 0, 1];

let db: DB;
beforeEach(async () => {
  db = await createTestDb();
});

describe("createTeam", () => {
  it("creates a team with a generated code, retrievable by code", async () => {
    const team = await createTeam(db, "  Platform Team  ");
    expect(team.displayName).toBe("Platform Team");
    expect(team.code).toMatch(/^[A-Z]+-[A-Z]+-\d{2}$/);
    const found = await getTeamByCode(db, team.code.toLowerCase());
    expect(found?.id).toBe(team.id);
  });
});

describe("decks", () => {
  it("only returns published decks", async () => {
    await upsertDeck(db, {
      deckDate: DECK_DATE,
      questions: deckQuestions(ALL_CORRECT),
      publishedAt: null, // staged, not live
    });
    expect(await getPublishedDeck(db, DECK_DATE)).toBeNull();

    await upsertDeck(db, {
      deckDate: DECK_DATE,
      questions: deckQuestions(ALL_CORRECT),
    });
    expect(await getPublishedDeck(db, DECK_DATE)).not.toBeNull();
  });
});

describe("submitAnswers", () => {
  beforeEach(async () => {
    await upsertDeck(db, { deckDate: DECK_DATE, questions: deckQuestions(ALL_CORRECT) });
  });

  it("scores server-side", async () => {
    const team = await createTeam(db, "Scorers");
    const deck = (await getPublishedDeck(db, DECK_DATE))!;
    const { score } = await submitAnswers(db, {
      teamId: team.id,
      deck,
      answers: [0, 1, 2, 3, 0, 1, 2, 0, 0, 0], // 8 correct
    });
    expect(score).toBe(8);
  });

  it("rejects a second submission for the same team/day", async () => {
    const team = await createTeam(db, "Doublers");
    const deck = (await getPublishedDeck(db, DECK_DATE))!;
    await submitAnswers(db, { teamId: team.id, deck, answers: ALL_CORRECT });
    await expect(
      submitAnswers(db, { teamId: team.id, deck, answers: ALL_CORRECT }),
    ).rejects.toBeInstanceOf(AlreadySubmittedError);
  });

  it("returns the snapshot rank at the moment of submission", async () => {
    const deck = (await getPublishedDeck(db, DECK_DATE))!;
    const a = await createTeam(db, "Team A");
    const b = await createTeam(db, "Team B");
    const c = await createTeam(db, "Team C");

    // A: 10 first → nobody ahead → snapshot 1.
    const ra = await submitAnswers(db, { teamId: a.id, deck, answers: ALL_CORRECT });
    // B: 8 → only A ahead at this moment → snapshot 2.
    const rb = await submitAnswers(db, {
      teamId: b.id,
      deck,
      answers: [0, 1, 2, 3, 0, 1, 2, 0, 0, 0], // 8 correct
    });
    // C: 10 later → only A (10, earlier) ahead → snapshot 2.
    const rc = await submitAnswers(db, { teamId: c.id, deck, answers: ALL_CORRECT });

    expect(ra.rank).toBe(1);
    expect(rb.rank).toBe(2);
    expect(rc.rank).toBe(2);

    // The LIVE leaderboard recomputes final standings: A (10, earliest),
    // C (10, later), B (8).
    const board = await getDailyLeaderboard(db, DECK_DATE);
    expect(board.map((r) => r.displayName)).toEqual(["Team A", "Team C", "Team B"]);
  });
});

describe("getDailyLeaderboard", () => {
  it("orders by score desc then submitted_at asc", async () => {
    await upsertDeck(db, { deckDate: DECK_DATE, questions: deckQuestions(ALL_CORRECT) });
    const deck = (await getPublishedDeck(db, DECK_DATE))!;
    const a = await createTeam(db, "Alpha");
    const b = await createTeam(db, "Bravo");
    const c = await createTeam(db, "Charlie");
    await submitAnswers(db, { teamId: a.id, deck, answers: [0, 1, 2, 3, 1, 0, 0, 0, 1, 0] }); // 4 correct
    await submitAnswers(db, { teamId: b.id, deck, answers: ALL_CORRECT }); // 10
    await submitAnswers(db, { teamId: c.id, deck, answers: ALL_CORRECT }); // 10, later

    const board = await getDailyLeaderboard(db, DECK_DATE);
    expect(board.map((r) => r.displayName)).toEqual(["Bravo", "Charlie", "Alpha"]);
    expect(board.map((r) => r.rank)).toEqual([1, 2, 3]);
  });
});

describe("getWeeklyLeaderboard", () => {
  it("aggregates total score across the 7-day window", async () => {
    const a = await createTeam(db, "Weeklies");
    for (const date of ["2026-06-03", "2026-06-04", "2026-06-05"]) {
      await upsertDeck(db, { deckDate: date, questions: deckQuestions(ALL_CORRECT) });
      const deck = (await getPublishedDeck(db, date))!;
      await submitAnswers(db, {
        teamId: a.id,
        deck,
        answers: [0, 1, 2, 3, 1, 0, 0, 0, 1, 0], // 4 each day
      });
    }
    const board = await getWeeklyLeaderboard(db, weeklyWindow("2026-06-05"));
    expect(board[0].displayName).toBe("Weeklies");
    expect(board[0].total).toBe(12);
    expect(board[0].daysPlayed).toBe(3);
  });
});
