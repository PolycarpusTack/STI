import { describe, test, expect, mock, beforeEach } from "bun:test";

// Mock the db module BEFORE the first import of settings.ts.
// Dynamic import below ensures the mock is registered first.
const mockFindUnique = mock(() => Promise.resolve(null));
const mockUpsert = mock(() => Promise.resolve({ key: "", value: "", updatedAt: new Date() }));
const mockFindMany = mock(() => Promise.resolve([]));

mock.module("@/lib/db", () => ({
  db: {
    setting: {
      findUnique: mockFindUnique,
      upsert: mockUpsert,
      findMany: mockFindMany,
    },
  },
}));

const { getSetting, setSetting, getEffectiveSetting, SETTINGS_KEYS } =
  await import("@/lib/settings");

// ── getSetting ────────────────────────────────────────────────────────────────

describe("getSetting", () => {
  beforeEach(() => {
    mockFindUnique.mockReset();
    mockUpsert.mockReset();
  });

  test("returns null when no row exists", async () => {
    mockFindUnique.mockResolvedValueOnce(null);
    expect(await getSetting("sentry.token")).toBeNull();
  });

  test("returns the stored value", async () => {
    mockFindUnique.mockResolvedValueOnce({ key: "sentry.token", value: "sntrys_abc" });
    expect(await getSetting("sentry.token")).toBe("sntrys_abc");
  });

  test("queries by the exact key", async () => {
    mockFindUnique.mockResolvedValueOnce(null);
    await getSetting("sentry.org");
    expect(mockFindUnique).toHaveBeenCalledWith({ where: { key: "sentry.org" } });
  });
});

// ── setSetting ────────────────────────────────────────────────────────────────

describe("setSetting", () => {
  beforeEach(() => mockUpsert.mockReset());

  test("calls upsert with key and value", async () => {
    mockUpsert.mockResolvedValueOnce({ key: "sentry.org", value: "my-org", updatedAt: new Date() });
    await setSetting("sentry.org", "my-org");
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: "sentry.org" },
        update: { value: "my-org" },
        create: { key: "sentry.org", value: "my-org" },
      })
    );
  });
});

// ── getEffectiveSetting ───────────────────────────────────────────────────────

describe("getEffectiveSetting", () => {
  const ENV_VAR = "TEST_SENTRY_ORG";

  beforeEach(() => {
    mockFindUnique.mockReset();
    delete process.env[ENV_VAR];
  });

  test("returns DB value when set", async () => {
    mockFindUnique.mockResolvedValueOnce({ key: "sentry.org", value: "db-org" });
    const result = await getEffectiveSetting("sentry.org", ENV_VAR);
    expect(result).toBe("db-org");
  });

  test("falls back to env var when DB returns null", async () => {
    mockFindUnique.mockResolvedValueOnce(null);
    process.env[ENV_VAR] = "env-org";
    const result = await getEffectiveSetting("sentry.org", ENV_VAR);
    expect(result).toBe("env-org");
  });

  test("returns null when neither DB nor env is set", async () => {
    mockFindUnique.mockResolvedValueOnce(null);
    const result = await getEffectiveSetting("sentry.org", ENV_VAR);
    expect(result).toBeNull();
  });

  test("ignores DB value that is whitespace-only", async () => {
    mockFindUnique.mockResolvedValueOnce({ key: "sentry.org", value: "   " });
    process.env[ENV_VAR] = "env-org";
    const result = await getEffectiveSetting("sentry.org", ENV_VAR);
    expect(result).toBe("env-org");
  });
});

// ── SETTINGS_KEYS ─────────────────────────────────────────────────────────────

describe("SETTINGS_KEYS", () => {
  test("contains all expected keys", () => {
    expect(SETTINGS_KEYS.sentryToken).toBe("sentry.token");
    expect(SETTINGS_KEYS.sentryOrg).toBe("sentry.org");
    expect(SETTINGS_KEYS.sentryProject).toBe("sentry.project");
    expect(SETTINGS_KEYS.pollIntervalMinutes).toBe("poll.intervalMinutes");
    expect(SETTINGS_KEYS.llmBaseUrl).toBe("llm.baseUrl");
    expect(SETTINGS_KEYS.llmApiKey).toBe("llm.apiKey");
    expect(SETTINGS_KEYS.llmModel).toBe("llm.model");
    expect(SETTINGS_KEYS.jiraBaseUrl).toBe("jira.baseUrl");
    expect(SETTINGS_KEYS.jiraEmail).toBe("jira.email");
    expect(SETTINGS_KEYS.jiraApiKey).toBe("jira.apiKey");
    expect(SETTINGS_KEYS.jiraProjectKey).toBe("jira.projectKey");
  });
});
