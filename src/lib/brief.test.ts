import { describe, test, expect } from "bun:test";
import { parseSentinelResponse } from "./brief";

const VALID_OUTPUT = {
  lean: "jira",
  confidence: 0.9,
  priority: "P1",
  issueType: "Bug",
  summary: "Something is broken for users.",
  module: "checkout",
  tenantImpact: "All users",
  reproductionHint: "Null reference in payment handler.",
  confidenceNotes: null,
  signals: null,
};

describe("parseSentinelResponse", () => {
  test("parses valid JSON string", () => {
    const result = parseSentinelResponse(JSON.stringify(VALID_OUTPUT));
    expect(result).not.toBeNull();
    expect(result!.lean).toBe("jira");
    expect(result!.priority).toBe("P1");
    expect(result!.issueType).toBe("Bug");
    expect(result!.confidence).toBe(0.9);
    expect(result!.summary).toBe("Something is broken for users.");
  });

  test("parses JSON wrapped in markdown code fence", () => {
    const fenced = "```json\n" + JSON.stringify(VALID_OUTPUT) + "\n```";
    const result = parseSentinelResponse(fenced);
    expect(result).not.toBeNull();
    expect(result!.lean).toBe("jira");
  });

  test("parses JSON wrapped in plain code fence", () => {
    const fenced = "```\n" + JSON.stringify(VALID_OUTPUT) + "\n```";
    const result = parseSentinelResponse(fenced);
    expect(result).not.toBeNull();
    expect(result!.lean).toBe("jira");
  });

  test("returns null for completely invalid input", () => {
    expect(parseSentinelResponse("not json at all")).toBeNull();
  });

  test("returns null when lean is missing", () => {
    const { lean: _lean, ...rest } = VALID_OUTPUT;
    expect(parseSentinelResponse(JSON.stringify(rest))).toBeNull();
  });

  test("returns null when confidence is missing", () => {
    const { confidence: _confidence, ...rest } = VALID_OUTPUT;
    expect(parseSentinelResponse(JSON.stringify(rest))).toBeNull();
  });

  test("returns null when summary is missing", () => {
    const { summary: _summary, ...rest } = VALID_OUTPUT;
    expect(parseSentinelResponse(JSON.stringify(rest))).toBeNull();
  });

  test("clamps confidence to [0, 1]", () => {
    const result = parseSentinelResponse(JSON.stringify({ ...VALID_OUTPUT, confidence: 1.5 }));
    expect(result!.confidence).toBe(1);

    const result2 = parseSentinelResponse(JSON.stringify({ ...VALID_OUTPUT, confidence: -0.5 }));
    expect(result2!.confidence).toBe(0);
  });

  test("falls back to investigate for unknown lean value", () => {
    const result = parseSentinelResponse(JSON.stringify({ ...VALID_OUTPUT, lean: "unknown-lean" }));
    expect(result).not.toBeNull();
    expect(result!.lean).toBe("investigate");
  });

  test("falls back to empty string for unknown priority value", () => {
    const result = parseSentinelResponse(JSON.stringify({ ...VALID_OUTPUT, priority: "P9" }));
    expect(result).not.toBeNull();
    expect(result!.priority).toBe("");
  });

  test("falls back to empty string for unknown issueType value", () => {
    const result = parseSentinelResponse(JSON.stringify({ ...VALID_OUTPUT, issueType: "Mystery" }));
    expect(result).not.toBeNull();
    expect(result!.issueType).toBe("");
  });

  test("accepts all valid lean values", () => {
    for (const lean of ["jira", "close", "investigate", "watchlist"]) {
      const result = parseSentinelResponse(JSON.stringify({ ...VALID_OUTPUT, lean }));
      expect(result!.lean).toBe(lean);
    }
  });

  test("accepts all valid priority values", () => {
    for (const priority of ["P0", "P1", "P2", "P3", "Noise"]) {
      const result = parseSentinelResponse(JSON.stringify({ ...VALID_OUTPUT, priority }));
      expect(result!.priority).toBe(priority);
    }
  });

  test("accepts all valid issueType values", () => {
    for (const issueType of ["Bug", "Regression", "Integration", "User Error", "External", "Infrastructure"]) {
      const result = parseSentinelResponse(JSON.stringify({ ...VALID_OUTPUT, issueType }));
      expect(result!.issueType).toBe(issueType);
    }
  });

  test("handles null nullable fields", () => {
    const result = parseSentinelResponse(JSON.stringify({
      ...VALID_OUTPUT,
      reproductionHint: null,
      confidenceNotes: null,
      signals: null,
    }));
    expect(result!.reproductionHint).toBeNull();
    expect(result!.confidenceNotes).toBeNull();
    expect(result!.signals).toBeNull();
  });

  test("handles present nullable fields", () => {
    const result = parseSentinelResponse(JSON.stringify({
      ...VALID_OUTPUT,
      reproductionHint: "Try hitting /checkout with empty cart.",
      confidenceNotes: "Missing release tag.",
      signals: "Spike after v2.1.0.",
    }));
    expect(result!.reproductionHint).toBe("Try hitting /checkout with empty cart.");
    expect(result!.confidenceNotes).toBe("Missing release tag.");
    expect(result!.signals).toBe("Spike after v2.1.0.");
  });
});
