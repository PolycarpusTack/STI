import { describe, test, expect, mock, beforeEach } from "bun:test";

// Named mocks so individual tests can configure return values.
const mockIssueFindMany = mock(() => Promise.resolve([]));
const mockIssueCount = mock(() => Promise.resolve(0));
const mockSuppressionFindMany = mock(() => Promise.resolve([]));

mock.module("@/lib/db", () => ({
  db: {
    issue: {
      findMany: mockIssueFindMany,
      count: mockIssueCount,
    },
    suppression: {
      findMany: mockSuppressionFindMany,
    },
  },
}));

const { GET } = await import("./route");

function makeRequest(params: Record<string, string>) {
  const url = new URL("http://localhost/api/issues");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Request(url.toString()) as import("next/server").NextRequest;
}

// ── Lean validation ───────────────────────────────────────────────────────────

describe("GET /api/issues — lean validation", () => {
  beforeEach(() => {
    mockIssueFindMany.mockReset();
    mockIssueFindMany.mockResolvedValue([]);
    mockSuppressionFindMany.mockReset();
    mockSuppressionFindMany.mockResolvedValue([]);
  });

  test("returns 400 for an invalid lean value", async () => {
    const res = await GET(makeRequest({ view: "inbox", lean: "BOGUS" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("lean");
  });

  test("returns 400 for a capitalised lean value", async () => {
    const res = await GET(makeRequest({ view: "inbox", lean: "Jira" }));
    expect(res.status).toBe(400);
  });

  test("accepts a valid lean without error", async () => {
    const res = await GET(makeRequest({ view: "inbox", lean: "jira" }));
    expect(res.status).toBe(200);
  });

  test("accepts a request with no lean filter", async () => {
    const res = await GET(makeRequest({ view: "inbox" }));
    expect(res.status).toBe(200);
  });
});

// ── View validation ───────────────────────────────────────────────────────────

describe("GET /api/issues — view validation", () => {
  test("returns 400 for an unrecognised view", async () => {
    const res = await GET(makeRequest({ view: "unknown" }));
    expect(res.status).toBe(400);
  });
});

// ── Retroactive suppression (TASK-3.1) ───────────────────────────────────────

describe("GET /api/issues — inbox excludes suppressed fingerprints", () => {
  beforeEach(() => {
    mockIssueFindMany.mockReset();
    mockIssueFindMany.mockResolvedValue([]);
    mockSuppressionFindMany.mockReset();
  });

  test("queries suppressions when fetching inbox", async () => {
    mockSuppressionFindMany.mockResolvedValueOnce([]);
    await GET(makeRequest({ view: "inbox" }));
    expect(mockSuppressionFindMany).toHaveBeenCalledTimes(1);
  });

  test("passes suppressed fingerprints as notIn to issue query", async () => {
    mockSuppressionFindMany.mockResolvedValueOnce([
      { fingerprint: "fp-abc", scope: "global", tenantValue: null },
      { fingerprint: "fp-xyz", scope: "global", tenantValue: null },
    ]);

    await GET(makeRequest({ view: "inbox" }));

    const callArg = mockIssueFindMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
    };
    expect((callArg.where.fingerprint as { notIn: string[] }).notIn).toEqual(
      expect.arrayContaining(["fp-abc", "fp-xyz"])
    );
  });

  test("inbox still works when there are no suppressions", async () => {
    mockSuppressionFindMany.mockResolvedValueOnce([]);

    const res = await GET(makeRequest({ view: "inbox" }));
    expect(res.status).toBe(200);
  });

  test("does not query suppressions for watchlist view", async () => {
    mockSuppressionFindMany.mockResolvedValue([]);
    await GET(makeRequest({ view: "watchlist" }));
    expect(mockSuppressionFindMany).not.toHaveBeenCalled();
  });
});

// ── Tenant-scoped suppression (TASK-3.2) ─────────────────────────────────────

const MINIMAL_ISSUE = (overrides: Partial<{
  id: string; fingerprint: string; projectId: string;
}> = {}) => ({
  id: overrides.id ?? "i1",
  sentryIssueId: "s1",
  projectId: overrides.projectId ?? "project-A",
  fingerprint: overrides.fingerprint ?? "fp-abc",
  title: "Test issue",
  level: "error",
  status: "unresolved",
  environment: "production",
  release: null,
  eventCount: 1,
  firstSeen: new Date(),
  lastSeen: new Date(),
  culprit: "",
  stacktrace: null,
  tags: "{}",
  brief: null,
  decisions: [],
});

describe("GET /api/issues — tenant-scoped suppression", () => {
  beforeEach(() => {
    mockIssueFindMany.mockReset();
    mockSuppressionFindMany.mockReset();
  });

  test("global suppression still excludes all matching-fingerprint issues", async () => {
    mockSuppressionFindMany.mockResolvedValueOnce([
      { fingerprint: "fp-abc", scope: "global", tenantValue: null },
    ]);
    mockIssueFindMany.mockResolvedValueOnce([]);

    const res = await GET(makeRequest({ view: "inbox" }));
    expect(res.status).toBe(200);
    const callArg = mockIssueFindMany.mock.calls[0][0] as { where: Record<string, unknown> };
    expect((callArg.where.fingerprint as { notIn: string[] }).notIn).toContain("fp-abc");
  });

  test("tenant suppression does not exclude issue from a different project", async () => {
    mockSuppressionFindMany.mockResolvedValueOnce([
      { fingerprint: "fp-abc", scope: "tenant", tenantValue: "project-A" },
    ]);
    // DB returns an issue from project-B with same fingerprint
    mockIssueFindMany.mockResolvedValueOnce([
      MINIMAL_ISSUE({ fingerprint: "fp-abc", projectId: "project-B" }),
    ]);

    const res = await GET(makeRequest({ view: "inbox" }));
    const body = await res.json();
    expect(body.issues).toHaveLength(1);
  });

  test("tenant suppression excludes issue from the suppressed project", async () => {
    mockSuppressionFindMany.mockResolvedValueOnce([
      { fingerprint: "fp-abc", scope: "tenant", tenantValue: "project-A" },
    ]);
    // DB handles the exclusion; mock returns empty as it would in production
    mockIssueFindMany.mockResolvedValueOnce([]);

    const res = await GET(makeRequest({ view: "inbox" }));
    const body = await res.json();
    expect(body.issues).toHaveLength(0);

    // Verify the NOT exclusion is passed to the DB query
    const callArg = mockIssueFindMany.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(callArg.where.NOT).toBeDefined();
  });

  test("tenant suppression does not add fingerprint to global notIn list", async () => {
    mockSuppressionFindMany.mockResolvedValueOnce([
      { fingerprint: "fp-tenant-only", scope: "tenant", tenantValue: "project-A" },
    ]);
    mockIssueFindMany.mockResolvedValueOnce([]);

    await GET(makeRequest({ view: "inbox" }));
    const callArg = mockIssueFindMany.mock.calls[0][0] as { where: Record<string, unknown> };
    const notIn = (callArg.where.fingerprint as { notIn: string[] }).notIn;
    expect(notIn).not.toContain("fp-tenant-only");
  });
});

// ── Project filter ─────────────────────────────────────────────────────────────

describe("GET /api/issues — project filter", () => {
  beforeEach(() => {
    mockIssueFindMany.mockReset();
    mockIssueFindMany.mockResolvedValue([]);
    mockSuppressionFindMany.mockReset();
    mockSuppressionFindMany.mockResolvedValue([]);
    mockIssueCount.mockReset();
    mockIssueCount.mockResolvedValue(0);
  });

  test("passes projectId filter to DB when project param is provided", async () => {
    await GET(makeRequest({ view: "inbox", project: "my-proj" }));
    const callArg = mockIssueFindMany.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(callArg.where.projectId).toBe("my-proj");
  });

  test("does not add projectId to where clause when project param is absent", async () => {
    await GET(makeRequest({ view: "inbox" }));
    const callArg = mockIssueFindMany.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(callArg.where.projectId).toBeUndefined();
  });

  test("passes projectId filter to count query", async () => {
    await GET(makeRequest({ view: "inbox", project: "my-proj" }));
    const countArg = mockIssueCount.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(countArg.where.projectId).toBe("my-proj");
  });
});

// ── since=24h filter ───────────────────────────────────────────────────────────

describe("GET /api/issues — since=24h filter", () => {
  beforeEach(() => {
    mockIssueFindMany.mockReset();
    mockIssueFindMany.mockResolvedValue([]);
    mockSuppressionFindMany.mockReset();
    mockSuppressionFindMany.mockResolvedValue([]);
    mockIssueCount.mockReset();
    mockIssueCount.mockResolvedValue(0);
  });

  test("adds lastSeen gte filter when since=24h", async () => {
    const before = Date.now();
    await GET(makeRequest({ view: "inbox", since: "24h" }));
    const after = Date.now();

    const callArg = mockIssueFindMany.mock.calls[0][0] as {
      where: { lastSeen?: { gte: Date } };
    };
    expect(callArg.where.lastSeen).toBeDefined();
    const cutoff = callArg.where.lastSeen!.gte.getTime();
    expect(cutoff).toBeGreaterThanOrEqual(before - 86_400_000);
    expect(cutoff).toBeLessThanOrEqual(after - 86_400_000 + 100);
  });

  test("does not add lastSeen filter when since param is absent", async () => {
    await GET(makeRequest({ view: "inbox" }));
    const callArg = mockIssueFindMany.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(callArg.where.lastSeen).toBeUndefined();
  });

  test("ignores unrecognised since values", async () => {
    await GET(makeRequest({ view: "inbox", since: "7d" }));
    const callArg = mockIssueFindMany.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(callArg.where.lastSeen).toBeUndefined();
  });
});
