import { NextResponse } from "next/server";
import { readMeta } from "@/lib/meta";
import { getSentryConfig, runPipeline } from "@/lib/pipeline";

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
  const config = await getSentryConfig();
  if (!config) {
    return NextResponse.json(
      { error: "Sentry not configured. Set SENTRY_TOKEN and SENTRY_ORG (via .env or Settings), then add at least one project in Settings." },
      { status: 503 }
    );
  }

  try {
    const stats = await runPipeline({ background: true });
    return NextResponse.json({ ...stats, queued: undefined });
  } catch (err) {
    const msg = String(err);
    if (msg.includes("already running")) {
      return NextResponse.json({ error: "Pipeline already running" }, { status: 409 });
    }
    console.error("[pipeline/run] Error:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
