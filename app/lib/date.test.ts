import { describe, expect, it } from "vitest";
import {
  addDeckDays,
  currentUtcDeckDate,
  deckDateRange,
  isDeckDate,
  toDeckDate,
  weeklyWindow,
} from "./date";

describe("currentUtcDeckDate", () => {
  it("formats as YYYY-MM-DD in UTC", () => {
    // 2026-06-05 23:30 UTC is still the 5th in UTC.
    expect(currentUtcDeckDate(new Date("2026-06-05T23:30:00Z"))).toBe(
      "2026-06-05",
    );
  });

  it("rolls over at 00:00 UTC, not local midnight", () => {
    // One minute past UTC midnight is the next deck day.
    expect(currentUtcDeckDate(new Date("2026-06-06T00:01:00Z"))).toBe(
      "2026-06-06",
    );
    // A time that is still 'yesterday' in the Americas is already the new UTC day.
    expect(currentUtcDeckDate(new Date("2026-06-06T03:00:00Z"))).toBe(
      "2026-06-06",
    );
  });
});

describe("isDeckDate", () => {
  it("accepts valid dates", () => {
    expect(isDeckDate("2026-06-05")).toBe(true);
    expect(isDeckDate("2024-02-29")).toBe(true); // leap day
  });

  it("rejects malformed or impossible dates", () => {
    expect(isDeckDate("2026-6-5")).toBe(false);
    expect(isDeckDate("2026-13-01")).toBe(false);
    expect(isDeckDate("2026-06-31")).toBe(false);
    expect(isDeckDate("not-a-date")).toBe(false);
    expect(isDeckDate("2023-02-29")).toBe(false); // not a leap year
  });
});

describe("addDeckDays", () => {
  it("adds and subtracts across month boundaries", () => {
    expect(addDeckDays("2026-06-30", 1)).toBe("2026-07-01");
    expect(addDeckDays("2026-01-01", -1)).toBe("2025-12-31");
  });
});

describe("toDeckDate", () => {
  it("uses the UTC calendar day", () => {
    expect(toDeckDate(new Date("2026-06-05T23:59:59Z"))).toBe("2026-06-05");
  });
});

describe("deckDateRange", () => {
  it("returns an inclusive range", () => {
    expect(deckDateRange("2026-06-05", "2026-06-08")).toEqual([
      "2026-06-05",
      "2026-06-06",
      "2026-06-07",
      "2026-06-08",
    ]);
  });

  it("returns a single day for an equal range", () => {
    expect(deckDateRange("2026-06-05", "2026-06-05")).toEqual(["2026-06-05"]);
  });

  it("returns empty for an inverted range", () => {
    expect(deckDateRange("2026-06-08", "2026-06-05")).toEqual([]);
  });
});

describe("weeklyWindow", () => {
  it("returns the 7-day window ending on the given date", () => {
    const window = weeklyWindow("2026-06-07");
    expect(window).toHaveLength(7);
    expect(window[0]).toBe("2026-06-01");
    expect(window[6]).toBe("2026-06-07");
  });
});
