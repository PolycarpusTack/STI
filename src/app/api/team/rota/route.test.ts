import { describe, test, expect, mock, beforeEach } from "bun:test";

const mockRotaFindMany = mock(() => Promise.resolve([]));
const mockRotaUpsert = mock(() => Promise.resolve({ id: "rota1", isoYear: 2025, isoWeek: 18, notes: "", createdAt: new Date(), updatedAt: new Date() }));
const mockEntryDeleteMany = mock(() => Promise.resolve({ count: 0 }));
const mockEntryCreateMany = mock(() => Promise.resolve({ count: 2 }));
const mockRotaFindUnique = mock(() => Promise.resolve({
  id: "rota1", isoYear: 2025, isoWeek: 18, notes: "", createdAt: new Date(), updatedAt: new Date(),
  entries: [],
}));

mock.module("@/lib/db", () => ({
  db: {
    weeklyRota: { findMany: mockRotaFindMany, upsert: mockRotaUpsert, findUnique: mockRotaFindUnique },
    rotaEntry: { deleteMany: mockEntryDeleteMany, createMany: mockEntryCreateMany },
  },
}));

const { GET, POST } = await import("./route");

function makePost(body: Record<string, unknown>) {
  return new Request("http://localhost/api/team/rota", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as import("next/server").NextRequest;
}

describe("GET /api/team/rota", () => {
  test("returns all rota weeks with entries", async () => {
    mockRotaFindMany.mockResolvedValueOnce([
      { id: "rota1", isoYear: 2025, isoWeek: 18, notes: "", createdAt: new Date(), updatedAt: new Date(), entries: [] },
    ]);
    const res = await GET(new Request("http://localhost/api/team/rota") as import("next/server").NextRequest);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].isoWeek).toBe(18);
  });
});

describe("POST /api/team/rota", () => {
  beforeEach(() => {
    mockRotaUpsert.mockReset();
    mockEntryDeleteMany.mockReset();
    mockEntryCreateMany.mockReset();
    mockRotaFindUnique.mockReset();
  });

  test("returns 400 when isoYear or isoWeek is missing", async () => {
    const res = await POST(makePost({ isoYear: 2025 }));
    expect(res.status).toBe(400);
  });

  test("upserts the rota week and replaces all entries", async () => {
    mockRotaUpsert.mockResolvedValueOnce({ id: "rota1", isoYear: 2025, isoWeek: 19, notes: "", createdAt: new Date(), updatedAt: new Date() });
    mockEntryDeleteMany.mockResolvedValueOnce({ count: 1 });
    mockEntryCreateMany.mockResolvedValueOnce({ count: 2 });
    mockRotaFindUnique.mockResolvedValueOnce({
      id: "rota1", isoYear: 2025, isoWeek: 19, notes: "", createdAt: new Date(), updatedAt: new Date(),
      entries: [
        { id: "e1", rotaId: "rota1", roleId: "r1", memberId: "m1", role: { name: "Support Developer" }, member: { name: "Alice" } },
        { id: "e2", rotaId: "rota1", roleId: "r2", memberId: "m2", role: { name: "Support Engineer" }, member: { name: "Bob" } },
      ],
    });

    const res = await POST(makePost({
      isoYear: 2025, isoWeek: 19,
      assignments: [{ roleId: "r1", memberId: "m1" }, { roleId: "r2", memberId: "m2" }],
    }));

    expect(mockEntryDeleteMany).toHaveBeenCalledTimes(1);
    expect(mockEntryCreateMany).toHaveBeenCalledTimes(1);
    const body = await res.json();
    expect(body.entries).toHaveLength(2);
  });

  test("clears all entries when assignments array is empty", async () => {
    mockRotaUpsert.mockResolvedValueOnce({ id: "rota1", isoYear: 2025, isoWeek: 19, notes: "", createdAt: new Date(), updatedAt: new Date() });
    mockRotaFindUnique.mockResolvedValueOnce({ id: "rota1", isoYear: 2025, isoWeek: 19, notes: "", createdAt: new Date(), updatedAt: new Date(), entries: [] });

    await POST(makePost({ isoYear: 2025, isoWeek: 19, assignments: [] }));

    expect(mockEntryDeleteMany).toHaveBeenCalledTimes(1);
    expect(mockEntryCreateMany).not.toHaveBeenCalled();
  });
});
