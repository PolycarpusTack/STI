import { db } from "@/lib/db";

export const SETTINGS_KEYS = {
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
} as const;

export async function getSetting(key: string): Promise<string | null> {
  const row = await db.setting.findUnique({ where: { key } });
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await db.setting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}

/** Reads a setting from DB, falls back to env var. */
export async function getEffectiveSetting(key: string, envVar: string): Promise<string | null> {
  const dbVal = await getSetting(key);
  if (dbVal && dbVal.trim()) return dbVal.trim();
  return process.env[envVar] ?? null;
}
