import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test";

// ── Mocks (must be declared before dynamic imports) ───────────────────────────
// Only mock modules that have external side effects (DB, filesystem).
// Network calls are stubbed via globalThis.fetch to avoid cross-file mock leakage.

const mockSettingFindUnique = mock(async () => null as { key: string; value: string } | null);
const mockSuppressionFindMany = mock(async () => [] as { fingerprint: string }[]);
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
    setting:     { findUnique: mockSettingFindUnique },
    suppression: { findMany: mockSuppressionFindMany },
    issue:       { upsert: mockIssueUpsert },
    brief:       { findUnique: mockBriefFindUnique },
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
// getEffectiveSetting calls db.setting.findUnique once per credential.

describe("getSentryConfig", () => {
  beforeEach(() => mockSettingFindUnique.mockReset());

  test("returns config object when all three credentials are set", async () => {
    mockSettingFindUnique
      .mockResolvedValueOnce({ key: "sentry.token",   value: "token-abc" })
      .mockResolvedValueOnce({ key: "sentry.org",     value: "my-org" })
      .mockResolvedValueOnce({ key: "sentry.project", value: "my-project" });
    const config = await getSentryConfig();
    expect(config).toEqual({ token: "token-abc", org: "my-org", project: "my-project" });
  });

  test("returns null when token is missing", async () => {
    mockSettingFindUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ key: "sentry.org",     value: "my-org" })
      .mockResolvedValueOnce({ key: "sentry.project", value: "my-project" });
    expect(await getSentryConfig()).toBeNull();
  });

  test("returns null when org is missing", async () => {
    mockSettingFindUnique
      .mockResolvedValueOnce({ key: "sentry.token",   value: "token-abc" })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ key: "sentry.project", value: "my-project" });
    expect(await getSentryConfig()).toBeNull();
  });

  test("returns null when project is missing", async () => {
    mockSettingFindUnique
      .mockResolvedValueOnce({ key: "sentry.token", value: "token-abc" })
      .mockResolvedValueOnce({ key: "sentry.org",   value: "my-org" })
      .mockResolvedValueOnce(null);
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
// Network calls are stubbed via globalThis.fetch (same pattern as sentry.test.ts).

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
  const opts = { token: "tok", org: "org", project: "proj" };
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
      .mockImplementationOnce(() => jsonResponse([issue]))   // fetchSentryIssues
      .mockImplementationOnce(() => jsonResponse({}));       // fetchLatestEvent

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
      .mockImplementationOnce(() => jsonResponse([issue]));  // fetchSentryIssues only

    const { stats } = await ingestIssues(opts);

    expect(stats.suppressed).toBe(1);
    expect(stats.ingested).toBe(0);
    expect(mockIssueUpsert).not.toHaveBeenCalled();
  });
});
