import { describe, test, expect, mock, beforeEach } from "bun:test";

const mockIssueCount = mock(() => Promise.resolve(0));
const mockDecisionCount = mock(() => Promise.resolve(0));
const mockDecisionFindMany = mock(() => Promise.resolve([]));
const mockBriefCount = mock(() => Promise.resolve(0));

mock.module("@/lib/db", () => ({
  db: {
    issue: { count: mockIssueCount },
    decision: { count: mockDecisionCount, findMany: mockDecisionFindMany },
    brief: { count: mockBriefCount },
  },
}));

const mockReadMeta = mock(() => ({ lastPullAt: null, lastPullStats: null }));
mock.module("@/lib/meta", () => ({ readMeta: mockReadMeta }));

const mockGetEffectiveSetting = mock(() => Promise.resolve(null));
mock.module("@/lib/settings", () => ({
  getEffectiveSetting: mockGetEffectiveSetting,
  SETTINGS_KEYS: {
    sentryToken: "sentry.token",
    sentryOrg: "sentry.org",
    sentryProject: "sentry.project",
    llmModel: "llm.model",
  },
}));

const { GET } = await import("./route");

describe("GET /api/metrics — llmModel field (TASK-4.2)", () => {
  beforeEach(() => {
    mockIssueCount.mockReset();
    mockIssueCount.mockResolvedValue(0);
    mockDecisionCount.mockReset();
    mockDecisionCount.mockResolvedValue(0);
    mockDecisionFindMany.mockReset();
    mockDecisionFindMany.mockResolvedValue([]);
    mockBriefCount.mockReset();
    mockBriefCount.mockResolvedValue(0);
    mockReadMeta.mockReset();
    mockReadMeta.mockReturnValue({ lastPullAt: null, lastPullStats: null });
    mockGetEffectiveSetting.mockReset();
    mockGetEffectiveSetting.mockResolvedValue(null);
  });

  test("includes llmModel in response", async () => {
    const res = await GET();
    const body = await res.json();
    expect("llmModel" in body).toBe(true);
  });

  test("llmModel reflects the configured setting", async () => {
    mockGetEffectiveSetting.mockImplementation((key: string) => {
      if (key === "llm.model") return Promise.resolve("deepseek-chat");
      return Promise.resolve(null);
    });

    const res = await GET();
    const body = await res.json();
    expect(body.llmModel).toBe("deepseek-chat");
  });

  test("llmModel falls back to null when not configured", async () => {
    const res = await GET();
    const body = await res.json();
    expect(body.llmModel).toBeNull();
  });
});

// ── Disagreement rate (TASK-5.3) ──────────────────────────────────────────────

describe("GET /api/metrics — disagreement rate", () => {
  beforeEach(() => {
    mockIssueCount.mockResolvedValue(0);
    mockBriefCount.mockResolvedValue(0);
    mockReadMeta.mockReturnValue({ lastPullAt: null, lastPullStats: null });
    mockGetEffectiveSetting.mockResolvedValue(null);
  });

  test("rate is 0 when there are no decisions", async () => {
    mockDecisionCount.mockResolvedValue(0);
    mockDecisionFindMany.mockResolvedValue([]);

    const res = await GET();
    const body = await res.json();
    expect(body.disagreementRate).toBe(0);
  });

  test("rate is 0 when AI and human always agree", async () => {
    mockDecisionCount.mockResolvedValue(2);
    mockDecisionFindMany.mockResolvedValue([
      { decision: "jira", aiLean: "jira" },
      { decision: "close", aiLean: "close" },
    ]);

    const res = await GET();
    const body = await res.json();
    expect(body.disagreementRate).toBe(0);
  });

  test("rate is 50 when half are disagreements", async () => {
    mockDecisionCount.mockResolvedValue(2);
    mockDecisionFindMany.mockResolvedValue([
      { decision: "jira", aiLean: "jira" },
      { decision: "close", aiLean: "jira" },
    ]);

    const res = await GET();
    const body = await res.json();
    expect(body.disagreementRate).toBe(50);
  });

  test("watchlist decisions are excluded from disagreement rate", async () => {
    mockDecisionCount.mockResolvedValue(2);
    // DB where clause filters watchlist out; mock returns only what the DB would return
    mockDecisionFindMany.mockResolvedValue([
      { decision: "jira", aiLean: "jira" },   // agree — watchlist row excluded by DB filter
    ]);

    const res = await GET();
    const body = await res.json();
    expect(body.disagreementRate).toBe(0);
  });

  test("decisions without aiLean are not counted in the denominator", async () => {
    mockDecisionCount.mockResolvedValue(3);
    mockDecisionFindMany.mockResolvedValue([
      { decision: "jira", aiLean: "jira" },     // agree
      { decision: "close", aiLean: "jira" },    // disagree
      // third decision has no aiLean — not in findMany result since we filter aiLean != null
    ]);

    const res = await GET();
    const body = await res.json();
    expect(body.disagreementRate).toBe(50);
  });
});

describe("GET /api/metrics — sentryConfigured field (TASK-4.1)", () => {
  beforeEach(() => {
    mockIssueCount.mockResolvedValue(0);
    mockDecisionCount.mockResolvedValue(0);
    mockDecisionFindMany.mockResolvedValue([]);
    mockBriefCount.mockResolvedValue(0);
    mockReadMeta.mockReturnValue({ lastPullAt: null, lastPullStats: null });
    mockGetEffectiveSetting.mockReset();
    mockGetEffectiveSetting.mockResolvedValue(null);
  });

  test("includes sentryConfigured in response", async () => {
    const res = await GET();
    const body = await res.json();
    expect("sentryConfigured" in body).toBe(true);
  });

  test("sentryConfigured is true when token, org and project are all set", async () => {
    mockGetEffectiveSetting.mockImplementation((key: string) => {
      if (["sentry.token", "sentry.org", "sentry.project"].includes(key))
        return Promise.resolve("value");
      return Promise.resolve(null);
    });

    const res = await GET();
    const body = await res.json();
    expect(body.sentryConfigured).toBe(true);
  });

  test("sentryConfigured is false when any sentry setting is missing", async () => {
    mockGetEffectiveSetting.mockImplementation((key: string) => {
      if (key === "sentry.token") return Promise.resolve("tok");
      return Promise.resolve(null); // org and project missing
    });

    const res = await GET();
    const body = await res.json();
    expect(body.sentryConfigured).toBe(false);
  });
});
