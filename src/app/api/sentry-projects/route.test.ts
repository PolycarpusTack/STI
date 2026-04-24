import { describe, test, expect, mock, beforeEach } from "bun:test";

const mockFindMany = mock(() => Promise.resolve([]));
const mockCreate = mock(() =>
  Promise.resolve({ id: "p1", slug: "my-project", label: "" })
);
const mockFindUnique = mock(() => Promise.resolve(null));
const mockDelete = mock(() => Promise.resolve({ id: "p1" }));

mock.module("@/lib/db", () => ({
  db: {
    sentryProject: {
      findMany: mockFindMany,
      create: mockCreate,
      findUnique: mockFindUnique,
      delete: mockDelete,
    },
  },
}));

const { GET, POST } = await import("./route");
const { DELETE } = await import("./[id]/route");

function makeRequest(method: string, body?: unknown) {
  return new Request("http://localhost/api/sentry-projects", {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  }) as import("next/server").NextRequest;
}

function makeDeleteRequest(id: string) {
  return {
    request: new Request(`http://localhost/api/sentry-projects/${id}`, { method: "DELETE" }) as import("next/server").NextRequest,
    params: Promise.resolve({ id }),
  };
}

describe("GET /api/sentry-projects", () => {
  beforeEach(() => mockFindMany.mockReset());

  test("returns empty array when no projects configured", async () => {
    mockFindMany.mockResolvedValue([]);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });

  test("returns list of projects ordered by createdAt", async () => {
    mockFindMany.mockResolvedValue([
      { id: "p1", slug: "proj-a", label: "" },
      { id: "p2", slug: "proj-b", label: "My B" },
    ]);
    const res = await GET();
    const body = await res.json();
    expect(body).toHaveLength(2);
    expect(body[0].slug).toBe("proj-a");
  });

  test("returns 500 when DB throws", async () => {
    mockFindMany.mockRejectedValue(new Error("DB error"));
    const res = await GET();
    expect(res.status).toBe(500);
  });
});

describe("POST /api/sentry-projects", () => {
  beforeEach(() => mockCreate.mockReset());

  test("returns 400 when slug is missing", async () => {
    const res = await POST(makeRequest("POST", {}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("slug");
  });

  test("returns 400 when slug is empty string", async () => {
    const res = await POST(makeRequest("POST", { slug: "   " }));
    expect(res.status).toBe(400);
  });

  test("returns 201 with created project on success", async () => {
    mockCreate.mockResolvedValue({ id: "p1", slug: "my-project", label: "" });
    const res = await POST(makeRequest("POST", { slug: "my-project" }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.slug).toBe("my-project");
  });

  test("returns 409 when slug already exists", async () => {
    mockCreate.mockRejectedValue(Object.assign(new Error("Unique"), { code: "P2002" }));
    const res = await POST(makeRequest("POST", { slug: "duplicate" }));
    expect(res.status).toBe(409);
  });

  test("returns 500 for non-P2002 DB errors", async () => {
    mockCreate.mockRejectedValue(new Error("DB locked"));
    const res = await POST(makeRequest("POST", { slug: "any-slug" }));
    expect(res.status).toBe(500);
  });
});

describe("DELETE /api/sentry-projects/[id]", () => {
  beforeEach(() => {
    mockFindUnique.mockReset();
    mockDelete.mockReset();
  });

  test("returns 404 when project not found", async () => {
    mockFindUnique.mockResolvedValue(null);
    const { request, params } = makeDeleteRequest("missing-id");
    const res = await DELETE(request, { params });
    expect(res.status).toBe(404);
  });

  test("deletes and returns ok:true on success", async () => {
    mockFindUnique.mockResolvedValue({ id: "p1", slug: "my-project" });
    mockDelete.mockResolvedValue({ id: "p1" });
    const { request, params } = makeDeleteRequest("p1");
    const res = await DELETE(request, { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  test("returns 500 when DB throws on delete", async () => {
    mockFindUnique.mockResolvedValue({ id: "p1", slug: "my-project" });
    mockDelete.mockRejectedValue(new Error("DB error"));
    const { request, params } = makeDeleteRequest("p1");
    const res = await DELETE(request, { params });
    expect(res.status).toBe(500);
  });
});
