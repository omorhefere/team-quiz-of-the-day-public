import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "./client";
import { dailySubmissions, decks, teams } from "./schema";

describe("database schema (PGlite)", () => {
  it("applies migrations and supports basic CRUD across all tables", async () => {
    const db = await createTestDb();

    const [team] = await db
      .insert(teams)
      .values({ code: "BLUE-FOX-71", displayName: "Blue Fox" })
      .returning();
    expect(team.id).toBeTruthy();
    expect(team.code).toBe("BLUE-FOX-71");

    await db.insert(decks).values({
      deckDate: "2026-06-05",
      questions: [
        { q: "2+2?", choices: ["3", "4", "5", "6"], correct_idx: 1 },
      ],
      publishedAt: new Date(),
    });

    const [submission] = await db
      .insert(dailySubmissions)
      .values({
        teamId: team.id,
        deckDate: "2026-06-05",
        answers: [1],
        score: 1,
      })
      .returning();
    expect(submission.score).toBe(1);

    const found = await db.select().from(teams).where(eq(teams.code, "BLUE-FOX-71"));
    expect(found).toHaveLength(1);
  });

  it("enforces one submission per team per day", async () => {
    const db = await createTestDb();
    const [team] = await db
      .insert(teams)
      .values({ code: "RED-OWL-22", displayName: "Red Owl" })
      .returning();
    await db.insert(decks).values({
      deckDate: "2026-06-05",
      questions: [],
    });

    await db.insert(dailySubmissions).values({
      teamId: team.id,
      deckDate: "2026-06-05",
      answers: [],
      score: 0,
    });

    await expect(
      db.insert(dailySubmissions).values({
        teamId: team.id,
        deckDate: "2026-06-05",
        answers: [],
        score: 5,
      }),
    ).rejects.toThrow();
  });

  it("enforces unique team codes", async () => {
    const db = await createTestDb();
    await db.insert(teams).values({ code: "DUP-CODE-01", displayName: "A" });
    await expect(
      db.insert(teams).values({ code: "DUP-CODE-01", displayName: "B" }),
    ).rejects.toThrow();
  });
});
