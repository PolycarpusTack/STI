import { describe, test, expect, mock, beforeEach } from "bun:test";

const mockMemberFindMany = mock(() => Promise.resolve([]));
const mockEntryFindMany = mock(() => Promise.resolve([]));
const mockMemberCreate = mock(() =>
  Promise.resolve({ id: "m1", name: "Alice", defaultRoleId: "r1", defaultRole: { id: "r1", name: "Support Developer", sortOrder: 1, createdAt: new Date() }, createdAt: new Date() })
);

mock.module("@/lib/db", () => ({
  db: {
    teamMember: { findMany: mockMemberFindMany, create: mockMemberCreate },
    rotaEntry: { findMany: mockEntryFindMany },
  },
}));

const { GET, POST } = await import("./route");

function makePost(body: Record<string, unknown>) {
  return new Request("http://localhost/api/team/members", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as import("next/server").NextRequest;
}

describe("GET /api/team/members", () => {
  beforeEach(() => {
    mockMemberFindMany.mockReset();
    mockEntryFindMany.mockReset();
  });

  test("returns members with weeksOnDuty computed from distinct rotaIds", async () => {
    mockMemberFindMany.mockResolvedValueOnce([
      { id: "m1", name: "Alice", defaultRoleId: "r1", defaultRole: null, createdAt: new Date() },
    ]);
    // m1 appeared in 3 RotaEntry rows but only 2 distinct rotas
    mockEntryFindMany.mockResolvedValueOnce([
      { memberId: "m1", rotaId: "rota1" },
      { memberId: "m1", rotaId: "rota2" },
      { memberId: "m1", rotaId: "rota2" }, // duplicate rotaId, should not be double-counted
    ]);
    const res = await GET();
    const body = await res.json();
    expect(body[0].weeksOnDuty).toBe(2);
  });

  test("returns weeksOnDuty: 0 for members with no entries", async () => {
    mockMemberFindMany.mockResolvedValueOnce([
      { id: "m2", name: "Bob", defaultRoleId: null, defaultRole: null, createdAt: new Date() },
    ]);
    mockEntryFindMany.mockResolvedValueOnce([]);
    const res = await GET();
    const body = await res.json();
    expect(body[0].weeksOnDuty).toBe(0);
  });
});

describe("POST /api/team/members", () => {
  beforeEach(() => mockMemberCreate.mockReset());

  test("returns 400 when name is missing", async () => {
    const res = await POST(makePost({}));
    expect(res.status).toBe(400);
  });

  test("creates member and returns 201 with weeksOnDuty: 0", async () => {
    mockMemberCreate.mockResolvedValueOnce({
      id: "m1", name: "Alice", defaultRoleId: "r1",
      defaultRole: { id: "r1", name: "Support Developer", sortOrder: 1, createdAt: new Date() },
      createdAt: new Date(),
    });
    const res = await POST(makePost({ name: "Alice", defaultRoleId: "r1" }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.name).toBe("Alice");
    expect(body.weeksOnDuty).toBe(0);
  });
});
