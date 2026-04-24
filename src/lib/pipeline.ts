import { db } from "@/lib/db";
import {
  fetchSentryIssues,
  fetchLatestEvent,
  extractStacktrace,
  extractEnvironment,
  extractRelease,
} from "@/lib/sentry";
import { scrub } from "@/lib/scrubber";
import { generateBrief } from "@/lib/brief";
import { readMeta, writeMeta } from "@/lib/meta";
import { getEffectiveSetting, SETTINGS_KEYS } from "@/lib/settings";

const COLD_START_HOURS = 24;
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
  const [token, org, project] = await Promise.all([
    getEffectiveSetting(SETTINGS_KEYS.sentryToken, "SENTRY_TOKEN"),
    getEffectiveSetting(SETTINGS_KEYS.sentryOrg, "SENTRY_ORG"),
    getEffectiveSetting(SETTINGS_KEYS.sentryProject, "SENTRY_PROJECT"),
  ]);
  return token && org && project ? { token, org, project } : null;
}

export async function ingestIssues(opts: {
  token: string;
  org: string;
  project: string;
}): Promise<{ stats: PipelineStats; newIssueIds: string[] }> {
  const stats: PipelineStats = { ingested: 0, briefed: 0, skipped: 0, suppressed: 0, errors: 0 };

  const meta = readMeta();
  const since = meta.lastPullAt
    ? new Date(meta.lastPullAt)
    : new Date(Date.now() - COLD_START_HOURS * 3_600_000);

  const sentryIssues = await fetchSentryIssues(since, opts);
  const suppressions = await db.suppression.findMany({ select: { fingerprint: true } });
  const suppressedFps = new Set(suppressions.map((s) => s.fingerprint));
  const newIssueIds: string[] = [];

  for (let i = 0; i < sentryIssues.length; i += EVENT_CONCURRENCY) {
    const batch = sentryIssues.slice(i, i + EVENT_CONCURRENCY);
    await Promise.all(
      batch.map(async (si) => {
        try {
          const fingerprint = si.fingerprints[0] ?? si.id;
          if (suppressedFps.has(fingerprint)) { stats.suppressed++; return; }

          const event = await fetchLatestEvent(si.id, opts.token);
          const rawStacktrace = extractStacktrace(event);
          const environment = extractEnvironment(si, event);
          const release = extractRelease(event);

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
              tags: JSON.stringify(si.tags),
            },
            update: {
              eventCount: parseInt(si.count, 10),
              lastSeen: new Date(si.lastSeen),
              status: si.status,
              environment,
              release,
              stacktrace: rawStacktrace ? scrub(rawStacktrace) : null,
              tags: JSON.stringify(si.tags),
            },
          });

          stats.ingested++;

          const hasBrief = await db.brief.findUnique({
            where: { issueId: issue.id },
            select: { id: true },
          });
          if (!hasBrief) newIssueIds.push(issue.id);
          else stats.skipped++;
        } catch (err) {
          console.error(`[pipeline] Issue ${si.id} failed:`, err);
          stats.errors++;
        }
      })
    );
  }

  return { stats, newIssueIds };
}

export async function briefIssues(ids: string[], stats: PipelineStats): Promise<void> {
  for (let i = 0; i < ids.length; i += BRIEF_CONCURRENCY) {
    const batch = ids.slice(i, i + BRIEF_CONCURRENCY);
    await Promise.all(
      batch.map(async (id) => {
        try {
          await generateBrief(id);
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

export async function runPipeline(opts: { background?: boolean } = {}): Promise<PipelineStats> {
  if (_pipelineRunning) throw new Error("Pipeline already running");
  _pipelineRunning = true;

  const release = () => { _pipelineRunning = false; };

  try {
    const config = await getSentryConfig();
    if (!config) throw new Error("Sentry not configured");

    const startTime = Date.now();
    const { stats, newIssueIds } = await ingestIssues(config);
    writeMeta({ lastPullAt: new Date().toISOString() });

    if (opts.background) {
      void briefIssues(newIssueIds, stats)
        .then(() => writeMeta({ lastPullStats: { ...stats, durationMs: Date.now() - startTime } }))
        .catch((err) => console.error("[pipeline] Background brief error:", err))
        .finally(release);
      return { ...stats, durationMs: Date.now() - startTime };
    }

    await briefIssues(newIssueIds, stats);
    const durationMs = Date.now() - startTime;
    writeMeta({ lastPullStats: { ...stats, durationMs } });
    return { ...stats, durationMs };
  } catch (err) {
    release();
    throw err;
  }
}
