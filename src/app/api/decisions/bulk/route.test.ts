import { describe, test, expect, mock, beforeEach } from "bun:test";

const mockIssueFindUnique = mock(() =>
  Promise.resolve({ id: "i1", sentryIssueId: "s1", title: "Test" })
);
const mockBriefFindUnique = mock(() =>
  Promise.resolve({ id: "b1", lean: "close" })
);
const mockDecisionCreate = mock(() =>
  Promise.resolve({ id: "d1", decision: "close", issueId: "i1" })
);

mock.module("@/lib/db", () => ({
  db: {
    issue: { findUnique: mockIssueFindUnique },
    brief: { findUnique: mockBriefFindUnique },
    decision: { create: mockDecisionCreate },
  },
}));

const { POST } = await import("./route");

function makeRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/decisions/bulk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as import("next/server").NextRequest;
}

describe("POST /api/decisions/bulk", () => {
  beforeEach(() => {
    mockIssueFindUnique.mockReset();
    mockBriefFindUnique.mockReset();
    mockDecisionCreate.mockReset();
    mockIssueFindUnique.mockResolvedValue({ id: "i1", sentryIssueId: "s1", title: "Test" });
    mockBriefFindUnique.mockResolvedValue({ id: "b1", lean: "close" });
    mockDecisionCreate.mockResolvedValue({ id: "d1", decision: "close", issueId: "i1" });
  });

  test("returns 400 when issueIds is missing", async () => {
    const res = await POST(makeRequest({ decision: "close" }));
    expect(res.status).toBe(400);
  });

  test("returns 400 when issueIds is empty", async () => {
    const res = await POST(makeRequest({ issueIds: [], decision: "close" }));
    expect(res.status).toBe(400);
  });

  test("returns 400 when decision is invalid", async () => {
    const res = await POST(makeRequest({ issueIds: ["i1"], decision: "invalid" }));
    expect(res.status).toBe(400);
  });

  test("creates a decision for each valid issueId", async () => {
    mockIssueFindUnique
      .mockResolvedValueOnce({ id: "i1", sentryIssueId: "s1", title: "T1" })
      .mockResolvedValueOnce({ id: "i2", sentryIssueId: "s2", title: "T2" });
    mockBriefFindUnique
      .mockResolvedValueOnce({ id: "b1", lean: "close" })
      .mockResolvedValueOnce(null);
    mockDecisionCreate
      .mockResolvedValueOnce({ id: "d1", decision: "close", issueId: "i1" })
      .mockResolvedValueOnce({ id: "d2", decision: "close", issueId: "i2" });

    const res = await POST(makeRequest({ issueIds: ["i1", "i2"], decision: "close" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.succeeded).toBe(2);
    expect(body.failed).toBe(0);
    expect(mockDecisionCreate).toHaveBeenCalledTimes(2);
  });

  test("skips issues that do not exist and counts them as failed", async () => {
    mockIssueFindUnique.mockResolvedValue(null);
    const res = await POST(makeRequest({ issueIds: ["missing"], decision: "watchlist" }));
    const body = await res.json();
    expect(body.succeeded).toBe(0);
    expect(body.failed).toBe(1);
  });

  test("returns 500 when DB throws", async () => {
    mockIssueFindUnique.mockRejectedValue(new Error("DB error"));
    const res = await POST(makeRequest({ issueIds: ["i1"], decision: "close" }));
    expect(res.status).toBe(500);
  });

  test("returns 400 when decision is jira", async () => {
    const res = await POST(makeRequest({ issueIds: ["i1"], decision: "jira" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("jira");
  });

  test("returns 400 when more than 200 issueIds", async () => {
    const ids = Array.from({ length: 201 }, (_, i) => `id-${i}`);
    const res = await POST(makeRequest({ issueIds: ids, decision: "close" }));
    expect(res.status).toBe(400);
  });

  test("returns 400 when issueIds contains non-string items", async () => {
    const res = await POST(makeRequest({ issueIds: ["valid", 42], decision: "close" }));
    expect(res.status).toBe(400);
  });
});
