import { describe, test, expect, mock, beforeEach } from "bun:test";

const mockGetSentryConfig = mock(() => Promise.resolve(null as { token: string; org: string; projects: string[] } | null));
mock.module("@/lib/pipeline", () => ({
  getSentryConfig: mockGetSentryConfig,
}));

const mockValidateSentryToken = mock(() =>
  Promise.resolve({ ok: true })
);
mock.module("@/lib/sentry", () => ({
  validateSentryToken: mockValidateSentryToken,
}));

const { POST } = await import("./route");

const makeRequest = () =>
  new Request("http://localhost/api/settings/test", {
    method: "POST",
  }) as import("next/server").NextRequest;

describe("POST /api/settings/test", () => {
  beforeEach(() => {
    mockGetSentryConfig.mockReset();
    mockValidateSentryToken.mockReset();
  });

  test("returns 400 when credentials are missing", async () => {
    mockGetSentryConfig.mockResolvedValue(null);
    const res = await POST(makeRequest());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
  });

  test("calls validateSentryToken with credentials from settings", async () => {
    mockGetSentryConfig.mockResolvedValue({ token: "tok", org: "my-org", projects: ["my-project"] });
    mockValidateSentryToken.mockResolvedValueOnce({ ok: true });

    await POST(makeRequest());

    expect(mockValidateSentryToken).toHaveBeenCalledWith(
      expect.objectContaining({ token: "tok", org: "my-org", project: "my-project" })
    );
  });

  test("returns ok:true when validation succeeds", async () => {
    mockGetSentryConfig.mockResolvedValue({ token: "tok", org: "org", projects: ["proj"] });
    mockValidateSentryToken.mockResolvedValueOnce({ ok: true });

    const res = await POST(makeRequest());
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  test("returns ok:false with error message when validation fails", async () => {
    mockGetSentryConfig.mockResolvedValue({ token: "tok", org: "org", projects: ["proj"] });
    mockValidateSentryToken.mockResolvedValueOnce({
      ok: false,
      error: "Token lacks required scope (project:read).",
    });

    const res = await POST(makeRequest());
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toContain("scope");
  });
});
