const SENTRY_BASE = "https://sentry.io/api/0";

export interface SentryIssue {
  id: string;
  title: string;
  culprit: string;
  firstSeen: string;
  lastSeen: string;
  level: string;
  status: string;
  count: string;
  project: { id: string; slug: string; name: string };
  tags: Array<{ key: string; value: string }>;
  fingerprints: string[];
}

export interface SentryEvent {
  id: string;
  entries: Array<{ type: string; data: Record<string, unknown> }>;
  tags: Array<{ key: string; value: string }>;
  release?: { version: string } | null;
  environment?: string | null;
}

async function sentryFetch(path: string, token: string): Promise<Response> {
  return fetch(`${SENTRY_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15_000),
  });
}

export async function fetchSentryIssues(
  since: Date,
  opts: { org: string; project: string; token: string }
): Promise<SentryIssue[]> {
  const sinceIso = since.toISOString();
  const params = new URLSearchParams({
    query: `is:unresolved lastSeen:>${sinceIso}`,
    limit: "100",
    sort: "date",
  });

  const resp = await sentryFetch(
    `/projects/${opts.org}/${opts.project}/issues/?${params}`,
    opts.token
  );

  if (!resp.ok) {
    throw new Error(`Sentry issues API ${resp.status}: ${await resp.text()}`);
  }

  return resp.json();
}

export async function fetchLatestEvent(
  sentryIssueId: string,
  token: string
): Promise<SentryEvent | null> {
  const resp = await sentryFetch(`/issues/${sentryIssueId}/events/latest/`, token);
  if (!resp.ok) return null;
  return resp.json();
}

export function extractStacktrace(event: SentryEvent | null): string | null {
  if (!event) return null;
  const exc = event.entries?.find((e) => e.type === "exception");
  if (!exc) return null;

  try {
    const values = (exc.data as { values?: Array<{
      type?: string; value?: string;
      stacktrace?: { frames?: Array<{
        filename?: string; lineNo?: number; function?: string;
        context?: Array<[number, string]>;
      }> };
    }> }).values ?? [];

    const lines: string[] = [];
    for (const ex of values) {
      if (ex.type) lines.push(`${ex.type}: ${ex.value ?? ""}`);
      const frames = ex.stacktrace?.frames ?? [];
      for (const f of frames.slice(-15)) {
        lines.push(`  at ${f.filename ?? "?"}:${f.lineNo ?? "?"} in ${f.function ?? "?"}`);
        if (f.context) {
          for (const [ln, code] of f.context) {
            if (ln === f.lineNo) lines.push(`    > ${code}`);
          }
        }
      }
    }
    return lines.join("\n") || null;
  } catch {
    return null;
  }
}

export function extractEnvironment(issue: SentryIssue, event: SentryEvent | null): string {
  if (event?.environment) return event.environment;
  return issue.tags.find((t) => t.key === "environment")?.value ?? "unknown";
}

export function extractRelease(event: SentryEvent | null): string | null {
  return event?.release?.version ?? null;
}

export interface SentryValidationResult {
  ok: boolean;
  projectName?: string;
  error?: string;
}

const VALIDATION_ERRORS: Record<number, string> = {
  401: "Invalid token or token has expired.",
  403: "Token lacks required scope (project:read).",
  404: "Project not found — check org and project slug.",
};

export async function validateSentryToken(opts: {
  token: string;
  org: string;
  project: string;
}): Promise<SentryValidationResult> {
  try {
    const projectResp = await sentryFetch(`/projects/${opts.org}/${opts.project}/`, opts.token);
    if (!projectResp.ok) {
      const error = VALIDATION_ERRORS[projectResp.status] ?? `Sentry API error ${projectResp.status}`;
      return { ok: false, error };
    }
    const data = await projectResp.json() as { name?: string };

    const issuesResp = await sentryFetch(
      `/projects/${opts.org}/${opts.project}/issues/?limit=1`,
      opts.token
    );
    if (!issuesResp.ok) {
      const error = issuesResp.status === 403
        ? "Token cannot read issues — project:read scope insufficient."
        : `Sentry issues API error ${issuesResp.status}`;
      return { ok: false, error };
    }

    return { ok: true, projectName: data.name ?? opts.project };
  } catch (err) {
    return { ok: false, error: `Network error: ${String(err)}` };
  }
}
