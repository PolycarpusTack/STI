import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSetting, setSetting, SETTINGS_KEYS } from "@/lib/settings";

const TOKEN_MASK = "••••••••";

export async function GET() {
  const [token, org, interval, llmBaseUrl, llmApiKey, llmModel, jiraBaseUrl, jiraEmail, jiraApiKey, jiraProjectKey] = await Promise.all([
    getSetting(SETTINGS_KEYS.sentryToken),
    getSetting(SETTINGS_KEYS.sentryOrg),
    getSetting(SETTINGS_KEYS.pollIntervalMinutes),
    getSetting(SETTINGS_KEYS.llmBaseUrl),
    getSetting(SETTINGS_KEYS.llmApiKey),
    getSetting(SETTINGS_KEYS.llmModel),
    getSetting(SETTINGS_KEYS.jiraBaseUrl),
    getSetting(SETTINGS_KEYS.jiraEmail),
    getSetting(SETTINGS_KEYS.jiraApiKey),
    getSetting(SETTINGS_KEYS.jiraProjectKey),
  ]);

  return NextResponse.json({
    sentryToken: token ? TOKEN_MASK : null,
    sentryTokenSet: !!token,
    sentryOrg: org ?? process.env.SENTRY_ORG ?? "",
    pollIntervalMinutes: parseInt(interval ?? process.env.POLL_INTERVAL_MINUTES ?? "10", 10),
    llmBaseUrl: llmBaseUrl ?? process.env.LLM_BASE_URL ?? "",
    llmApiKey: llmApiKey ? TOKEN_MASK : null,
    llmApiKeySet: !!llmApiKey,
    llmModel: llmModel ?? process.env.LLM_MODEL ?? "deepseek-chat",
    jiraBaseUrl: jiraBaseUrl ?? process.env.JIRA_BASE_URL ?? "",
    jiraEmail: jiraEmail ?? process.env.JIRA_EMAIL ?? "",
    jiraApiKey: jiraApiKey ? TOKEN_MASK : null,
    jiraApiKeySet: !!jiraApiKey,
    jiraProjectKey: jiraProjectKey ?? process.env.JIRA_PROJECT_KEY ?? "",
  });
}

export async function PUT(req: NextRequest) {
  const body = await req.json();

  const updates: Array<Promise<void>> = [];

  if (typeof body.sentryToken === "string" && body.sentryToken !== TOKEN_MASK) {
    updates.push(setSetting(SETTINGS_KEYS.sentryToken, body.sentryToken));
  }
  if (typeof body.sentryOrg === "string") {
    updates.push(setSetting(SETTINGS_KEYS.sentryOrg, body.sentryOrg.trim()));
  }
  if (typeof body.pollIntervalMinutes === "number" && body.pollIntervalMinutes > 0) {
    updates.push(setSetting(SETTINGS_KEYS.pollIntervalMinutes, String(body.pollIntervalMinutes)));
  }
  if (typeof body.llmBaseUrl === "string") {
    updates.push(setSetting(SETTINGS_KEYS.llmBaseUrl, body.llmBaseUrl.trim()));
  }
  if (typeof body.llmApiKey === "string" && body.llmApiKey !== TOKEN_MASK) {
    updates.push(setSetting(SETTINGS_KEYS.llmApiKey, body.llmApiKey));
  }
  if (typeof body.llmModel === "string") {
    updates.push(setSetting(SETTINGS_KEYS.llmModel, body.llmModel.trim()));
  }
  if (typeof body.jiraBaseUrl === "string") {
    updates.push(setSetting(SETTINGS_KEYS.jiraBaseUrl, body.jiraBaseUrl.trim()));
  }
  if (typeof body.jiraEmail === "string") {
    updates.push(setSetting(SETTINGS_KEYS.jiraEmail, body.jiraEmail.trim()));
  }
  if (typeof body.jiraApiKey === "string" && body.jiraApiKey !== TOKEN_MASK) {
    updates.push(setSetting(SETTINGS_KEYS.jiraApiKey, body.jiraApiKey));
  }
  if (typeof body.jiraProjectKey === "string") {
    updates.push(setSetting(SETTINGS_KEYS.jiraProjectKey, body.jiraProjectKey.trim()));
  }

  await Promise.all(updates);

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const secret = process.env.ADMIN_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { error: "DELETE disabled — set ADMIN_SECRET to enable" },
      { status: 403 }
    );
  }
  const provided = req.headers.get("x-admin-secret");
  if (provided !== secret) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await db.setting.deleteMany({
    where: { key: { in: Object.values(SETTINGS_KEYS) } },
  });
  return NextResponse.json({ ok: true });
}
