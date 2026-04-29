import { describe, test, expect } from "bun:test";
import { getIsoWeek, isoWeekToDateRange } from "./iso-week";

describe("getIsoWeek", () => {
  test("2025-04-28 is week 18 of 2025 (Monday)", () => {
    expect(getIsoWeek(new Date("2025-04-28"))).toEqual({ isoYear: 2025, isoWeek: 18 });
  });

  test("2025-05-02 is week 18 of 2025 (Friday)", () => {
    expect(getIsoWeek(new Date("2025-05-02"))).toEqual({ isoYear: 2025, isoWeek: 18 });
  });

  test("2025-01-01 is week 1 of 2025", () => {
    expect(getIsoWeek(new Date("2025-01-01"))).toEqual({ isoYear: 2025, isoWeek: 1 });
  });

  test("2024-12-30 is week 1 of 2025 (ISO year wraps)", () => {
    expect(getIsoWeek(new Date("2024-12-30"))).toEqual({ isoYear: 2025, isoWeek: 1 });
  });
});

describe("isoWeekToDateRange", () => {
  test("week 18 of 2025 starts on Mon Apr 28", () => {
    const { monday } = isoWeekToDateRange(2025, 18);
    expect(monday.toISOString().slice(0, 10)).toBe("2025-04-28");
  });

  test("week 18 of 2025 ends on Fri May 2", () => {
    const { friday } = isoWeekToDateRange(2025, 18);
    expect(friday.toISOString().slice(0, 10)).toBe("2025-05-02");
  });
});
