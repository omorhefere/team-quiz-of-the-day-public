import { describe, expect, it } from "vitest";
import {
  ADJECTIVES,
  ANIMALS,
  CODE_SPACE,
  generateTeamCode,
  isTeamCodeFormat,
  normalizeTeamCode,
} from "./code";

describe("generateTeamCode", () => {
  it("produces ADJECTIVE-ANIMAL-NN format", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateTeamCode();
      expect(isTeamCodeFormat(code)).toBe(true);
      const [adj, animal, num] = code.split("-");
      expect(ADJECTIVES).toContain(adj);
      expect(ANIMALS).toContain(animal);
      expect(num).toMatch(/^\d{2}$/);
    }
  });

  it("has a code space large enough to make collisions rare", () => {
    expect(CODE_SPACE).toBeGreaterThan(100_000);
  });

  it("produces varied codes", () => {
    const codes = new Set(Array.from({ length: 100 }, generateTeamCode));
    expect(codes.size).toBeGreaterThan(50);
  });
});

describe("normalizeTeamCode", () => {
  it("uppercases and trims", () => {
    expect(normalizeTeamCode("  blue-fox-71 ")).toBe("BLUE-FOX-71");
  });
});

describe("isTeamCodeFormat", () => {
  it("accepts well-formed codes (case-insensitive)", () => {
    expect(isTeamCodeFormat("BLUE-FOX-71")).toBe(true);
    expect(isTeamCodeFormat("blue-fox-71")).toBe(true);
  });
  it("rejects malformed codes", () => {
    expect(isTeamCodeFormat("BLUE-FOX")).toBe(false);
    expect(isTeamCodeFormat("BLUE-FOX-7")).toBe(false);
    expect(isTeamCodeFormat("BLUE_FOX_71")).toBe(false);
    expect(isTeamCodeFormat("123-456-78")).toBe(false);
  });
});
