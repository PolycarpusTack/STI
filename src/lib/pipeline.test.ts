import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test";

const mockSettingFindUnique = mock(async () => null as { key: string; value: string } | null);
const mockSuppressionFindMany = mock(async () => [] as { fingerprint: string }[]);
const mockSentryProjectFindMany = mock(async () => [] as { slug: string }[]);
const mockIssueUpsert = mock(async (args: { create: { sentryIssueId: string } }) => ({
  id: "issue-1",
  sentryIssueId: args.create.sentryIssueId,
  brief: null,
}));
const mockReadMeta = mock(() => ({ lastPullAt: null, lastPullStats: null }));
const mockWriteMeta = mock((_patch: unknown) => undefined);
const mockGenerateBrief = mock(async (_id: string, _config?: unknown) => undefined);

mock.module("@/lib/db", () => ({
  db: {
    setting:       { findUnique: mockSettingFindUnique },
    suppression:   { findMany: mockSuppressionFindMany },
    sentryProject: { findMany: mockSentryProjectFindMany },
    issue:         { upsert: mockIssueUpsert },
  },
}));

mock.module("@/lib/meta", () => ({
  readMeta:  mockReadMeta,
  writeMeta: mockWriteMeta,
}));

mock.module("@/lib/brief", () => ({ generateBrief: mockGenerateBrief }));

const { getSentryConfig, ingestIssues, isPipelineRunning } =
  await import("@/lib/pipeline");

// ── getSentryConfig ───────────────────────────────────────────────────────────

describe("getSentryConfig", () => {
  beforeEach(() => {
    mockSettingFindUnique.mockReset();
    mockSentryProjectFindMany.mockReset();
    mockSentryProjectFindMany.mockResolvedValue([]); // empty table → falls back to sentry.project
  });

  test("returns config with projects array when all credentials are set (fallback path)", async () => {
    mockSettingFindUnique
      .mockResolvedValueOnce({ key: "sentry.token",   value: "token-abc" })
      .mockResolvedValueOnce({ key: "sentry.org",     value: "my-org" })
      .mockResolvedValueOnce({ key: "sentry.project", value: "my-project" });
    const config = await getSentryConfig();
    expect(config).toEqual({ token: "token-abc", org: "my-org", projects: ["my-project"] });
  });

  test("returns config with multiple projects from DB when table is populated", async () => {
    mockSettingFindUnique
      .mockResolvedValueOnce({ key: "sentry.token", value: "token-abc" })
      .mockResolvedValueOnce({ key: "sentry.org",   value: "my-org" });
    mockSentryProjectFindMany.mockResolvedValue([
      { slug: "proj-a" },
      { slug: "proj-b" },
    ]);
    const config = await getSentryConfig();
    expect(config).toEqual({ token: "token-abc", org: "my-org", projects: ["proj-a", "proj-b"] });
  });

  test("returns null when token is missing", async () => {
    mockSettingFindUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ key: "sentry.org", value: "my-org" });
    expect(await getSentryConfig()).toBeNull();
  });

  test("returns null when org is missing", async () => {
    mockSettingFindUnique
      .mockResolvedValueOnce({ key: "sentry.token", value: "token-abc" })
      .mockResolvedValueOnce(null);
    expect(await getSentryConfig()).toBeNull();
  });

  test("returns null when project is missing from both DB and settings", async () => {
    mockSettingFindUnique
      .mockResolvedValueOnce({ key: "sentry.token", value: "token-abc" })
      .mockResolvedValueOnce({ key: "sentry.org",   value: "my-org" })
      .mockResolvedValueOnce(null); // sentry.project fallback also missing
    expect(await getSentryConfig()).toBeNull();
  });
});

// ── isPipelineRunning ─────────────────────────────────────────────────────────

describe("isPipelineRunning", () => {
  test("returns false initially", () => {
    expect(isPipelineRunning()).toBe(false);
  });
});

// ── ingestIssues — fingerprint fallback ───────────────────────────────────────

const makeSentryIssue = (id: string, fingerprints: string[]) => ({
  id,
  title: "Test error",
  culprit: "test.ts:1",
  firstSeen: new Date().toISOString(),
  lastSeen: new Date().toISOString(),
  level: "error",
  status: "unresolved",
  count: "1",
  project: { id: "p1", slug: "my-project", name: "My Project" },
  tags: [],
  fingerprints,
});

const jsonResponse = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

// Reusable empty-stats response (fetchIssueStats returns non-ok → empty array)
const statsResponse = () => jsonResponse([], 200);

describe("ingestIssues — fingerprint fallback", () => {
  const opts = { token: "tok", org: "org", projects: ["proj"] };
  const _originalFetch = globalThis.fetch;

  beforeEach(() => {
    mockSuppressionFindMany.mockReset();
    mockIssueUpsert.mockReset();
    mockReadMeta.mockReturnValue({ lastPullAt: null, lastPullStats: null });
    mockSuppressionFindMany.mockResolvedValue([]);
    mockIssueUpsert.mockResolvedValue({ id: "issue-1", sentryIssueId: "S-1", brief: null });
  });

  afterEach(() => {
    globalThis.fetch = _originalFetch;
  });

  test("uses first fingerprint when fingerprints array is non-empty", async () => {
    const issue = makeSentryIssue("S-1", ["fp-custom-fingerprint", "fp-secondary"]);
    globalThis.fetch = mock()
      .mockImplementationOnce(() => jsonResponse([issue]))  // fetchSentryIssues
      .mockImplementationOnce(() => jsonResponse({}))       // fetchLatestEvent (parallel)
      .mockImplementationOnce(() => statsResponse());       // fetchIssueStats  (parallel)

    await ingestIssues(opts);

    const upsertCall = mockIssueUpsert.mock.calls[0][0] as { create: { fingerprint: string } };
    expect(upsertCall.create.fingerprint).toBe("fp-custom-fingerprint");
  });

  test("falls back to issue ID when fingerprints array is empty", async () => {
    const issue = makeSentryIssue("S-99", []);
    mockIssueUpsert.mockResolvedValue({ id: "issue-1", sentryIssueId: "S-99", brief: null });
    globalThis.fetch = mock()
      .mockImplementationOnce(() => jsonResponse([issue]))  // fetchSentryIssues
      .mockImplementationOnce(() => jsonResponse({}))       // fetchLatestEvent (parallel)
      .mockImplementationOnce(() => statsResponse());       // fetchIssueStats  (parallel)

    await ingestIssues(opts);

    const upsertCall = mockIssueUpsert.mock.calls[0][0] as { create: { fingerprint: string } };
    expect(upsertCall.create.fingerprint).toBe("S-99");
  });

  test("skips suppressed fingerprints and increments suppressed count", async () => {
    mockSuppressionFindMany.mockResolvedValue([{ fingerprint: "fp-suppressed" }]);
    const issue = makeSentryIssue("S-100", ["fp-suppressed"]);
    globalThis.fetch = mock()
      .mockImplementationOnce(() => jsonResponse([issue]));

    const { stats } = await ingestIssues(opts);

    expect(stats.suppressed).toBe(1);
    expect(stats.ingested).toBe(0);
    expect(mockIssueUpsert).not.toHaveBeenCalled();
  });

  test("continues to next project when fetch fails for one project", async () => {
    const multiOpts = { token: "tok", org: "org", projects: ["proj-a", "proj-b"] };
    const issue2 = makeSentryIssue("S-2", ["fp-2"]);
    globalThis.fetch = mock()
      .mockImplementationOnce(() => Promise.reject(new Error("403 Forbidden")))  // proj-a fails
      .mockImplementationOnce(() => jsonResponse([issue2]))                        // proj-b list
      .mockImplementationOnce(() => jsonResponse({}))                              // fetchLatestEvent for S-2 (parallel)
      .mockImplementationOnce(() => statsResponse());                              // fetchIssueStats for S-2 (parallel)
    mockIssueUpsert.mockResolvedValue({ id: "issue-2", sentryIssueId: "S-2", brief: null });

    const { stats } = await ingestIssues(multiOpts);

    expect(stats.errors).toBe(1);
    expect(stats.ingested).toBe(1);
    expect(mockIssueUpsert).toHaveBeenCalledTimes(1);
  });

  test("ingests issues from multiple projects in sequence", async () => {
    const multiOpts = { token: "tok", org: "org", projects: ["proj-a", "proj-b"] };
    const issue1 = makeSentryIssue("S-1", ["fp-1"]);
    const issue2 = makeSentryIssue("S-2", ["fp-2"]);
    globalThis.fetch = mock()
      .mockImplementationOnce(() => jsonResponse([issue1]))  // fetchSentryIssues for proj-a
      .mockImplementationOnce(() => jsonResponse({}))        // fetchLatestEvent for S-1 (parallel)
      .mockImplementationOnce(() => statsResponse())         // fetchIssueStats for S-1 (parallel)
      .mockImplementationOnce(() => jsonResponse([issue2]))  // fetchSentryIssues for proj-b
      .mockImplementationOnce(() => jsonResponse({}))        // fetchLatestEvent for S-2 (parallel)
      .mockImplementationOnce(() => statsResponse());        // fetchIssueStats for S-2 (parallel)
    mockIssueUpsert
      .mockResolvedValueOnce({ id: "issue-1", sentryIssueId: "S-1", brief: null })
      .mockResolvedValueOnce({ id: "issue-2", sentryIssueId: "S-2", brief: null });

    const { stats } = await ingestIssues(multiOpts);

    expect(stats.ingested).toBe(2);
    expect(mockIssueUpsert).toHaveBeenCalledTimes(2);
    const calls = mockIssueUpsert.mock.calls;
    expect((calls[0][0] as { create: { sentryIssueId: string } }).create.sentryIssueId).toBe("S-1");
    expect((calls[1][0] as { create: { sentryIssueId: string } }).create.sentryIssueId).toBe("S-2");
  });
});

// ── ingestIssues — statsJson ──────────────────────────────────────────────────

describe("ingestIssues — statsJson", () => {
  const _originalFetch = globalThis.fetch;
  const statsIssue = {
    id: "s1",
    title: "Test error",
    culprit: "test.ts:1",
    firstSeen: new Date().toISOString(),
    lastSeen: new Date().toISOString(),
    level: "error",
    status: "unresolved",
    count: "1",
    project: { id: "p1", slug: "proj", name: "Proj" },
    tags: [],
    fingerprints: ["fp-1"],
  };
  // Raw stats data returned by the Sentry stats endpoint
  const rawStats: [number, number][] = [
    [1745280000, 10], [1745366400, 5],  [1745452800, 20],
    [1745539200, 15], [1745625600, 30], [1745712000, 25],
    [1745798400, 40],
  ];

  beforeEach(() => {
    mockSuppressionFindMany.mockReset();
    mockSuppressionFindMany.mockResolvedValue([]);
    mockIssueUpsert.mockReset();
    mockIssueUpsert.mockResolvedValue({ id: "issue-1", sentryIssueId: "s1", brief: null });
    // fetchSentryIssues → one issue; then in parallel: fetchLatestEvent + fetchIssueStats
    globalThis.fetch = mock()
      .mockImplementationOnce(() => jsonResponse([statsIssue]))    // fetchSentryIssues
      .mockImplementationOnce(() => jsonResponse({}))              // fetchLatestEvent (parallel)
      .mockImplementationOnce(() => jsonResponse(rawStats));       // fetchIssueStats  (parallel)
  });

  afterEach(() => {
    globalThis.fetch = _originalFetch;
  });

  test("stores statsJson on issue upsert create", async () => {
    await ingestIssues({ token: "tok", org: "org", projects: ["proj"] });
    const upsertCall = mockIssueUpsert.mock.calls[0][0] as { create: { statsJson?: string } };
    expect(upsertCall.create.statsJson).toBe(JSON.stringify([10, 5, 20, 15, 30, 25, 40]));
  });

  test("stores null statsJson when fetchIssueStats returns empty", async () => {
    globalThis.fetch = mock()
      .mockImplementationOnce(() => jsonResponse([statsIssue]))    // fetchSentryIssues
      .mockImplementationOnce(() => jsonResponse({}))              // fetchLatestEvent (parallel)
      .mockImplementationOnce(() => jsonResponse([], 403));        // fetchIssueStats fails → empty
    await ingestIssues({ token: "tok", org: "org", projects: ["proj"] });
    const upsertCall = mockIssueUpsert.mock.calls[0][0] as { create: { statsJson?: string | null } };
    expect(upsertCall.create.statsJson).toBeNull();
  });
});
