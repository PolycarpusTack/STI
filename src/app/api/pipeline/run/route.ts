import { NextResponse } from "next/server";
import { readMeta, writeMeta } from "@/lib/meta";
import { getSentryConfig, ingestIssues, briefIssues, isPipelineRunning } from "@/lib/pipeline";

export async function GET() {
  const meta = readMeta();
  const config = await getSentryConfig();
  return NextResponse.json({
    configured: !!config,
    lastPullAt: meta.lastPullAt,
    lastPullStats: meta.lastPullStats,
  });
}

export async function POST() {
  if (isPipelineRunning()) {
    return NextResponse.json({ error: "Pipeline already running" }, { status: 409 });
  }

  const config = await getSentryConfig();
  if (!config) {
    return NextResponse.json(
      { error: "Sentry not configured. Set SENTRY_TOKEN, SENTRY_ORG, SENTRY_PROJECT in .env." },
      { status: 503 }
    );
  }

  const startTime = Date.now();
  let stats: Awaited<ReturnType<typeof ingestIssues>>["stats"];
  let newIssueIds: string[];

  try {
    const result = await ingestIssues(config);
    stats = result.stats;
    newIssueIds = result.newIssueIds;
  } catch (err) {
    console.error("[pipeline/run] Ingest failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }

  const ingestMs = Date.now() - startTime;
  // Write lastPullAt immediately so the window advances even if briefing is interrupted.
  writeMeta({ lastPullAt: new Date().toISOString() });

  // Brief generation continues in the background.
  void briefIssues(newIssueIds, stats).then(() => {
    writeMeta({ lastPullStats: { ...stats, durationMs: Date.now() - startTime } });
  }).catch((err) => {
    console.error("[pipeline/run] Background briefing error:", err);
  });

  return NextResponse.json({ ...stats, queued: newIssueIds.length, durationMs: ingestMs });
}
