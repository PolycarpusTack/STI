import { describe, test, expect, mock, beforeEach } from "bun:test";

const mockQueryRaw = mock(() => Promise.resolve([]));

mock.module("@/lib/db", () => ({
  db: { $queryRaw: mockQueryRaw },
}));

const { GET } = await import("./route");

function makeRequest(params: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/issues/storms");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Request(url.toString()) as import("next/server").NextRequest;
}

describe("GET /api/issues/storms", () => {
  beforeEach(() => {
    mockQueryRaw.mockReset();
    mockQueryRaw.mockResolvedValue([]);
  });

  test("returns empty storms array when no clusters found", async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.storms).toEqual([]);
  });

  test("returns storms with correct shape", async () => {
    mockQueryRaw.mockResolvedValue([
      {
        fingerprint: "fp-abc",
        count: BigInt(5),
        sampleTitle: "TypeError: x is null",
        sampleIssueId: "issue-1",
        projectList: "proj-a,proj-b",
      },
    ]);
    const res = await GET(makeRequest());
    const body = await res.json();
    expect(body.storms).toHaveLength(1);
    expect(body.storms[0]).toEqual({
      fingerprint: "fp-abc",
      count: 5,
      sampleTitle: "TypeError: x is null",
      sampleIssueId: "issue-1",
      projects: ["proj-a", "proj-b"],
    });
    expect(body.truncated).toBe(false);
  });

  test("uses threshold query param", async () => {
    await GET(makeRequest({ threshold: "5" }));
    const args = mockQueryRaw.mock.calls[0];
    // Second variadic arg is the interpolated threshold value
    expect(args[1]).toBe(5);
  });

  test("clamps threshold to minimum 2", async () => {
    await GET(makeRequest({ threshold: "1" }));
    const args = mockQueryRaw.mock.calls[0];
    expect(args[1]).toBe(2);
  });

  test("falls back to default threshold 3 for non-numeric input", async () => {
    await GET(makeRequest({ threshold: "abc" }));
    const args = mockQueryRaw.mock.calls[0];
    expect(args[1]).toBe(3);
  });

  test("returns 500 when DB throws", async () => {
    mockQueryRaw.mockRejectedValue(new Error("DB error"));
    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
  });

  test("sets truncated true when 10 rows are returned", async () => {
    const tenRows = Array.from({ length: 10 }, (_, i) => ({
      fingerprint: `fp-${i}`,
      count: BigInt(3),
      sampleTitle: "Error",
      sampleIssueId: `issue-${i}`,
      projectList: "proj-a",
    }));
    mockQueryRaw.mockResolvedValueOnce(tenRows);
    const res = await GET(makeRequest());
    const body = await res.json();
    expect(body.truncated).toBe(true);
  });
});
