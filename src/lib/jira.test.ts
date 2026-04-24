import { describe, test, expect, mock, beforeEach } from "bun:test";
import { createJiraIssue, JiraError, type JiraConfig } from "./jira";

// No module mocks needed — createJiraIssue accepts config directly.

const CONFIG: JiraConfig = {
  baseUrl: "https://hive.atlassian.net",
  email: "responder@hive.io",
  apiToken: "api-token-abc",
  projectKey: "PLATFORM",
};

function mockFetch(status: number, body: unknown) {
  globalThis.fetch = mock(() =>
    Promise.resolve(new Response(JSON.stringify(body), { status }))
  );
}

function lastFetchInit() {
  return (globalThis.fetch as ReturnType<typeof mock>).mock.calls[0][1] as RequestInit;
}

function lastFetchUrl() {
  return (globalThis.fetch as ReturnType<typeof mock>).mock.calls[0][0] as string;
}

// ── Happy path ────────────────────────────────────────────────────────────────

describe("createJiraIssue — success", () => {
  test("returns key and id on 201", async () => {
    mockFetch(201, { id: "10042", key: "PLATFORM-42" });
    const result = await createJiraIssue({ summary: "Bug in auth" }, CONFIG);
    expect(result.key).toBe("PLATFORM-42");
    expect(result.id).toBe("10042");
  });

  test("calls the correct Jira REST endpoint", async () => {
    mockFetch(201, { id: "1", key: "PLATFORM-1" });
    await createJiraIssue({ summary: "Test" }, CONFIG);
    expect(lastFetchUrl()).toBe("https://hive.atlassian.net/rest/api/3/issue");
  });

  test("uses Basic auth with base64(email:token)", async () => {
    mockFetch(201, { id: "1", key: "PLATFORM-1" });
    await createJiraIssue({ summary: "Test" }, CONFIG);
    const expected = Buffer.from("responder@hive.io:api-token-abc").toString("base64");
    const headers = lastFetchInit().headers as Record<string, string>;
    expect(headers["Authorization"]).toBe(`Basic ${expected}`);
  });

  test("sends summary and project key in request body", async () => {
    mockFetch(201, { id: "1", key: "PLATFORM-1" });
    await createJiraIssue({ summary: "Widget crash" }, CONFIG);
    const body = JSON.parse(lastFetchInit().body as string);
    expect(body.fields.summary).toBe("Widget crash");
    expect(body.fields.project.key).toBe("PLATFORM");
  });

  test("includes description as Atlassian Document Format", async () => {
    mockFetch(201, { id: "1", key: "PLATFORM-1" });
    await createJiraIssue({ summary: "T", description: "Detailed steps" }, CONFIG);
    const body = JSON.parse(lastFetchInit().body as string);
    expect(body.fields.description.type).toBe("doc");
    expect(body.fields.description.content[0].content[0].text).toBe("Detailed steps");
  });

  test("includes priority when provided", async () => {
    mockFetch(201, { id: "1", key: "PLATFORM-1" });
    await createJiraIssue({ summary: "T", priority: "High" }, CONFIG);
    const body = JSON.parse(lastFetchInit().body as string);
    expect(body.fields.priority.name).toBe("High");
  });

  test("includes component when provided", async () => {
    mockFetch(201, { id: "1", key: "PLATFORM-1" });
    await createJiraIssue({ summary: "T", component: "auth" }, CONFIG);
    const body = JSON.parse(lastFetchInit().body as string);
    expect(body.fields.components[0].name).toBe("auth");
  });

  test("omits optional fields when not provided", async () => {
    mockFetch(201, { id: "1", key: "PLATFORM-1" });
    await createJiraIssue({ summary: "T" }, CONFIG);
    const body = JSON.parse(lastFetchInit().body as string);
    expect(body.fields.description).toBeUndefined();
    expect(body.fields.priority).toBeUndefined();
    expect(body.fields.components).toBeUndefined();
  });
});

// ── HTTP errors ───────────────────────────────────────────────────────────────

describe("createJiraIssue — HTTP errors", () => {
  test("throws JiraError with status 401 on auth failure", async () => {
    mockFetch(401, {});
    await expect(createJiraIssue({ summary: "T" }, CONFIG)).rejects.toMatchObject({ status: 401 });
  });

  test("401 error message mentions email and API token", async () => {
    mockFetch(401, {});
    try { await createJiraIssue({ summary: "T" }, CONFIG); } catch (e) {
      expect((e as JiraError).message.toLowerCase()).toContain("email");
    }
  });

  test("throws JiraError with status 403 on permission failure", async () => {
    mockFetch(403, {});
    await expect(createJiraIssue({ summary: "T" }, CONFIG)).rejects.toMatchObject({ status: 403 });
  });

  test("throws JiraError with status 404 when project not found", async () => {
    mockFetch(404, {});
    await expect(createJiraIssue({ summary: "T" }, CONFIG)).rejects.toMatchObject({ status: 404 });
  });

  test("throws JiraError with unknown status for unexpected codes", async () => {
    mockFetch(500, {});
    await expect(createJiraIssue({ summary: "T" }, CONFIG)).rejects.toMatchObject({ status: 500 });
  });
});

// ── Network error ─────────────────────────────────────────────────────────────

describe("createJiraIssue — network error", () => {
  test("throws JiraError with status 0 on network failure", async () => {
    globalThis.fetch = mock(() => Promise.reject(new Error("connection refused")));
    await expect(createJiraIssue({ summary: "T" }, CONFIG)).rejects.toMatchObject({ status: 0 });
  });
});

// ── JiraError ─────────────────────────────────────────────────────────────────

describe("JiraError", () => {
  test("is an instance of Error", () => {
    expect(new JiraError("test", 401)).toBeInstanceOf(Error);
  });

  test("has a status property", () => {
    expect(new JiraError("test", 403).status).toBe(403);
  });

  test("name is JiraError", () => {
    expect(new JiraError("test", 500).name).toBe("JiraError");
  });
});
