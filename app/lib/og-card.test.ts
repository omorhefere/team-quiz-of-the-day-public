import { describe, expect, it } from "vitest";
import { renderScoreCardPng, scoreCardSvg } from "./og-card";

const card = {
  displayName: "Platform Engineering",
  deckDate: "2026-06-05",
  score: 8,
  rank: 3,
  total: 42,
};

describe("scoreCardSvg", () => {
  it("includes the score, rank and team name", () => {
    const svg = scoreCardSvg(card);
    expect(svg).toContain("Platform Engineering");
    expect(svg).toContain(">8<");
    expect(svg).toContain("Rank #3 of 42 teams today");
  });

  it("escapes XML-significant characters in the team name", () => {
    const svg = scoreCardSvg({ ...card, displayName: "A & B <Team>" });
    expect(svg).toContain("A &amp; B &lt;Team&gt;");
    expect(svg).not.toContain("<Team>");
  });

  it("truncates very long names", () => {
    const svg = scoreCardSvg({ ...card, displayName: "x".repeat(40) });
    expect(svg).toContain("…");
  });

  it("uses singular 'team' when only one played", () => {
    expect(scoreCardSvg({ ...card, total: 1 })).toContain("of 1 team today");
  });
});

describe("renderScoreCardPng", () => {
  it("renders a valid PNG buffer", () => {
    const png = renderScoreCardPng(card);
    expect(png.length).toBeGreaterThan(1000);
    // PNG magic number: 89 50 4E 47.
    expect(png[0]).toBe(0x89);
    expect(png[1]).toBe(0x50);
    expect(png[2]).toBe(0x4e);
    expect(png[3]).toBe(0x47);
  });
});
