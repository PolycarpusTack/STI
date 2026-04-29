import { describe, test, expect, mock, beforeEach } from "bun:test";

const mockRotaEntryFindFirst = mock(() => Promise.resolve(null));
const mockMemberDelete = mock(() => Promise.resolve({ id: "m1" }));

mock.module("@/lib/db", () => ({
  db: {
    rotaEntry: { findFirst: mockRotaEntryFindFirst },
    teamMember: { delete: mockMemberDelete },
  },
}));

const { DELETE } = await import("./route");

function makeDelete(id: string) {
  return [
    new Request(`http://localhost/api/team/members/${id}`, { method: "DELETE" }) as import("next/server").NextRequest,
    { params: { id } },
  ] as const;
}

describe("DELETE /api/team/members/[id]", () => {
  beforeEach(() => {
    mockRotaEntryFindFirst.mockReset();
    mockMemberDelete.mockReset();
  });

  test("returns 409 when member has a current or future rota entry", async () => {
    mockRotaEntryFindFirst.mockResolvedValueOnce({ id: "e1" });
    const res = await DELETE(...makeDelete("m1"));
    expect(res.status).toBe(409);
    expect(mockMemberDelete).not.toHaveBeenCalled();
  });

  test("deletes member and returns ok when no active entries", async () => {
    mockRotaEntryFindFirst.mockResolvedValueOnce(null);
    mockMemberDelete.mockResolvedValueOnce({ id: "m1" });
    const res = await DELETE(...makeDelete("m1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });
});
