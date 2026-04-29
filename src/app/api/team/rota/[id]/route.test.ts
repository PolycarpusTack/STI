import { describe, test, expect, mock } from "bun:test";

const mockRotaDelete = mock(() => Promise.resolve({ id: "rota1" }));

mock.module("@/lib/db", () => ({
  db: { weeklyRota: { delete: mockRotaDelete } },
}));

const { DELETE } = await import("./route");

describe("DELETE /api/team/rota/[id]", () => {
  test("deletes the rota week and returns ok", async () => {
    const res = await DELETE(
      new Request("http://localhost/api/team/rota/rota1", { method: "DELETE" }) as import("next/server").NextRequest,
      { params: { id: "rota1" } }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });
});
