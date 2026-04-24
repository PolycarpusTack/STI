#!/usr/bin/env bun
/**
 * STA pipeline poller.
 * Run: bun run poller  (or: bun mini-services/poller.ts)
 *
 * Env vars:
 *   POLL_INTERVAL_MINUTES  — fallback interval in minutes if not set in app (default: 10)
 *   NEXT_PUBLIC_BASE_URL   — base URL of the Next.js app (default: http://localhost:3000)
 */

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
const FALLBACK_INTERVAL_MINUTES = parseInt(process.env.POLL_INTERVAL_MINUTES ?? "10", 10);

function log(msg: string) {
  console.log(`[poller] ${new Date().toISOString()}  ${msg}`);
}

async function getIntervalMinutes(): Promise<number> {
  try {
    const res = await fetch(`${BASE_URL}/api/settings`);
    if (res.ok) {
      const { pollIntervalMinutes } = await res.json();
      if (typeof pollIntervalMinutes === "number" && pollIntervalMinutes > 0) {
        return pollIntervalMinutes;
      }
    }
  } catch { /* fall through */ }
  return FALLBACK_INTERVAL_MINUTES;
}

async function runPipeline() {
  const t = Date.now();
  try {
    const res = await fetch(`${BASE_URL}/api/pipeline/run`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      log(`ERROR ${res.status} — ${data.error ?? JSON.stringify(data)}`);
    } else {
      const { ingested = 0, briefed = 0, suppressed = 0, skipped = 0, errors = 0, durationMs = 0 } = data;
      log(`OK ${durationMs}ms — ingested:${ingested} briefed:${briefed} suppressed:${suppressed} skipped:${skipped} errors:${errors}`);
    }
  } catch (err) {
    log(`FATAL ${Date.now() - t}ms — ${err}`);
  }
}

async function loop() {
  log(`Starting. target=${BASE_URL}  fallback-interval=${FALLBACK_INTERVAL_MINUTES}m`);

  while (true) {
    const intervalMinutes = await getIntervalMinutes();
    log(`Next run in ${intervalMinutes}m`);
    await Bun.sleep(intervalMinutes * 60_000);
    await runPipeline();
  }
}

// Run once immediately, then loop
await runPipeline();
await loop();
