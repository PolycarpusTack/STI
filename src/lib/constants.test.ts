import { describe, test, expect } from "bun:test";
import { VALID_LEANS, isValidLean } from "./constants";

describe("VALID_LEANS", () => {
  test("contains exactly the four expected values", () => {
    expect(VALID_LEANS).toEqual(["jira", "close", "investigate", "watchlist"]);
  });
});

describe("isValidLean", () => {
  test.each(["jira", "close", "investigate", "watchlist"] as const)(
    "returns true for valid lean '%s'",
    (lean) => expect(isValidLean(lean)).toBe(true)
  );

  test("returns false for an invalid lean", () => {
    expect(isValidLean("BOGUS")).toBe(false);
  });

  test("returns false for null", () => {
    expect(isValidLean(null)).toBe(false);
  });

  test("is case-sensitive", () => {
    expect(isValidLean("Jira")).toBe(false);
    expect(isValidLean("CLOSE")).toBe(false);
  });
});
