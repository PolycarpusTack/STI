import { describe, test, expect, mock, beforeEach } from "bun:test";

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

const { POST } = await import("./src/app/api/decisions/route");

function makePostRequest(body) {
  return new Request("http://localhost/api/decisions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

mockDecisionCreate.mockResolvedValue({
  id: "d1", issueId: "i1", decision: "suppress", aiLean: null,
  responderId: "r1", jiraKey: null, jiraSummary: null,
  jiraDescription: null, jiraPriority: null, jiraComponent: null,
  jiraError: null, suppressReason: "Bot traffic", suppressScope: "global",
  suppressed: false, briefId: null, createdAt: new Date(),
});

const res = await POST(makePostRequest({
  issueId: "i1",
  decision: "suppress",
  metadata: { suppressReason: "Bot traffic", suppressScope: "global" },
}));

console.log("Response status:", res.status);
console.log("Response body:", await res.json());
console.log("mockDecisionCreate called:", mockDecisionCreate.mock.calls.length);
if (mockDecisionCreate.mock.calls.length > 0) {
  console.log("First call arg:", mockDecisionCreate.mock.calls[0][0]);
}
