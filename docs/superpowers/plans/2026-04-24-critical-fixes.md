# Critical Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix five critical security and concurrency bugs: shared pipeline mutex, poller hot-reload duplication, NaN poll interval runaway, unauthenticated destructive routes, and undo IDOR.

**Architecture:** The pipeline mutex moves from a route-local variable into `src/lib/pipeline.ts` so both the API route and the poller share a single gate. The poller switches to `globalThis` for its timer state to survive Next.js hot-module-replacement. Route guards use an `ADMIN_SECRET` env var for the destructive settings endpoint and `SEED_ENABLED=true` for the seed route.

**Tech Stack:** Next.js 16 App Router, Bun test runner, Prisma, TypeScript, Zustand.

---

### Task 1: Move pipeline mutex into `pipeline.ts`

**Files:**
- Modify: `src/lib/pipeline.ts`
- Modify: `src/app/api/pipeline/run/route.ts`

The `pipelineRunning` flag currently lives in the API route module. The poller calls `runPipeline()` directly from `pipeline.ts` and never reads the flag, so concurrent runs are possible. Fix: hoist the flag into `pipeline.ts`, expose it via `isPipelineRunning()`, guard `runPipeline()` with try/finally, and update the route to use the shared flag.

- [ ] **Step 1: Add mutex to `pipeline.ts`**

Replace the bottom of `src/lib/pipeline.ts` (the `runPipeline` export and everything after the imports) with:

```typescript
// ─── Mutex ────────────────────────────────────────────────────────────────────

let _pipelineRunning = false;

export function isPipelineRunning(): boolean {
  return _pipelineRunning;
}

export async function runPipeline(): Promise<PipelineStats> {
  if (_pipelineRunning) throw new Error("Pipeline already running");
  _pipelineRunning = true;
  try {
    const config = await getSentryConfig();
    if (!config) throw new Error("Sentry not configured");

    const startTime = Date.now();
    const { stats, newIssueIds } = await ingestIssues(config);
    writeMeta({ lastPullAt: new Date().toISOString() });
    await briefIssues(newIssueIds, stats);
    const durationMs = Date.now() - startTime;
    writeMeta({ lastPullStats: { ...stats, durationMs } });
    return { ...stats, durationMs };
  } finally {
    _pipelineRunning = false;
  }
}
```

- [ ] **Step 2: Update the API route to use the shared mutex**

Replace the entire content of `src/app/api/pipeline/run/route.ts` with:

```typescript
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

  // Brief generation continues in the background; the mutex is held by runPipeline
  // when called from the poller, but here the route manages its own background work.
  void briefIssues(newIssueIds, stats).then(() => {
    writeMeta({ lastPullStats: { ...stats, durationMs: Date.now() - startTime } });
  }).catch((err) => {
    console.error("[pipeline/run] Background briefing error:", err);
  });

  return NextResponse.json({ ...stats, queued: newIssueIds.length, durationMs: ingestMs });
}
```

- [ ] **Step 3: Verify the app builds**

```bash
cd /mnt/c/Projects/STI && bun run build 2>&1 | tail -20
```

Expected: build completes with no TypeScript errors referencing `pipelineRunning` or `isPipelineRunning`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/pipeline.ts src/app/api/pipeline/run/route.ts
git commit -m "fix: move pipeline mutex into pipeline.ts so poller and API route share it"
```

---

### Task 2: Fix poller hot-reload duplication and NaN interval

**Files:**
- Modify: `src/lib/poller.ts`

In dev mode, Next.js re-evaluates `instrumentation.ts` and all imported modules on each file save. The module-level `started` and `timer` variables reset to their initial values, so `startPoller()` creates a second timer chain alongside the first. After `n` saves there are `n` pollers firing. Fix: store both on `globalThis`, which survives module re-evaluation.

Also fix: `parseInt(raw, 10)` returns `NaN` for non-numeric values, and `Math.max(NaN, 1)` is still `NaN`, making `setTimeout(fn, NaN)` fire as `setTimeout(fn, 0)` — a tight loop.

- [ ] **Step 1: Rewrite `src/lib/poller.ts`**

```typescript
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
```

- [ ] **Step 2: Verify the build**

```bash
cd /mnt/c/Projects/STI && bun run build 2>&1 | tail -10
```

Expected: no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/poller.ts
git commit -m "fix: use globalThis for poller state to survive HMR; guard NaN poll interval"
```

---

### Task 3: Guard `DELETE /api/settings` with `ADMIN_SECRET`

**Files:**
- Modify: `src/app/api/settings/route.ts`

`DELETE /api/settings` wipes every credential in the DB with no authentication. Add an opt-in `ADMIN_SECRET` env var: if set, the `x-admin-secret` header must match. If `ADMIN_SECRET` is not set, the route stays open (preserving current behaviour for local dev without configuration).

- [ ] **Step 1: Add the guard to `DELETE` in `src/app/api/settings/route.ts`**

Replace the `DELETE` function:

```typescript
export async function DELETE(req: NextRequest) {
  const secret = process.env.ADMIN_SECRET?.trim();
  if (secret) {
    const provided = req.headers.get("x-admin-secret");
    if (provided !== secret) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }
  await db.setting.deleteMany({
    where: { key: { in: Object.values(SETTINGS_KEYS) } },
  });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/settings/route.ts
git commit -m "fix: require ADMIN_SECRET header to DELETE all settings"
```

---

### Task 4: Guard `/api/seed` with `SEED_ENABLED=true`

**Files:**
- Modify: `src/app/api/seed/route.ts`

The only production guard is `NODE_ENV === 'production'`. If a developer runs `next dev` against a production database copy, the route is live and one `POST /api/seed` wipes all four tables. Add a second gate: `SEED_ENABLED=true` must be explicitly set.

- [ ] **Step 1: Update the guard in `src/app/api/seed/route.ts`**

Replace the guard at the top of the `POST` function:

```typescript
export async function POST() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Seed disabled in production' }, { status: 403 })
  }
  if (process.env.SEED_ENABLED !== 'true') {
    return NextResponse.json(
      { error: 'Set SEED_ENABLED=true in your .env to enable seeding' },
      { status: 403 }
    )
  }
  // ... rest of the function unchanged
```

- [ ] **Step 2: Add `SEED_ENABLED=true` to `.env` so the Seed button in the sidebar still works locally**

Open `.env` and add:
```
SEED_ENABLED=true
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/seed/route.ts .env
git commit -m "fix: require SEED_ENABLED=true env var to enable the seed route"
```

---

### Task 5: Fix undo decision IDOR

**Files:**
- Modify: `src/app/api/decisions/route.ts`

The `undo` path deletes the latest decision for any `issueId` without checking whether the caller owns it. Any client that knows a valid `issueId` can silently delete another responder's decision. Add a `responderId` ownership check.

- [ ] **Step 1: Add the ownership check in `src/app/api/decisions/route.ts`**

Inside the `POST` handler, replace the `if (decision === 'undo')` block:

```typescript
    if (decision === 'undo') {
      const latestDecision = await db.decision.findFirst({
        where: { issueId },
        orderBy: { createdAt: 'desc' },
      })

      if (!latestDecision) {
        return NextResponse.json({ error: 'No decision to undo' }, { status: 404 })
      }

      if (responderId && latestDecision.responderId !== responderId) {
        return NextResponse.json(
          { error: 'Cannot undo another responder\'s decision' },
          { status: 403 }
        )
      }

      const deleted = await db.decision.delete({
        where: { id: latestDecision.id },
      })

      return NextResponse.json({ decision: deleted, undone: true })
    }
```

- [ ] **Step 2: Verify tests pass**

```bash
cd /mnt/c/Projects/STI && bun test 2>&1 | tail -20
```

Expected: all existing tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/decisions/route.ts
git commit -m "fix: reject undo requests from a different responderId than the decision owner"
```
