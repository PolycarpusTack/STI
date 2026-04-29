import { describe, test, expect, mock, beforeEach } from "bun:test";

// Mock db before importing the route.
const mockGetJiraConfig = mock(() => Promise.resolve(null));
const mockCreateJiraIssue = mock(() => Promise.resolve({ key: "PLATFORM-42", id: "10042" }));

mock.module("@/lib/jira", () => ({
  getJiraConfig: mockGetJiraConfig,
  createJiraIssue: mockCreateJiraIssue,
}));

const mockDecisionCreate = mock(() => Promise.resolve({
  id: "d1", issueId: "i1", decision: "jira", aiLean: "jira",
  responderId: "r1", jiraKey: null, jiraSummary: null,
  jiraDescription: null, jiraPriority: null, jiraComponent: null,
  jiraError: null, suppressReason: null, suppressScope: null,
  suppressed: false, briefId: null, createdAt: new Date(),
}));
const mockDecisionFindFirst = mock(() => Promise.resolve(null));
const mockDecisionDelete = mock(() => Promise.resolve({ id: "d1" }));
const mockDecisionFindMany = mock(() => Promise.resolve([]));
const mockDecisionCount = mock(() => Promise.resolve(0));
const mockIssueFindUnique = mock(() =>
  Promise.resolve({ id: "i1", sentryIssueId: "s1", title: "Test issue" })
);
const mockBriefFindUnique = mock(() =>
  Promise.resolve({ id: "b1", lean: "jira" })
);

mock.module("@/lib/db", () => ({
  db: {
    decision: {
      create: mockDecisionCreate,
      findFirst: mockDecisionFindFirst,
      delete: mockDecisionDelete,
      findMany: mockDecisionFindMany,
      count: mockDecisionCount,
    },
    issue: { findUnique: mockIssueFindUnique },
    brief: { findUnique: mockBriefFindUnique },
  },
}));

const { POST, GET } = await import("./route");

function makePostRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/decisions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as import("next/server").NextRequest;
}

function makeGetRequest(params: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/decisions");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Request(url.toString()) as import("next/server").NextRequest;
}

describe("POST /api/decisions — validation", () => {
  beforeEach(() => {
    mockDecisionCreate.mockReset();
    mockIssueFindUnique.mockResolvedValue({ id: "i1", sentryIssueId: "s1", title: "T" });
    mockBriefFindUnique.mockResolvedValue({ id: "b1", lean: "jira" });
  });

  test("returns 400 when issueId is missing", async () => {
    const res = await POST(makePostRequest({ decision: "jira" }));
    expect(res.status).toBe(400);
  });

  test("returns 400 when decision is missing", async () => {
    const res = await POST(makePostRequest({ issueId: "i1" }));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/decisions — Jira metadata persistence", () => {
  beforeEach(() => {
    mockDecisionCreate.mockReset();
    mockGetJiraConfig.mockReset();
    mockCreateJiraIssue.mockReset();
    mockIssueFindUnique.mockResolvedValue({ id: "i1", sentryIssueId: "s1", title: "T" });
    mockBriefFindUnique.mockResolvedValue({ id: "b1", lean: "jira" });
    mockGetJiraConfig.mockResolvedValue(JIRA_CONFIG);
    mockCreateJiraIssue.mockResolvedValue({ key: "PLATFORM-42", id: "10042" });
    mockDecisionCreate.mockResolvedValue({
      id: "d1", issueId: "i1", decision: "jira", aiLean: "jira",
      responderId: "r1", jiraKey: "PLATFORM-42", jiraSummary: "Bug in auth",
      jiraDescription: "Long desc", jiraPriority: "high", jiraComponent: "auth",
      jiraError: null, suppressReason: null, suppressScope: null,
      suppressed: false, briefId: "b1", createdAt: new Date(),
    });
  });

  test("persists jiraSummary from metadata", async () => {
    await POST(makePostRequest({
      issueId: "i1",
      decision: "jira",
      metadata: { summary: "Bug in auth", description: "Long desc", priority: "high", component: "auth" },
    }));

    const callArg = mockDecisionCreate.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(callArg.data.jiraSummary).toBe("Bug in auth");
    expect(callArg.data.jiraDescription).toBe("Long desc");
    expect(callArg.data.jiraPriority).toBe("high");
    expect(callArg.data.jiraComponent).toBe("auth");
  });

  test("persists suppressReason and suppressScope alongside a close decision (suppress modal flow)", async () => {
    mockDecisionCreate.mockResolvedValue({
      id: "d1", issueId: "i1", decision: "close", aiLean: null,
      responderId: "r1", jiraKey: null, jiraSummary: null,
      jiraDescription: null, jiraPriority: null, jiraComponent: null,
      jiraError: null, suppressReason: "Bot traffic", suppressScope: "global",
      suppressed: false, briefId: null, createdAt: new Date(),
    });
    await POST(makePostRequest({
      issueId: "i1",
      decision: "close",
      metadata: { suppressReason: "Bot traffic", suppressScope: "global" },
    }));

    const callArg = mockDecisionCreate.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(callArg.data.suppressReason).toBe("Bot traffic");
    expect(callArg.data.suppressScope).toBe("global");
  });

  test("metadata is optional — decision saved without it", async () => {
    await POST(makePostRequest({ issueId: "i1", decision: "close" }));
    expect(mockDecisionCreate).toHaveBeenCalledTimes(1);
    const callArg = mockDecisionCreate.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(callArg.data.jiraSummary).toBeUndefined();
  });
});

describe("GET /api/decisions — response shape", () => {
  test("returns jiraKey and suppressReason in each decision", async () => {
    mockDecisionFindMany.mockResolvedValueOnce([{
      id: "d1", issueId: "i1", decision: "jira", aiLean: "jira",
      responderId: "r1", jiraKey: "PLATFORM-42", suppressReason: null,
      createdAt: new Date(),
      issue: { title: "Crash in auth", sentryIssueId: "s1", brief: null },
    }]);
    mockDecisionCount.mockResolvedValueOnce(1);

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.decisions[0].jiraKey).toBe("PLATFORM-42");
    expect(body.decisions[0].suppressReason).toBeNull();
  });
});

// ── Jira integration ──────────────────────────────────────────────────────────

const JIRA_CONFIG = {
  baseUrl: "https://hive.atlassian.net",
  email: "user@example.com",
  apiToken: "token",
  projectKey: "PLATFORM",
};

describe("POST /api/decisions — Jira call", () => {
  beforeEach(() => {
    mockDecisionCreate.mockReset();
    mockIssueFindUnique.mockResolvedValue({ id: "i1", sentryIssueId: "s1", title: "Test issue" });
    mockBriefFindUnique.mockResolvedValue({ id: "b1", lean: "jira" });
    mockGetJiraConfig.mockReset();
    mockCreateJiraIssue.mockReset();
    mockDecisionCreate.mockResolvedValue({
      id: "d1", issueId: "i1", decision: "jira", aiLean: "jira",
      responderId: "r1", jiraKey: "PLATFORM-42", jiraSummary: "Bug",
      jiraDescription: null, jiraPriority: null, jiraComponent: null,
      jiraError: null, suppressReason: null, suppressScope: null,
      suppressed: false, briefId: "b1", createdAt: new Date(),
    });
  });

  test("calls createJiraIssue when decision is 'jira' and Jira is configured", async () => {
    mockGetJiraConfig.mockResolvedValueOnce(JIRA_CONFIG);
    mockCreateJiraIssue.mockResolvedValueOnce({ key: "PLATFORM-42", id: "10042" });

    await POST(makePostRequest({
      issueId: "i1",
      decision: "jira",
      metadata: { summary: "Widget crash", description: "Steps to reproduce" },
    }));

    expect(mockCreateJiraIssue).toHaveBeenCalledTimes(1);
    const [opts] = mockCreateJiraIssue.mock.calls[0] as [{ summary: string }, unknown];
    expect(opts.summary).toBe("Widget crash");
  });

  test("stores jiraKey in the decision data when Jira succeeds", async () => {
    mockGetJiraConfig.mockResolvedValueOnce(JIRA_CONFIG);
    mockCreateJiraIssue.mockResolvedValueOnce({ key: "PLATFORM-42", id: "10042" });

    await POST(makePostRequest({ issueId: "i1", decision: "jira", metadata: { summary: "Crash" } }));

    const callArg = mockDecisionCreate.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(callArg.data.jiraKey).toBe("PLATFORM-42");
  });

  test("response includes jiraKey at top level when Jira succeeds", async () => {
    mockGetJiraConfig.mockResolvedValueOnce(JIRA_CONFIG);
    mockCreateJiraIssue.mockResolvedValueOnce({ key: "PLATFORM-42", id: "10042" });

    const res = await POST(makePostRequest({ issueId: "i1", decision: "jira", metadata: { summary: "Crash" } }));
    const body = await res.json();
    expect(body.jiraKey).toBe("PLATFORM-42");
  });

  test("returns jiraError without creating a decision when Jira call throws", async () => {
    mockGetJiraConfig.mockResolvedValueOnce(JIRA_CONFIG);
    mockCreateJiraIssue.mockRejectedValueOnce(new Error("Auth failed"));

    const res = await POST(makePostRequest({ issueId: "i1", decision: "jira", metadata: { summary: "Crash" } }));
    expect(res.status).toBe(200);

    const body = await res.json() as Record<string, unknown>;
    expect(body.jiraError).toBe("Auth failed");
    // No decision should be recorded — issue stays in inbox so user can retry.
    expect(mockDecisionCreate).not.toHaveBeenCalled();
  });

  test("returns jiraError without creating a decision when Jira is not configured", async () => {
    mockGetJiraConfig.mockResolvedValueOnce(null);

    const res = await POST(makePostRequest({ issueId: "i1", decision: "jira" }));
    const body = await res.json() as Record<string, unknown>;

    expect(mockCreateJiraIssue).not.toHaveBeenCalled();
    expect(body.jiraError).toBeTruthy();
    expect(mockDecisionCreate).not.toHaveBeenCalled();
  });

  test("does not call getJiraConfig when decision is not 'jira'", async () => {
    await POST(makePostRequest({ issueId: "i1", decision: "close" }));
    expect(mockGetJiraConfig).not.toHaveBeenCalled();
    expect(mockCreateJiraIssue).not.toHaveBeenCalled();
  });

  test("falls back to issue title when metadata has no summary", async () => {
    mockGetJiraConfig.mockResolvedValueOnce(JIRA_CONFIG);
    mockCreateJiraIssue.mockResolvedValueOnce({ key: "PLATFORM-99", id: "10099" });

    await POST(makePostRequest({ issueId: "i1", decision: "jira" }));

    const [opts] = mockCreateJiraIssue.mock.calls[0] as [{ summary: string }, unknown];
    expect(opts.summary).toBe("Test issue");
  });
});
