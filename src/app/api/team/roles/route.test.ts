import { describe, test, expect, mock, beforeEach } from "bun:test";

const mockRoleFindMany = mock(() => Promise.resolve([]));
const mockRoleCreateMany = mock(() => Promise.resolve({ count: 2 }));
const mockRoleCreate = mock(() =>
  Promise.resolve({ id: "r1", name: "Support Developer", sortOrder: 1, createdAt: new Date() })
);

mock.module("@/lib/db", () => ({
  db: {
    teamRole: {
      findMany: mockRoleFindMany,
      createMany: mockRoleCreateMany,
      create: mockRoleCreate,
    },
  },
}));

const { GET, POST } = await import("./route");

function makePost(body: Record<string, unknown>) {
  return new Request("http://localhost/api/team/roles", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as import("next/server").NextRequest;
}

describe("GET /api/team/roles", () => {
  beforeEach(() => {
    mockRoleFindMany.mockReset();
    mockRoleCreateMany.mockReset();
  });

  test("returns existing roles without seeding when roles exist", async () => {
    mockRoleFindMany.mockResolvedValueOnce([
      { id: "r1", name: "Support Developer", sortOrder: 1, createdAt: new Date() },
    ]);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(mockRoleCreateMany).not.toHaveBeenCalled();
  });

  test("seeds default roles and returns them when table is empty", async () => {
    mockRoleFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: "r1", name: "Support Developer", sortOrder: 1, createdAt: new Date() },
        { id: "r2", name: "Support Engineer", sortOrder: 2, createdAt: new Date() },
      ]);
    const res = await GET();
    expect(mockRoleCreateMany).toHaveBeenCalledTimes(1);
    const body = await res.json();
    expect(body).toHaveLength(2);
  });
});

describe("POST /api/team/roles", () => {
  beforeEach(() => mockRoleCreate.mockReset());

  test("returns 400 when name is missing", async () => {
    const res = await POST(makePost({}));
    expect(res.status).toBe(400);
  });

  test("creates role and returns 201", async () => {
    mockRoleCreate.mockResolvedValueOnce({
      id: "r1", name: "DevOps On-Call", sortOrder: 3, createdAt: new Date(),
    });
    const res = await POST(makePost({ name: "DevOps On-Call", sortOrder: 3 }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.name).toBe("DevOps On-Call");
  });
});
