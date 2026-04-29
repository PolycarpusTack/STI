import { db } from "@/lib/db";
import {
  fetchSentryIssues,
  fetchLatestEvent,
  fetchIssueStats,
  extractStacktrace,
  extractEnvironment,
  extractRelease,
} from "@/lib/sentry";
import { scrub } from "@/lib/scrubber";
import { generateBrief, LlmConfig } from "@/lib/brief";
import { readMeta, writeMeta } from "@/lib/meta";
import { getEffectiveSetting, SETTINGS_KEYS } from "@/lib/settings";

const COLD_START_HOURS = 24 * 7; // 7-day lookback on first pull
const BRIEF_CONCURRENCY = 3;
const EVENT_CONCURRENCY = 5;

export interface PipelineStats {
  ingested: number;
  briefed: number;
  skipped: number;
  suppressed: number;
  errors: number;
  durationMs?: number;
}

export async function getSentryConfig() {
  const [token, org] = await Promise.all([
    getEffectiveSetting(SETTINGS_KEYS.sentryToken, "SENTRY_TOKEN"),
    getEffectiveSetting(SETTINGS_KEYS.sentryOrg, "SENTRY_ORG"),
  ]);
  if (!token || !org) return null;

  const dbProjects = await db.sentryProject.findMany({
    select: { slug: true },
    orderBy: { createdAt: "asc" },
  });

  const projects =
    dbProjects.length > 0
      ? dbProjects.map((p) => p.slug)
      : [await getEffectiveSetting(SETTINGS_KEYS.sentryProject, "SENTRY_PROJECT")]
          .filter(Boolean) as string[];

  return projects.length > 0 ? { token, org, projects } : null;
}

async function resolveLlmConfig(): Promise<LlmConfig> {
  const [baseUrl, apiKey, model] = await Promise.all([
    getEffectiveSetting(SETTINGS_KEYS.llmBaseUrl, "LLM_BASE_URL"),
    getEffectiveSetting(SETTINGS_KEYS.llmApiKey, "LLM_API_KEY"),
    getEffectiveSetting(SETTINGS_KEYS.llmModel, "LLM_MODEL"),
  ]);
  return { baseUrl, apiKey, model };
}

export async function ingestIssues(opts: {
  token: string;
  org: string;
  projects: string[];
}): Promise<{ stats: PipelineStats; newIssueIds: string[] }> {
  const stats: PipelineStats = { ingested: 0, briefed: 0, skipped: 0, suppressed: 0, errors: 0 };

  const meta = readMeta();
  const since = meta.lastPullAt
    ? new Date(meta.lastPullAt)
    : new Date(Date.now() - COLD_START_HOURS * 3_600_000);

  const suppressions = await db.suppression.findMany({
    select: { id: true, fingerprint: true, scope: true, tenantValue: true },
  });
  // Group by fingerprint for O(1) candidate lookup per issue.
  const suppressionsByFp = new Map<string, { id: string; scope: string; tenantValue: string | null }[]>();
  for (const s of suppressions) {
    const list = suppressionsByFp.get(s.fingerprint) ?? [];
    list.push(s);
    suppressionsByFp.set(s.fingerprint, list);
  }
  const newIssueIds: string[] = [];

  for (const project of opts.projects) {
    try {
      const sentryIssues = await fetchSentryIssues(since, { token: opts.token, org: opts.org, project });

      for (let i = 0; i < sentryIssues.length; i += EVENT_CONCURRENCY) {
        const batch = sentryIssues.slice(i, i + EVENT_CONCURRENCY);
        await Promise.all(
          batch.map(async (si) => {
            try {
              const fingerprint = si.fingerprints?.[0] ?? si.id;
              const candidates = suppressionsByFp.get(fingerprint);
              const matchingSuppression = candidates?.find(
                (s) => s.scope === 'global' || (s.scope === 'tenant' && s.tenantValue === project)
              );
              if (matchingSuppression) {
                stats.suppressed++;
                await db.suppression.update({ where: { id: matchingSuppression.id }, data: { lastMatchedAt: new Date() } });
                return;
              }

              const [event, dailyCounts] = await Promise.all([
                fetchLatestEvent(si.id, opts.token),
                fetchIssueStats(si.id, opts.token),
              ]);
              const rawStacktrace = extractStacktrace(event);
              const environment = extractEnvironment(si, event);
              const release = extractRelease(event);
              const statsJson = dailyCounts.length > 0 ? JSON.stringify(dailyCounts) : null;

              const issue = await db.issue.upsert({
                where: { sentryIssueId: si.id },
                create: {
                  sentryIssueId: si.id,
                  projectId: si.project.slug,
                  fingerprint,
                  title: scrub(si.title),
                  level: si.level,
                  status: si.status,
                  environment,
                  release,
                  eventCount: parseInt(si.count, 10),
                  firstSeen: new Date(si.firstSeen),
                  lastSeen: new Date(si.lastSeen),
                  culprit: scrub(si.culprit ?? ""),
                  stacktrace: rawStacktrace ? scrub(rawStacktrace) : null,
                  tags: JSON.stringify((si.tags ?? []).map(t => ({ key: t.key, value: scrub(t.value) }))),
                  statsJson,
                },
                update: {
                  eventCount: parseInt(si.count, 10),
                  lastSeen: new Date(si.lastSeen),
                  status: si.status,
                  environment,
                  release,
                  stacktrace: rawStacktrace ? scrub(rawStacktrace) : null,
                  tags: JSON.stringify((si.tags ?? []).map(t => ({ key: t.key, value: scrub(t.value) }))),
                  statsJson,
                },
                include: { brief: { select: { id: true } } },
              });

              stats.ingested++;

              if (!issue.brief) newIssueIds.push(issue.id);
              else stats.skipped++;
            } catch (err) {
              console.error(`[pipeline] Issue ${si.id} failed:`, err);
              stats.errors++;
            }
          })
        );
      }
    } catch (err) {
      console.error(`[pipeline] Failed to fetch issues for project ${project}:`, err);
      stats.errors++;
    }
  }

  return { stats, newIssueIds };
}

export async function briefIssues(ids: string[], stats: PipelineStats, config: LlmConfig): Promise<void> {
  for (let i = 0; i < ids.length; i += BRIEF_CONCURRENCY) {
    const batch = ids.slice(i, i + BRIEF_CONCURRENCY);
    await Promise.all(
      batch.map(async (id) => {
        try {
          await generateBrief(id, config);
          stats.briefed++;
        } catch (err) {
          console.error(`[pipeline] Brief failed for ${id}:`, err);
          stats.errors++;
        }
      })
    );
  }
}

// ─── Mutex ────────────────────────────────────────────────────────────────────

let _pipelineRunning = false;

export function isPipelineRunning(): boolean {
  return _pipelineRunning;
}

export async function runPipeline(opts: { background?: boolean } = {}): Promise<PipelineStats & { briefing?: 'background' }> {
  if (_pipelineRunning) throw new Error("Pipeline already running");
  _pipelineRunning = true;

  const release = () => { _pipelineRunning = false; };

  try {
    const config = await getSentryConfig();
    if (!config) throw new Error("Sentry not configured");

    const llmConfig = await resolveLlmConfig();
    const startTime = Date.now();
    const { stats, newIssueIds } = await ingestIssues(config);
    writeMeta({ lastPullAt: new Date().toISOString() });

    // Also pick up issues that were ingested in a prior run but never briefed
    // (e.g. LLM was down). Merge with newly ingested, dedup by ID.
    const strandedRows = await db.issue.findMany({
      where: { brief: null },
      select: { id: true },
    });
    const strandedIds = strandedRows.map((r) => r.id).filter((id) => !newIssueIds.includes(id));
    const allToBrief = [...newIssueIds, ...strandedIds];

    if (opts.background) {
      void briefIssues(allToBrief, stats, llmConfig)
        .catch((err) => console.error("[pipeline] Background brief error:", err))
        .finally(() => {
          writeMeta({ lastPullStats: { ...stats, durationMs: Date.now() - startTime }, lastCompletedAt: new Date().toISOString() });
          release();
        });
      // briefed/errors reflect ingestion only at this point — briefing is still running.
      return { ...stats, briefing: 'background' as const, durationMs: Date.now() - startTime };
    }

    await briefIssues(allToBrief, stats, llmConfig);
    const durationMs = Date.now() - startTime;
    writeMeta({ lastPullStats: { ...stats, durationMs }, lastCompletedAt: new Date().toISOString() });
    release();
    return { ...stats, durationMs };
  } catch (err) {
    release();
    throw err;
  }
}
