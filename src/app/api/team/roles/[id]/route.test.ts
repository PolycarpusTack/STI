import { describe, test, expect, mock, beforeEach } from "bun:test";

const mockRotaEntryFindFirst = mock(() => Promise.resolve(null));
const mockRoleDelete = mock(() => Promise.resolve({ id: "r1" }));

mock.module("@/lib/db", () => ({
  db: {
    rotaEntry: { findFirst: mockRotaEntryFindFirst },
    teamRole: { delete: mockRoleDelete },
  },
}));

const { DELETE } = await import("./route");

function makeDelete(id: string) {
  return [
    new Request(`http://localhost/api/team/roles/${id}`, { method: "DELETE" }) as import("next/server").NextRequest,
    { params: { id } },
  ] as const;
}

describe("DELETE /api/team/roles/[id]", () => {
  beforeEach(() => {
    mockRotaEntryFindFirst.mockReset();
    mockRoleDelete.mockReset();
  });

  test("returns 409 when role has a current or future rota entry", async () => {
    mockRotaEntryFindFirst.mockResolvedValueOnce({ id: "e1" });
    const res = await DELETE(...makeDelete("r1"));
    expect(res.status).toBe(409);
    expect(mockRoleDelete).not.toHaveBeenCalled();
  });

  test("deletes role and returns ok when no active entries", async () => {
    mockRotaEntryFindFirst.mockResolvedValueOnce(null);
    mockRoleDelete.mockResolvedValueOnce({ id: "r1" });
    const res = await DELETE(...makeDelete("r1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });
});
