import { describe, expect, it } from "vitest";
import {
  containsProfanity,
  DISPLAY_NAME_MAX,
  validateDisplayName,
} from "./profanity";

describe("containsProfanity", () => {
  it("flags profane text", () => {
    expect(containsProfanity("shit team")).toBe(true);
  });
  it("allows clean text", () => {
    expect(containsProfanity("Platform Engineering")).toBe(false);
    expect(containsProfanity("")).toBe(false);
  });
});

describe("validateDisplayName", () => {
  it("accepts a normal team name", () => {
    expect(validateDisplayName("Blue Foxes")).toBeNull();
  });
  it("rejects empty / whitespace", () => {
    expect(validateDisplayName("   ")).toBe("empty");
  });
  it("rejects too short", () => {
    expect(validateDisplayName("a")).toBe("too_short");
  });
  it("rejects too long", () => {
    expect(validateDisplayName("x".repeat(DISPLAY_NAME_MAX + 1))).toBe(
      "too_long",
    );
  });
  it("rejects profanity", () => {
    expect(validateDisplayName("shit squad")).toBe("profane");
  });
  it("accepts unicode / emoji within length", () => {
    expect(validateDisplayName("Team 🦊")).toBeNull();
  });
});
