# Second Pass Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix eight confirmed bugs found during code review and external assessment: pipeline mutex bypass, settings DELETE open by default, suppress-modal silent failure, wrong pagination totals, non-functional brief regeneration, undeletable undo bypass, asymmetric disagreement rate, and a jira-modal useEffect mount issue.

**Architecture:** All fixes are isolated to existing files — no new modules needed. The biggest change is to `runPipeline()` in `pipeline.ts`, which gains a `{ background?: boolean }` option so the API route can hold the mutex while returning early to the client. Everything else is a targeted one- or two-line correction.

**Tech Stack:** Next.js 16 App Router, Prisma/SQLite, React 19, Bun test runner.

---

### Task 1: Fix pipeline mutex bypass — API route must hold the mutex

**Files:**
- Modify: `src/lib/pipeline.ts`
- Modify: `src/app/api/pipeline/run/route.ts`

The API route currently checks `isPipelineRunning()` but then calls `ingestIssues()` and `briefIssues()` directly, never setting `_pipelineRunning = true`. The poller and a manual trigger can run simultaneously. Fix: add a `background` option to `runPipeline()` that holds the mutex across the full execution (including background briefing) and returns immediately after ingest.

- [ ] **Step 1: Update `runPipeline()` in `src/lib/pipeline.ts`**

Replace the function (lines 139–155):

```typescript
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
```

The existing `try/finally` is replaced with explicit `release()` calls so the non-background path still releases on throw, and the background path releases after briefing finishes.

- [ ] **Step 2: Simplify `src/app/api/pipeline/run/route.ts`**

Replace the entire `POST` handler:

```typescript
export async function POST() {
  const config = await getSentryConfig();
  if (!config) {
    return NextResponse.json(
      { error: "Sentry not configured. Set SENTRY_TOKEN, SENTRY_ORG, SENTRY_PROJECT in .env." },
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
```

Update imports — remove `ingestIssues`, `briefIssues`; add `runPipeline`:

```typescript
import { NextResponse } from "next/server";
import { readMeta } from "@/lib/meta";
import { getSentryConfig, runPipeline } from "@/lib/pipeline";
```

- [ ] **Step 3: Run tests**

```bash
cd /mnt/c/Projects/STI && bun test 2>&1 | tail -8
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/pipeline.ts src/app/api/pipeline/run/route.ts
git commit -m "fix: hold pipeline mutex across background briefing in API route"
```

---

### Task 2: Fix `DELETE /api/settings` open when ADMIN_SECRET is not set

**Files:**
- Modify: `src/app/api/settings/route.ts`

When `ADMIN_SECRET` is not set, `if (secret)` is falsy and `db.setting.deleteMany()` runs for any unauthenticated caller. The guard must fail-closed: if no secret is configured, the endpoint is disabled entirely.

- [ ] **Step 1: Invert the ADMIN_SECRET guard in `src/app/api/settings/route.ts`**

Replace lines 84–91:

```typescript
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
```

- [ ] **Step 2: Run tests**

```bash
cd /mnt/c/Projects/STI && bun test 2>&1 | tail -8
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/settings/route.ts
git commit -m "fix: require ADMIN_SECRET to be set for DELETE /api/settings to work"
```

---

### Task 3: Fix suppress-modal silent failure on fetch error

**Files:**
- Modify: `src/components/cockpit/suppress-modal.tsx`

Both `fetch` calls in `mutationFn` have no `!r.ok` check. A failed suppression POST is silently followed by a `close` decision, leaving the UI in an inconsistent state.

- [ ] **Step 1: Add error checks to `mutationFn` in `suppress-modal.tsx`**

Replace the `mutationFn` body (currently lines 24–43):

```typescript
  const suppressMutation = useMutation({
    mutationFn: async () => {
      const r1 = await fetch("/api/suppressions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fingerprint: issue?.fingerprint,
          reason,
          scope,
          tenantValue: scope === "tenant" ? (issue?.project ?? null) : null,
        }),
      });
      if (!r1.ok) throw new Error(`Suppression failed: HTTP ${r1.status}`);

      const r2 = await fetch("/api/decisions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          issueId: suppressModalIssueId,
          decision: "close",
          metadata: { suppressReason: reason, suppressScope: scope },
        }),
      });
      if (!r2.ok) throw new Error(`Decision failed: HTTP ${r2.status}`);
    },
```

- [ ] **Step 2: Run tests**

```bash
cd /mnt/c/Projects/STI && bun test 2>&1 | tail -8
```

- [ ] **Step 3: Commit**

```bash
git add src/components/cockpit/suppress-modal.tsx
git commit -m "fix: throw on failed suppression/decision fetch so onError fires instead of onSuccess"
```

---

### Task 4: Fix `total` in issues route returning page size instead of true count

**Files:**
- Modify: `src/app/api/issues/route.ts`

`total: filtered.length` returns the number of rows on the current page (max = `limit`). The sidebar uses `limit=1` so it always gets `total: 1`. The fix: run a separate `count` query for each view before the paginated `findMany`, then return that count as `total`.

- [ ] **Step 1: Add count queries to each view in `src/app/api/issues/route.ts`**

After the `switch` statement that sets `issues` (around line 195), replace the response block:

```typescript
    return NextResponse.json({
      issues: filtered.map(formatIssue),
      total: filtered.length,  // WRONG — this line
      limit,
      offset,
      view,
    })
```

With:

```typescript
    const total = await countIssues(view, where, lean)

    return NextResponse.json({
      issues: filtered.map(formatIssue),
      total,
      limit,
      offset,
      view,
    })
```

Add the `countIssues` helper function immediately before the `GET` export (around line 88):

```typescript
async function countIssues(
  view: string,
  where: Record<string, unknown>,
  lean: string | null
): Promise<number> {
  switch (view) {
    case 'inbox': {
      const briefFilter = lean ? { lean } : { isNot: null };
      const allSuppressions = await db.suppression.findMany({
        select: { fingerprint: true, scope: true },
      });
      const globalFps = allSuppressions
        .filter((s) => s.scope === 'global')
        .map((s) => s.fingerprint);
      return db.issue.count({
        where: {
          ...where,
          brief: briefFilter,
          decisions: { none: {} },
          fingerprint: { notIn: globalFps },
        },
      });
    }
    case 'watchlist':
      return db.issue.count({
        where: {
          ...where,
          decisions: {
            some: { decision: 'watchlist' },
            none: { decision: { in: ['jira', 'close', 'investigate'] } },
          },
        },
      });
    case 'suppressed': {
      const suppressedFingerprints = await db.suppression.findMany({
        select: { fingerprint: true },
      });
      const fpList = suppressedFingerprints.map((s) => s.fingerprint);
      return db.issue.count({ where: { ...where, fingerprint: { in: fpList } } });
    }
    default:
      return 0;
  }
}
```

Note: the inbox count omits the in-memory tenant-suppression filter. This means the count may be slightly higher than actual results when tenant-scoped suppressions are in use — an acceptable approximation for the sidebar counter.

- [ ] **Step 2: Run tests**

```bash
cd /mnt/c/Projects/STI && bun test 2>&1 | tail -8
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/issues/route.ts
git commit -m "fix: return true DB count instead of page length in issues route total field"
```

---

### Task 5: Fix brief regeneration — delete existing brief before regenerating

**Files:**
- Modify: `src/app/api/brief/[id]/route.ts`

`generateBrief()` returns the existing brief if one already exists (`src/lib/brief.ts:305`). The regenerate endpoint needs to delete the existing brief first so `generateBrief()` produces a fresh one.

- [ ] **Step 1: Delete existing brief before calling `generateBrief` in `src/app/api/brief/[id]/route.ts`**

Replace the handler body:

```typescript
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const issue = await db.issue.findUnique({ where: { id }, select: { id: true } });
    if (!issue) {
      return NextResponse.json({ error: "Issue not found" }, { status: 404 });
    }

    await db.brief.deleteMany({ where: { issueId: id } });

    const brief = await generateBrief(id);
    return NextResponse.json({ brief });
  } catch (error) {
    console.error("Brief generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate brief", details: String(error) },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Run tests**

```bash
cd /mnt/c/Projects/STI && bun test 2>&1 | tail -8
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/brief/[id]/route.ts
git commit -m "fix: delete existing brief before regenerating so the route actually produces a new brief"
```

---

### Task 6: Fix undo ownership check — require responderId for undo actions

**Files:**
- Modify: `src/app/api/decisions/route.ts`

The ownership check `if (responderId && latestDecision.responderId !== responderId)` allows bypass by omitting `responderId`. Invert the logic: only allow the undo if `responderId` is provided AND matches.

- [ ] **Step 1: Tighten the undo check in `src/app/api/decisions/route.ts`**

Find the undo ownership block (around line 88) and replace it:

```typescript
    if (decision === 'undo') {
      if (!responderId) {
        return NextResponse.json({ error: 'responderId is required to undo a decision' }, { status: 400 })
      }
      const latestDecision = await db.decision.findFirst({
        where: { issueId },
        orderBy: { createdAt: 'desc' },
      })
      if (!latestDecision) {
        return NextResponse.json({ error: 'No decision to undo' }, { status: 404 })
      }
      if (latestDecision.responderId !== responderId) {
        return NextResponse.json({ error: "Cannot undo another responder's decision" }, { status: 403 })
      }
      await db.decision.delete({ where: { id: latestDecision.id } })
      return NextResponse.json({ ok: true })
    }
```

- [ ] **Step 2: Run tests**

```bash
cd /mnt/c/Projects/STI && bun test 2>&1 | tail -8
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/decisions/route.ts
git commit -m "fix: require responderId for undo — omitting it no longer bypasses ownership check"
```

---

### Task 7: Fix metrics disagreement rate asymmetry

**Files:**
- Modify: `src/app/api/metrics/route.ts`

The query filters `decision !== 'watchlist'` but not `aiLean !== 'watchlist'`, inflating the disagreement rate when AI recommended watchlist but human chose something actionable.

- [ ] **Step 1: Exclude watchlist on both sides in `src/app/api/metrics/route.ts`**

Replace the `actionable` query (around line 35):

```typescript
    const actionable = await db.decision.findMany({
      where: {
        aiLean: { not: null, notIn: ['watchlist'] },
        decision: { not: 'watchlist' },
      },
      select: { decision: true, aiLean: true },
      orderBy: { createdAt: 'desc' },
      take: 1000,
    })
```

- [ ] **Step 2: Run tests**

```bash
cd /mnt/c/Projects/STI && bun test 2>&1 | tail -8
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/metrics/route.ts
git commit -m "fix: exclude watchlist from both aiLean and decision sides of disagreement rate query"
```

---

### Task 8: Fix jira-modal reset effect firing on mount

**Files:**
- Modify: `src/components/cockpit/jira-modal.tsx`

The reset effect fires on mount because `jiraModalOpen` starts `false`. Use a `useRef` to track the previous value and only reset on the transition from `true → false`.

- [ ] **Step 1: Update the reset effect in `jira-modal.tsx`**

Add `useRef` to the React import (it's currently `import { useState, useEffect } from "react"`):

```typescript
import { useState, useEffect, useRef } from "react";
```

Replace the reset `useEffect`:

```typescript
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !jiraModalOpen) {
      setSummary("");
      setDescription("");
      setPriority("medium");
      setComponent("");
      setJiraSubmitError(null);
    }
    wasOpen.current = jiraModalOpen;
  }, [jiraModalOpen]);
```

- [ ] **Step 2: Run tests**

```bash
cd /mnt/c/Projects/STI && bun test 2>&1 | tail -8
```

- [ ] **Step 3: Commit**

```bash
git add src/components/cockpit/jira-modal.tsx
git commit -m "fix: only reset jira-modal fields on open→close transition, not on mount"
```
