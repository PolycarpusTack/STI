# High-Severity Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix six high-severity performance and data-integrity issues: N+1 Sentry API calls, `generateBrief` race on concurrent calls, non-atomic `writeMeta`, stale stacktrace on re-ingestion, missing DB indexes, and suppression duplicates.

**Architecture:** Sentry event fetches move from serial to batched-parallel. `generateBrief` catches the Prisma P2002 unique-constraint error to handle concurrent callers gracefully. `writeMeta` uses a tmp-file + `renameSync` for atomicity. The Issue upsert `update` branch now refreshes `stacktrace`, `environment`, `release`, and `tags`. New schema indexes cover `Issue.lastSeen`, `Issue.level`, and `Brief.lean`. Suppression creation does a `findFirst` check before `create` to prevent duplicates.

**Tech Stack:** Next.js 16 App Router, Bun test runner, Prisma/SQLite, TypeScript.

---

### Task 1: Batch Sentry event fetches (fix N+1)

**Files:**
- Modify: `src/lib/pipeline.ts`

`ingestIssues` calls `fetchLatestEvent(si.id, token)` sequentially inside a `for` loop. 100 issues = 100 serial HTTP round-trips before any DB work happens. Replace with a batched `Promise.all` using a concurrency limit of 5.

- [ ] **Step 1: Rewrite `ingestIssues` in `src/lib/pipeline.ts`**

Replace the `ingestIssues` function body (keep the signature identical):

```typescript
const EVENT_CONCURRENCY = 5;

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
```

Note: this also fixes the stale-data bug — `environment`, `release`, `stacktrace`, and `tags` are now refreshed on every upsert, not just on first insert.

- [ ] **Step 2: Run tests**

```bash
cd /mnt/c/Projects/STI && bun test 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/lib/pipeline.ts
git commit -m "fix: batch Sentry event fetches concurrently; refresh stacktrace/env on upsert"
```

---

### Task 2: Fix `generateBrief` concurrent-call race

**Files:**
- Modify: `src/lib/brief.ts`

Two concurrent callers both pass the `if (existing) return existing` guard before either has written the row, then both call the LLM (wasted cost) and race to `db.brief.create`. The second `create` throws a Prisma P2002 unique-constraint error. Fix: catch P2002 and return the row the winner already created.

- [ ] **Step 1: Add Prisma import and update `generateBrief` in `src/lib/brief.ts`**

Add this import at the top of the file (after existing imports):

```typescript
import { Prisma } from "@prisma/client";
```

At the end of `generateBrief`, replace the final `return db.brief.create(...)` call with:

```typescript
  try {
    return await db.brief.create({
      data: {
        issueId,
        promptVersion: "v1.0.0-sentinel",
        lean: parsed ? parsed.lean : "investigate",
        confidence: parsed ? parsed.confidence : 0,
        priority: parsed ? parsed.priority : "",
        issueType: parsed ? parsed.issueType : "",
        summary: parsed ? parsed.summary : "Failed to parse Sentinel response. Raw response stored.",
        module: parsed ? parsed.module : "",
        tenantImpact: parsed ? parsed.tenantImpact : "",
        reproductionHint: parsed ? parsed.reproductionHint : null,
        confidenceNotes: parsed ? parsed.confidenceNotes : null,
        signals: parsed ? parsed.signals : null,
        rawResponse,
        parseError: !parsed,
        tokenCount,
        latencyMs,
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      // A concurrent caller already created the brief — return what they wrote.
      return await db.brief.findUniqueOrThrow({ where: { issueId } });
    }
    throw err;
  }
```

- [ ] **Step 2: Run tests**

```bash
cd /mnt/c/Projects/STI && bun test src/lib/brief 2>&1 | tail -20
```

Expected: all `parseSentinelResponse` tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/lib/brief.ts
git commit -m "fix: catch Prisma P2002 in generateBrief to handle concurrent callers"
```

---

### Task 3: Make `writeMeta` atomic

**Files:**
- Modify: `src/lib/meta.ts`

`writeMeta` reads the file, merges the patch, then writes it back. Concurrent calls can interleave the read and write, causing one to silently overwrite the other's data. Fix: write to a temp file then `renameSync` (atomic on Linux/WSL).

- [ ] **Step 1: Rewrite `src/lib/meta.ts`**

```typescript
import { readFileSync, writeFileSync, mkdirSync, renameSync } from "fs";
import { join } from "path";

const META_PATH = join(process.cwd(), "db", "meta.json");
const META_TMP  = META_PATH + ".tmp";

export interface PipelineStats {
  ingested: number;
  briefed: number;
  skipped: number;
  suppressed: number;
  errors: number;
  durationMs: number;
}

export interface Meta {
  lastPullAt: string | null;
  lastPullStats: PipelineStats | null;
}

export function readMeta(): Meta {
  try {
    return JSON.parse(readFileSync(META_PATH, "utf-8"));
  } catch {
    return { lastPullAt: null, lastPullStats: null };
  }
}

export function writeMeta(patch: Partial<Meta>): void {
  try {
    mkdirSync(join(process.cwd(), "db"), { recursive: true });
    const merged = { ...readMeta(), ...patch };
    writeFileSync(META_TMP, JSON.stringify(merged, null, 2));
    renameSync(META_TMP, META_PATH);
  } catch (e) {
    console.error("[meta] Failed to write meta.json:", e);
  }
}
```

- [ ] **Step 2: Run tests**

```bash
cd /mnt/c/Projects/STI && bun test 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/lib/meta.ts
git commit -m "fix: make writeMeta atomic via tmp file + renameSync"
```

---

### Task 4: Add missing DB indexes

**Files:**
- Modify: `prisma/schema.prisma`

Every inbox/watchlist/suppressed view sorts by `Issue.lastSeen` with no index — full table scan + sort on every request. The `level` filter in the issues API has no index. The `lean` filter on `Brief` has no index.

- [ ] **Step 1: Add indexes to `prisma/schema.prisma`**

In the `Issue` model, add two new `@@index` lines after the existing `@@index([fingerprint])`:

```prisma
  @@index([fingerprint])
  @@index([lastSeen])
  @@index([level])
```

In the `Brief` model, add after the existing fields (before the closing `}`):

```prisma
  @@index([lean])
```

- [ ] **Step 2: Push schema to the DB**

```bash
cd /mnt/c/Projects/STI && bun run db:push
```

Expected: output shows the three new indexes created, no data loss.

- [ ] **Step 3: Regenerate Prisma client**

```bash
cd /mnt/c/Projects/STI && bun run db:generate
```

Expected: `Generated Prisma Client` message.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "fix: add DB indexes on Issue.lastSeen, Issue.level, Brief.lean"
```

---

### Task 5: Prevent duplicate suppressions

**Files:**
- Modify: `src/app/api/suppressions/route.ts`

`Suppression` has no unique constraint on `fingerprint`. Multiple identical fingerprint suppressions accumulate silently. Fix: add a `findFirst` check before `create` and return the existing row if one already exists (idempotent behaviour).

- [ ] **Step 1: Update `POST` in `src/app/api/suppressions/route.ts`**

Replace the `POST` handler:

```typescript
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { fingerprint, reason, scope, tenantValue, authorId } = body

    if (!fingerprint) {
      return NextResponse.json({ error: 'fingerprint is required' }, { status: 400 })
    }

    const effectiveScope = scope ?? 'global'
    const effectiveTenant = effectiveScope === 'tenant' ? (tenantValue ?? null) : null

    // Idempotent: return existing suppression if one already exists for this fingerprint+scope.
    const existing = await db.suppression.findFirst({
      where: { fingerprint, scope: effectiveScope, tenantValue: effectiveTenant },
      include: { _count: { select: { issues: true } } },
    })

    if (existing) {
      return NextResponse.json({
        id: existing.id,
        fingerprint: existing.fingerprint,
        reason: existing.reason,
        scope: existing.scope,
        author: existing.authorId,
        createdAt: existing.createdAt.toISOString(),
        lastMatched: existing.lastMatchedAt?.toISOString() ?? null,
        matchCount: existing._count.issues,
      })
    }

    const suppression = await db.suppression.create({
      data: {
        fingerprint,
        reason: reason ?? '',
        scope: effectiveScope,
        tenantValue: effectiveTenant,
        authorId: authorId ?? 'system',
      },
    })

    return NextResponse.json({
      id: suppression.id,
      fingerprint: suppression.fingerprint,
      reason: suppression.reason,
      scope: suppression.scope,
      author: suppression.authorId,
      createdAt: suppression.createdAt.toISOString(),
      lastMatched: null,
      matchCount: 0,
    })
  } catch (error) {
    console.error('Suppression creation error:', error)
    return NextResponse.json({ error: 'Failed to create suppression', details: String(error) }, { status: 500 })
  }
}
```

- [ ] **Step 2: Run tests**

```bash
cd /mnt/c/Projects/STI && bun test 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/suppressions/route.ts
git commit -m "fix: make suppression creation idempotent to prevent duplicate fingerprint rows"
```
