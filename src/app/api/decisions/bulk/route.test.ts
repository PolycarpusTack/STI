import { describe, test, expect, mock, beforeEach } from "bun:test";

const mockIssueFindMany = mock(() => Promise.resolve([] as { id: string }[]));
const mockBriefFindMany = mock(() =>
  Promise.resolve([] as { id: string; issueId: string; lean: string }[])
);
const mockDecisionCreateMany = mock(() => Promise.resolve({ count: 0 }));

mock.module("@/lib/db", () => ({
  db: {
    issue: { findMany: mockIssueFindMany },
    brief: { findMany: mockBriefFindMany },
    decision: { createMany: mockDecisionCreateMany },
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
    mockIssueFindMany.mockReset();
    mockBriefFindMany.mockReset();
    mockDecisionCreateMany.mockReset();
    mockIssueFindMany.mockResolvedValue([{ id: "i1" }]);
    mockBriefFindMany.mockResolvedValue([{ id: "b1", issueId: "i1", lean: "close" }]);
    mockDecisionCreateMany.mockResolvedValue({ count: 1 });
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

  test("creates decisions for all found issueIds", async () => {
    mockIssueFindMany.mockResolvedValue([{ id: "i1" }, { id: "i2" }]);
    mockBriefFindMany.mockResolvedValue([
      { id: "b1", issueId: "i1", lean: "close" },
    ]);
    mockDecisionCreateMany.mockResolvedValue({ count: 2 });

    const res = await POST(makeRequest({ issueIds: ["i1", "i2"], decision: "close" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.succeeded).toBe(2);
    expect(body.failed).toBe(0);
    expect(mockDecisionCreateMany).toHaveBeenCalledTimes(1);
  });

  test("counts issues not found in DB as failed", async () => {
    mockIssueFindMany.mockResolvedValue([]);
    mockBriefFindMany.mockResolvedValue([]);
    const res = await POST(makeRequest({ issueIds: ["missing"], decision: "watchlist" }));
    const body = await res.json();
    expect(body.succeeded).toBe(0);
    expect(body.failed).toBe(1);
    expect(mockDecisionCreateMany).not.toHaveBeenCalled();
  });

  test("returns 500 when DB throws", async () => {
    mockIssueFindMany.mockRejectedValue(new Error("DB error"));
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
