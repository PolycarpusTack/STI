import { getEffectiveSetting, SETTINGS_KEYS } from "@/lib/settings";
import { runPipeline, isPipelineRunning } from "@/lib/pipeline";

// Use globalThis so these survive Next.js hot-module-replacement in dev.
const g = globalThis as typeof globalThis & {
  _staPollerStarted?: boolean;
  _staPollerTimer?: ReturnType<typeof setTimeout>;
};

export function startPoller() {
  if (g._staPollerStarted) return;
  g._staPollerStarted = true;
  void scheduleNext();
}

async function scheduleNext() {
  const raw = await getEffectiveSetting(SETTINGS_KEYS.pollIntervalMinutes, "POLL_INTERVAL_MINUTES");
  const parsed = parseInt(raw ?? "10", 10);
  const intervalMs = (isNaN(parsed) ? 10 : Math.max(parsed, 1)) * 60_000;

  if (g._staPollerTimer) clearTimeout(g._staPollerTimer);
  g._staPollerTimer = setTimeout(async () => {
    if (!isPipelineRunning()) {
      try {
        const stats = await runPipeline();
        console.log(
          `[poller] Run complete — ingested ${stats.ingested}, briefed ${stats.briefed}, errors ${stats.errors}`
        );
      } catch (err) {
        console.error("[poller] Pipeline error:", err);
      }
    } else {
      console.log("[poller] Skipping run — pipeline already running");
    }
    void scheduleNext();
  }, intervalMs);
}

export function stopPoller() {
  if (g._staPollerTimer) {
    clearTimeout(g._staPollerTimer);
    g._staPollerTimer = undefined;
  }
  g._staPollerStarted = false;
}
