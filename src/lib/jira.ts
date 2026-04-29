import { getEffectiveSetting, SETTINGS_KEYS } from "@/lib/settings";

export interface JiraConfig {
  baseUrl: string;
  email: string;
  apiToken: string;
  projectKey: string;
}

export interface CreateJiraIssueOptions {
  summary: string;
  description?: string;
  priority?: string;
  component?: string;
}

export interface JiraIssueResult {
  key: string;
  id: string;
}

export class JiraError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "JiraError";
  }
}

const STATUS_MESSAGES: Record<number, string> = {
  401: "Jira authentication failed. Check your email and API token.",
  403: "Jira API token lacks permission to create issues in this project.",
  404: "Jira project not found. Check the project key.",
};

/** Reads Jira credentials from DB settings / env vars. Returns null if not configured. */
export async function getJiraConfig(): Promise<JiraConfig | null> {
  const [baseUrl, email, apiToken, projectKey] = await Promise.all([
    getEffectiveSetting(SETTINGS_KEYS.jiraBaseUrl, "JIRA_BASE_URL"),
    getEffectiveSetting(SETTINGS_KEYS.jiraEmail, "JIRA_EMAIL"),
    getEffectiveSetting(SETTINGS_KEYS.jiraApiKey, "JIRA_API_KEY"),
    getEffectiveSetting(SETTINGS_KEYS.jiraProjectKey, "JIRA_PROJECT_KEY"),
  ]);
  if (!baseUrl || !email || !apiToken || !projectKey) return null;
  return { baseUrl, email, apiToken, projectKey };
}

/**
 * Creates a Jira issue. Accepts explicit config so callers (and tests) can
 * pass credentials directly without going through the settings module.
 */
export async function createJiraIssue(
  options: CreateJiraIssueOptions,
  config: JiraConfig
): Promise<JiraIssueResult> {
  const credential = Buffer.from(`${config.email}:${config.apiToken}`).toString("base64");

  const fields: Record<string, unknown> = {
    project: { key: config.projectKey },
    summary: options.summary,
    issuetype: { name: "Bug" },
  };

  if (options.description) {
    fields.description = {
      type: "doc",
      version: 1,
      content: [{ type: "paragraph", content: [{ type: "text", text: options.description }] }],
    };
  }

  if (options.priority) {
    const p = options.priority;
    fields.priority = { name: p.charAt(0).toUpperCase() + p.slice(1) };
  }

  if (options.component) {
    fields.components = [{ name: options.component }];
  }

  let res: Response;
  try {
    res = await fetch(`${config.baseUrl}/rest/api/3/issue`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Basic ${credential}`,
        "Accept": "application/json",
      },
      body: JSON.stringify({ fields }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    throw new JiraError(`Network error: ${String(err)}`, 0);
  }

  if (!res.ok) {
    const message = STATUS_MESSAGES[res.status] ?? `Jira API error ${res.status}`;
    throw new JiraError(message, res.status);
  }

  const data = await res.json() as { key: string; id: string };
  return { key: data.key, id: data.id };
}
