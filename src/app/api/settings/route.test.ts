import { describe, test, expect, mock, beforeEach } from "bun:test";

const mockGetSetting = mock(() => Promise.resolve(null));
const mockSetSetting = mock(() => Promise.resolve());
const mockDeleteMany = mock(() => Promise.resolve({ count: 0 }));

mock.module("@/lib/settings", () => ({
  getSetting: mockGetSetting,
  setSetting: mockSetSetting,
  SETTINGS_KEYS: {
    sentryToken: "sentry.token",
    sentryOrg: "sentry.org",
    sentryProject: "sentry.project",
    pollIntervalMinutes: "poll.intervalMinutes",
    llmBaseUrl: "llm.baseUrl",
    llmApiKey: "llm.apiKey",
    llmModel: "llm.model",
    jiraBaseUrl: "jira.baseUrl",
    jiraEmail: "jira.email",
    jiraApiKey: "jira.apiKey",
    jiraProjectKey: "jira.projectKey",
  },
}));

mock.module("@/lib/db", () => ({
  db: { setting: { deleteMany: mockDeleteMany } },
}));

const { GET, PUT } = await import("./route");

function makePutRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as import("next/server").NextRequest;
}

const makeGetRequest = () =>
  new Request("http://localhost/api/settings") as import("next/server").NextRequest;

describe("GET /api/settings — Jira fields", () => {
  beforeEach(() => mockGetSetting.mockReset());

  test("returns jiraBaseUrl, jiraApiKey masked, jiraProjectKey", async () => {
    mockGetSetting
      .mockResolvedValueOnce(null)   // sentryToken
      .mockResolvedValueOnce(null)   // sentryOrg
      .mockResolvedValueOnce(null)   // sentryProject
      .mockResolvedValueOnce(null)   // pollIntervalMinutes
      .mockResolvedValueOnce(null)   // llmBaseUrl
      .mockResolvedValueOnce(null)   // llmApiKey
      .mockResolvedValueOnce(null)   // llmModel
      .mockResolvedValueOnce("https://hive.atlassian.net")  // jiraBaseUrl
      .mockResolvedValueOnce("responder@hive.io")           // jiraEmail
      .mockResolvedValueOnce("jira-secret-token")           // jiraApiKey
      .mockResolvedValueOnce("PLATFORM");                   // jiraProjectKey

    const res = await GET(makeGetRequest());
    const body = await res.json();

    expect(body.jiraBaseUrl).toBe("https://hive.atlassian.net");
    expect(body.jiraApiKey).toBe("••••••••");
    expect(body.jiraApiKeySet).toBe(true);
    expect(body.jiraProjectKey).toBe("PLATFORM");
  });

  test("jiraApiKeySet is false when key is not set", async () => {
    mockGetSetting.mockResolvedValue(null);
    const res = await GET(makeGetRequest());
    const body = await res.json();
    expect(body.jiraApiKeySet).toBe(false);
    expect(body.jiraApiKey).toBeNull();
  });
});

describe("PUT /api/settings — Jira fields", () => {
  beforeEach(() => mockSetSetting.mockReset());

  test("saves jiraBaseUrl and jiraProjectKey", async () => {
    await PUT(makePutRequest({
      jiraBaseUrl: "https://hive.atlassian.net",
      jiraProjectKey: "PLATFORM",
    }));
    const calls = mockSetSetting.mock.calls.map(c => c[0]);
    expect(calls).toContain("jira.baseUrl");
    expect(calls).toContain("jira.projectKey");
  });

  test("does not overwrite jiraApiKey when placeholder is sent", async () => {
    await PUT(makePutRequest({ jiraApiKey: "••••••••" }));
    const calls = mockSetSetting.mock.calls.map(c => c[0]);
    expect(calls).not.toContain("jira.apiKey");
  });

  test("saves jiraApiKey when a real value is sent", async () => {
    await PUT(makePutRequest({ jiraApiKey: "new-secret-token" }));
    const calls = mockSetSetting.mock.calls.map(c => c[0]);
    expect(calls).toContain("jira.apiKey");
  });
});
