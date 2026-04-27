import { describe, test, expect, mock, beforeEach } from "bun:test";
import {
  extractStacktrace,
  extractEnvironment,
  extractRelease,
  fetchSentryIssues,
  fetchLatestEvent,
  fetchIssueStats,
  validateSentryToken,
  type SentryIssue,
  type SentryEvent,
} from "./sentry";

// ── Fixtures ─────────────────────────────────────────────────────────────────

const baseIssue: SentryIssue = {
  id: "1",
  title: "TypeError: cannot read property 'x' of undefined",
  culprit: "src/app.ts in handleRequest",
  firstSeen: "2026-01-01T00:00:00Z",
  lastSeen: "2026-01-02T00:00:00Z",
  level: "error",
  status: "unresolved",
  count: "42",
  project: { id: "p1", slug: "my-project", name: "My Project" },
  tags: [{ key: "environment", value: "production" }],
  fingerprints: ["abc123"],
};

const eventWithStacktrace: SentryEvent = {
  id: "e1",
  entries: [
    {
      type: "exception",
      data: {
        values: [
          {
            type: "TypeError",
            value: "cannot read property 'x' of undefined",
            stacktrace: {
              frames: [
                {
                  filename: "src/app.ts",
                  lineNo: 42,
                  function: "handleRequest",
                  context: [[42, "  return obj.x.y;"]],
                },
              ],
            },
          },
        ],
      },
    },
  ],
  tags: [{ key: "environment", value: "staging" }],
  release: { version: "1.2.3" },
  environment: "staging",
};

// ── extractStacktrace ─────────────────────────────────────────────────────────

describe("extractStacktrace", () => {
  test("returns null for null event", () => {
    expect(extractStacktrace(null)).toBeNull();
  });

  test("returns null when event has no exception entry", () => {
    const event: SentryEvent = { ...eventWithStacktrace, entries: [] };
    expect(extractStacktrace(event)).toBeNull();
  });

  test("returns null when exception entry has no values", () => {
    const event: SentryEvent = {
      ...eventWithStacktrace,
      entries: [{ type: "exception", data: { values: [] } }],
    };
    expect(extractStacktrace(event)).toBeNull();
  });

  test("extracts exception type and frame", () => {
    const result = extractStacktrace(eventWithStacktrace);
    expect(result).toContain("TypeError");
    expect(result).toContain("src/app.ts");
    expect(result).toContain("handleRequest");
  });

  test("includes the highlighted context line", () => {
    const result = extractStacktrace(eventWithStacktrace);
    expect(result).toContain("return obj.x.y");
  });

  test("limits frames to last 15", () => {
    const manyFrames = Array.from({ length: 20 }, (_, i) => ({
      filename: `file${i}.ts`,
      lineNo: i,
      function: `fn${i}`,
    }));
    const event: SentryEvent = {
      ...eventWithStacktrace,
      entries: [
        {
          type: "exception",
          data: { values: [{ type: "Error", value: "boom", stacktrace: { frames: manyFrames } }] },
        },
      ],
    };
    const result = extractStacktrace(event)!;
    // Only last 15 frames rendered; first frame (file0) should be absent
    expect(result).not.toContain("file0.ts");
    expect(result).toContain("file19.ts");
  });
});

// ── extractEnvironment ────────────────────────────────────────────────────────

describe("extractEnvironment", () => {
  test("prefers event.environment over issue tags", () => {
    expect(extractEnvironment(baseIssue, eventWithStacktrace)).toBe("staging");
  });

  test("falls back to issue tag when event is null", () => {
    expect(extractEnvironment(baseIssue, null)).toBe("production");
  });

  test("defaults to 'unknown' when neither source has a value", () => {
    const issue = { ...baseIssue, tags: [] };
    expect(extractEnvironment(issue, null)).toBe("unknown");
  });
});

// ── extractRelease ────────────────────────────────────────────────────────────

describe("extractRelease", () => {
  test("returns release version from event", () => {
    expect(extractRelease(eventWithStacktrace)).toBe("1.2.3");
  });

  test("returns null for null event", () => {
    expect(extractRelease(null)).toBeNull();
  });

  test("returns null when event has no release", () => {
    const event: SentryEvent = { ...eventWithStacktrace, release: null };
    expect(extractRelease(event)).toBeNull();
  });
});

// ── fetchSentryIssues — fetch mocking ─────────────────────────────────────────

describe("fetchSentryIssues", () => {
  beforeEach(() => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify([baseIssue]), { status: 200 }))
    );
  });

  test("calls the correct Sentry URL", async () => {
    await fetchSentryIssues(new Date("2026-01-01"), {
      org: "my-org",
      project: "my-project",
      token: "test-token",
    });
    const calledUrl = (globalThis.fetch as ReturnType<typeof mock>).mock.calls[0][0] as string;
    expect(calledUrl).toContain("/projects/my-org/my-project/issues/");
    expect(decodeURIComponent(calledUrl)).toContain("lastSeen:");
  });

  test("passes Bearer token in Authorization header", async () => {
    await fetchSentryIssues(new Date("2026-01-01"), {
      org: "o",
      project: "p",
      token: "secret-token",
    });
    const init = (globalThis.fetch as ReturnType<typeof mock>).mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer secret-token");
  });

  test("throws on non-200 response", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response("Unauthorized", { status: 401 }))
    );
    await expect(
      fetchSentryIssues(new Date(), { org: "o", project: "p", token: "bad" })
    ).rejects.toThrow("401");
  });
});

// ── validateSentryToken ───────────────────────────────────────────────────────

describe("validateSentryToken", () => {
  test("returns ok:true on 200 response", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify({ slug: "my-project" }), { status: 200 }))
    );
    const result = await validateSentryToken({ token: "tok", org: "my-org", project: "my-project" });
    expect(result.ok).toBe(true);
  });

  test("includes projectName from response on success", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify({ name: "My Project" }), { status: 200 }))
    );
    const result = await validateSentryToken({ token: "tok", org: "o", project: "p" });
    expect(result.projectName).toBe("My Project");
  });

  test("calls the correct project endpoint", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response("{}", { status: 200 }))
    );
    await validateSentryToken({ token: "tok", org: "my-org", project: "my-project" });
    const url = (globalThis.fetch as ReturnType<typeof mock>).mock.calls[0][0] as string;
    expect(url).toContain("/projects/my-org/my-project/");
  });

  test("returns ok:false with auth error on 401", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response("Unauthorized", { status: 401 }))
    );
    const result = await validateSentryToken({ token: "bad", org: "o", project: "p" });
    expect(result.ok).toBe(false);
    expect(result.error?.toLowerCase()).toContain("invalid");
  });

  test("returns ok:false with scope error on 403", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response("Forbidden", { status: 403 }))
    );
    const result = await validateSentryToken({ token: "tok", org: "o", project: "p" });
    expect(result.ok).toBe(false);
    expect(result.error?.toLowerCase()).toContain("scope");
  });

  test("returns ok:false with not-found error on 404", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response("Not Found", { status: 404 }))
    );
    const result = await validateSentryToken({ token: "tok", org: "o", project: "p" });
    expect(result.ok).toBe(false);
    expect(result.error?.toLowerCase()).toContain("not found");
  });

  test("returns ok:false on network failure", async () => {
    globalThis.fetch = mock(() => Promise.reject(new Error("ECONNREFUSED")));
    const result = await validateSentryToken({ token: "tok", org: "o", project: "p" });
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
  });

  test("returns ok:false when project passes but issues endpoint returns 403", async () => {
    let callCount = 0;
    globalThis.fetch = mock(() => {
      callCount++;
      const status = callCount === 1 ? 200 : 403;
      const body = callCount === 1 ? JSON.stringify({ name: "My Project" }) : "Forbidden";
      return Promise.resolve(new Response(body, { status }));
    });
    const result = await validateSentryToken({ token: "tok", org: "o", project: "p" });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("project:read scope insufficient");
  });

  test("returns ok:true when both project and issues endpoints succeed", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify({ name: "My Project" }), { status: 200 }))
    );
    const result = await validateSentryToken({ token: "tok", org: "o", project: "p" });
    expect(result.ok).toBe(true);
    expect(result.projectName).toBe("My Project");
  });
});

// ── fetchLatestEvent ──────────────────────────────────────────────────────────

describe("fetchLatestEvent", () => {
  test("returns parsed event on success", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify(eventWithStacktrace), { status: 200 }))
    );
    const result = await fetchLatestEvent("issue-1", "token");
    expect(result?.id).toBe("e1");
  });

  test("returns null on non-200 response", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response("not found", { status: 404 }))
    );
    const result = await fetchLatestEvent("issue-1", "token");
    expect(result).toBeNull();
  });
});

// ── fetchIssueStats ───────────────────────────────────────────────────────────

describe("fetchIssueStats", () => {
  test("returns array of daily counts from Sentry stats API", async () => {
    const statsData: [number, number][] = [
      [1745280000, 10],
      [1745366400, 5],
      [1745452800, 20],
      [1745539200, 15],
      [1745625600, 30],
      [1745712000, 25],
      [1745798400, 40],
    ];
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify(statsData), { status: 200 }))
    );

    const counts = await fetchIssueStats("issue-123", "token-abc");

    expect(counts).toEqual([10, 5, 20, 15, 30, 25, 40]);
    const calledUrl = (globalThis.fetch as ReturnType<typeof mock>).mock.calls[0][0] as string;
    expect(calledUrl).toContain("/issues/issue-123/stats/");
  });

  test("returns empty array when Sentry stats API fails", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response("Forbidden", { status: 403 }))
    );

    const counts = await fetchIssueStats("issue-xyz", "bad-token");

    expect(counts).toEqual([]);
  });
});
