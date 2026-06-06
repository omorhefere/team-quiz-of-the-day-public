import { beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type DB } from "./client";
import {
  AlreadySubmittedError,
  createCustomQuiz,
  createLeague,
  createTeam,
  deleteCustomQuiz,
  getActiveCustomQuiz,
  getCustomQuizLeaderboard,
  getLeagueById,
  isLeagueAdmin,
  isLeaguePro,
  listCustomQuizzes,
  setActiveCustomQuiz,
  setLeaguePlan,
  submitCustomQuizAnswers,
  updateCustomQuiz,
} from "./repository";
import type { ValidQuestion } from "~/lib/quiz";

function questions(n: number, correct = 0): ValidQuestion[] {
  return Array.from({ length: n }, (_, i) => ({
    q: `Q${i}`,
    choices: ["A", "B", "C", "D"],
    correct_idx: correct,
  }));
}

let db: DB;
beforeEach(async () => {
  db = await createTestDb();
});

async function setup() {
  const admin = await createTeam(db, "Admins");
  const league = await createLeague(db, { name: "Acme", createdByTeamId: admin.id });
  return { admin, league };
}

describe("league admin + entitlement", () => {
  it("treats the creator as admin, others not", async () => {
    const { admin, league } = await setup();
    const other = await createTeam(db, "Other");
    expect(isLeagueAdmin(league, admin.id)).toBe(true);
    expect(isLeagueAdmin(league, other.id)).toBe(false);
    expect(isLeagueAdmin(league, null)).toBe(false);
  });

  it("defaults to free and can be upgraded to pro", async () => {
    const { league } = await setup();
    expect(isLeaguePro(league)).toBe(false);
    await setLeaguePlan(db, league.id, "pro");
    const updated = (await getLeagueById(db, league.id))!;
    expect(isLeaguePro(updated)).toBe(true);
  });
});

describe("custom quiz CRUD + active selection", () => {
  it("creates, lists, updates and deletes quizzes", async () => {
    const { league } = await setup();
    const quiz = await createCustomQuiz(db, {
      leagueId: league.id,
      title: "Onboarding",
      questions: questions(3),
    });
    expect(quiz.title).toBe("Onboarding");
    expect((await listCustomQuizzes(db, league.id))).toHaveLength(1);

    await updateCustomQuiz(db, quiz.id, { title: "Onboarding v2", questions: questions(5) });
    const list = await listCustomQuizzes(db, league.id);
    expect(list[0].title).toBe("Onboarding v2");
    expect(list[0].questions).toHaveLength(5);

    await deleteCustomQuiz(db, quiz.id);
    expect((await listCustomQuizzes(db, league.id))).toHaveLength(0);
  });

  it("sets and reads the active quiz, and clears it on delete", async () => {
    const { league } = await setup();
    const quiz = await createCustomQuiz(db, {
      leagueId: league.id,
      title: "Q",
      questions: questions(3),
    });
    await setActiveCustomQuiz(db, league.id, quiz.id);
    let fresh = (await getLeagueById(db, league.id))!;
    expect((await getActiveCustomQuiz(db, fresh))?.id).toBe(quiz.id);

    await deleteCustomQuiz(db, quiz.id);
    fresh = (await getLeagueById(db, league.id))!;
    expect(fresh.activeCustomQuizId).toBeNull();
    expect(await getActiveCustomQuiz(db, fresh)).toBeNull();
  });
});

describe("custom quiz play (one-shot + leaderboard)", () => {
  it("scores, blocks replays, and ranks the leaderboard", async () => {
    const { league } = await setup();
    const quiz = await createCustomQuiz(db, {
      leagueId: league.id,
      title: "Q",
      questions: questions(3, 0), // correct answer is index 0 for all
    });
    const a = await createTeam(db, "Team A");
    const b = await createTeam(db, "Team B");

    const ra = await submitCustomQuizAnswers(db, { quiz, teamId: a.id, answers: [0, 0, 0] }); // 3
    const rb = await submitCustomQuizAnswers(db, { quiz, teamId: b.id, answers: [0, 0, 1] }); // 2
    expect(ra.score).toBe(3);
    expect(rb.score).toBe(2);

    await expect(
      submitCustomQuizAnswers(db, { quiz, teamId: a.id, answers: [0, 0, 0] }),
    ).rejects.toBeInstanceOf(AlreadySubmittedError);

    const board = await getCustomQuizLeaderboard(db, quiz.id);
    expect(board.map((r) => r.displayName)).toEqual(["Team A", "Team B"]);
    expect(board[0].rank).toBe(1);
  });
});
