import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test";

const mockSettingFindUnique = mock(async () => null as { key: string; value: string } | null);
const mockSuppressionFindMany = mock(async () => [] as { fingerprint: string }[]);
const mockSentryProjectFindMany = mock(async () => [] as { slug: string }[]);
const mockIssueUpsert = mock(async (args: { create: { sentryIssueId: string } }) => ({
  id: "issue-1",
  sentryIssueId: args.create.sentryIssueId,
}));
const mockBriefFindUnique = mock(async () => null);
const mockReadMeta = mock(() => ({ lastPullAt: null, lastPullStats: null }));
const mockWriteMeta = mock((_patch: unknown) => undefined);
const mockGenerateBrief = mock(async (_id: string) => undefined);

mock.module("@/lib/db", () => ({
  db: {
    setting:       { findUnique: mockSettingFindUnique },
    suppression:   { findMany: mockSuppressionFindMany },
    sentryProject: { findMany: mockSentryProjectFindMany },
    issue:         { upsert: mockIssueUpsert },
    brief:         { findUnique: mockBriefFindUnique },
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

describe("ingestIssues — fingerprint fallback", () => {
  const opts = { token: "tok", org: "org", projects: ["proj"] };
  const _originalFetch = globalThis.fetch;

  beforeEach(() => {
    mockSuppressionFindMany.mockReset();
    mockIssueUpsert.mockReset();
    mockBriefFindUnique.mockReset();
    mockReadMeta.mockReturnValue({ lastPullAt: null, lastPullStats: null });
    mockSuppressionFindMany.mockResolvedValue([]);
    mockBriefFindUnique.mockResolvedValue(null);
    mockIssueUpsert.mockResolvedValue({ id: "issue-1", sentryIssueId: "S-1" });
  });

  afterEach(() => {
    globalThis.fetch = _originalFetch;
  });

  test("uses first fingerprint when fingerprints array is non-empty", async () => {
    const issue = makeSentryIssue("S-1", ["fp-custom-fingerprint", "fp-secondary"]);
    globalThis.fetch = mock()
      .mockImplementationOnce(() => jsonResponse([issue]))
      .mockImplementationOnce(() => jsonResponse({}));

    await ingestIssues(opts);

    const upsertCall = mockIssueUpsert.mock.calls[0][0] as { create: { fingerprint: string } };
    expect(upsertCall.create.fingerprint).toBe("fp-custom-fingerprint");
  });

  test("falls back to issue ID when fingerprints array is empty", async () => {
    const issue = makeSentryIssue("S-99", []);
    mockIssueUpsert.mockResolvedValue({ id: "issue-1", sentryIssueId: "S-99" });
    globalThis.fetch = mock()
      .mockImplementationOnce(() => jsonResponse([issue]))
      .mockImplementationOnce(() => jsonResponse({}));

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

  test("ingests issues from multiple projects in sequence", async () => {
    const multiOpts = { token: "tok", org: "org", projects: ["proj-a", "proj-b"] };
    const issue1 = makeSentryIssue("S-1", ["fp-1"]);
    const issue2 = makeSentryIssue("S-2", ["fp-2"]);
    globalThis.fetch = mock()
      .mockImplementationOnce(() => jsonResponse([issue1]))  // fetchSentryIssues for proj-a
      .mockImplementationOnce(() => jsonResponse({}))        // fetchLatestEvent for S-1
      .mockImplementationOnce(() => jsonResponse([issue2]))  // fetchSentryIssues for proj-b
      .mockImplementationOnce(() => jsonResponse({}));       // fetchLatestEvent for S-2
    mockIssueUpsert
      .mockResolvedValueOnce({ id: "issue-1", sentryIssueId: "S-1" })
      .mockResolvedValueOnce({ id: "issue-2", sentryIssueId: "S-2" });

    const { stats } = await ingestIssues(multiOpts);

    expect(stats.ingested).toBe(2);
    expect(mockIssueUpsert).toHaveBeenCalledTimes(2);
  });
});
