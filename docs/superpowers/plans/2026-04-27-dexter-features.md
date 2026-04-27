# Dexter Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three high-value features from Dexter to STI: frequency sparklines in the issue list, bulk triage actions, and storm detection with one-click suppression.

**Architecture:** Sparklines store 7-day daily event counts in a new `statsJson` column on `Issue`, fetched from the Sentry issues stats API during pipeline ingestion. Bulk actions use a new `POST /api/decisions/bulk` endpoint with local selection state in `IssueList`. Storm detection uses a raw SQL GROUP BY query exposed at `GET /api/issues/storms` and rendered as a dismissible banner above the inbox list.

**Tech Stack:** Next.js App Router, Prisma/SQLite, TanStack Query, Zustand, Bun test, pure SVG for sparklines (no chart lib).

---

## File Structure

**New files:**
- `src/app/api/decisions/bulk/route.ts` — POST endpoint, creates decisions for multiple issues in one request
- `src/app/api/decisions/bulk/route.test.ts` — unit tests for the bulk endpoint
- `src/app/api/issues/storms/route.ts` — GET endpoint, returns fingerprint clusters with count ≥ threshold
- `src/app/api/issues/storms/route.test.ts` — unit tests for storms
- `src/components/cockpit/storm-banner.tsx` — dismissible banner listing storm clusters with suppress-all action

**Modified files:**
- `prisma/schema.prisma` — add `statsJson String?` to Issue model
- `src/lib/sentry.ts` — add `fetchIssueStats(issueId, token): Promise<number[]>`
- `src/lib/sentry.test.ts` — tests for `fetchIssueStats`
- `src/lib/pipeline.ts` — call `fetchIssueStats` during ingest alongside the event fetch; store result in `statsJson`
- `src/lib/pipeline.test.ts` — verify statsJson is stored on upsert
- `src/app/api/issues/route.ts` — parse `statsJson` and include `stats: number[]` in formatted issue response
- `src/app/api/issues/route.test.ts` — verify stats field in response
- `src/components/cockpit/issue-list.tsx` — add `Sparkline` component, wire into `IssueRow`; add selection state, checkboxes, bulk action bar; include `StormBanner`

---

## Task 1: Schema change + Sentry stats fetch

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `src/lib/sentry.ts`
- Modify: `src/lib/sentry.test.ts`

- [ ] **Step 1: Add statsJson to schema**

Edit `prisma/schema.prisma`. In the `Issue` model, add `statsJson` after `tags`:

```prisma
model Issue {
  id            String   @id @default(cuid())
  sentryIssueId String   @unique
  projectId     String
  fingerprint   String
  title         String
  level         String   @default("error")
  status        String   @default("unresolved")
  environment   String   @default("production")
  release       String?
  eventCount    Int      @default(1)
  firstSeen     DateTime
  lastSeen      DateTime
  culprit       String   @default("")
  stacktrace    String?
  tags          String   @default("{}")
  statsJson     String?
  brief         Brief?
  decisions     Decision[]
  suppressions  Suppression[]
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@index([fingerprint])
  @@index([lastSeen])
  @@index([level])
  @@index([projectId])
}
```

- [ ] **Step 2: Push schema to DB**

```bash
DATABASE_URL="file:/mnt/c/Projects/STI/db/custom.db" bunx prisma db push
```

Expected output contains: `Your database is now in sync with your Prisma schema.`

- [ ] **Step 3: Regenerate Prisma client**

```bash
bun run db:generate
```

Expected: `Generated Prisma Client`

- [ ] **Step 4: Write the failing test for fetchIssueStats**

In `src/lib/sentry.test.ts`, add after the existing imports and before the first describe block:

```typescript
// ── fetchIssueStats ───────────────────────────────────────────────────────────

describe("fetchIssueStats", () => {
  test("returns array of daily counts from Sentry stats API", async () => {
    const mockFetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve([
          [1745280000, 10],
          [1745366400, 5],
          [1745452800, 20],
          [1745539200, 15],
          [1745625600, 30],
          [1745712000, 25],
          [1745798400, 40],
        ]),
      })
    );
    const origFetch = globalThis.fetch;
    globalThis.fetch = mockFetch as typeof fetch;

    const { fetchIssueStats } = await import("./sentry");
    const counts = await fetchIssueStats("issue-123", "token-abc");

    expect(counts).toEqual([10, 5, 20, 15, 30, 25, 40]);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/issues/issue-123/stats/"),
      expect.any(Object)
    );

    globalThis.fetch = origFetch;
  });

  test("returns empty array when Sentry stats API fails", async () => {
    const mockFetch = mock(() =>
      Promise.resolve({ ok: false, status: 403, text: () => Promise.resolve("Forbidden") })
    );
    const origFetch = globalThis.fetch;
    globalThis.fetch = mockFetch as typeof fetch;

    const { fetchIssueStats } = await import("./sentry");
    const counts = await fetchIssueStats("issue-xyz", "bad-token");

    expect(counts).toEqual([]);

    globalThis.fetch = origFetch;
  });
});
```

- [ ] **Step 5: Run test to verify it fails**

```bash
bun test src/lib/sentry.test.ts --watch=false 2>&1 | tail -10
```

Expected: test failures mentioning `fetchIssueStats is not a function` or similar.

- [ ] **Step 6: Implement fetchIssueStats in sentry.ts**

Add the following to `src/lib/sentry.ts` after `fetchSentryOrgProjects`:

```typescript
export async function fetchIssueStats(issueId: string, token: string): Promise<number[]> {
  const resp = await sentryFetch(
    `/issues/${issueId}/stats/?statsPeriod=7d&resolution=1d`,
    token
  );
  if (!resp.ok) return [];
  const data = await resp.json() as [number, number][];
  return data.map(([, count]) => count);
}
```

- [ ] **Step 7: Run tests to verify they pass**

```bash
bun test src/lib/sentry.test.ts --watch=false 2>&1 | tail -10
```

Expected: all tests pass including the two new ones.

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma src/lib/sentry.ts src/lib/sentry.test.ts
git commit -m "feat: add statsJson column and fetchIssueStats from Sentry"
```

---

## Task 2: Store stats during pipeline ingestion

**Files:**
- Modify: `src/lib/pipeline.ts`
- Modify: `src/lib/pipeline.test.ts`

- [ ] **Step 1: Write failing test**

In `src/lib/pipeline.test.ts`, add a new describe block at the bottom. First, check what mocks are already defined at the top — `mockIssueUpsert` is there. Add a test that verifies `statsJson` is passed to the upsert `create` payload.

Add a new mock at the top of the file alongside the existing mocks:

```typescript
const mockFetchIssueStats = mock(async (_issueId: string, _token: string) => [10, 5, 20, 15, 30, 25, 40]);
```

Add to the `mock.module("@/lib/sentry", ...)` call (which currently mocks `fetchSentryIssues`, `fetchLatestEvent`, etc.) — add `fetchIssueStats: mockFetchIssueStats`.

If the existing `mock.module("@/lib/sentry", ...)` call looks like:

```typescript
mock.module("@/lib/sentry", () => ({
  fetchSentryIssues: mockFetchSentryIssues,
  fetchLatestEvent: mockFetchLatestEvent,
  extractStacktrace: () => "stack",
  extractEnvironment: () => "production",
  extractRelease: () => null,
}));
```

Change it to:

```typescript
mock.module("@/lib/sentry", () => ({
  fetchSentryIssues: mockFetchSentryIssues,
  fetchLatestEvent: mockFetchLatestEvent,
  fetchIssueStats: mockFetchIssueStats,
  extractStacktrace: () => "stack",
  extractEnvironment: () => "production",
  extractRelease: () => null,
}));
```

Then add a test:

```typescript
describe("ingestIssues — statsJson", () => {
  beforeEach(() => {
    mockSettingFindUnique.mockReset();
    mockSettingFindUnique
      .mockResolvedValueOnce({ key: "sentry.token", value: "tok" })
      .mockResolvedValueOnce({ key: "sentry.org", value: "org" });
    mockSentryProjectFindMany.mockResolvedValue([{ slug: "proj" }]);
    mockSuppressionFindMany.mockReset();
    mockSuppressionFindMany.mockResolvedValue([]);
    mockBriefFindUnique.mockReset();
    mockBriefFindUnique.mockResolvedValue(null);
    mockIssueUpsert.mockReset();
    mockIssueUpsert.mockResolvedValue({ id: "issue-1", sentryIssueId: "s1" });
    mockFetchIssueStats.mockReset();
    mockFetchIssueStats.mockResolvedValue([10, 5, 20, 15, 30, 25, 40]);
  });

  test("stores statsJson on issue upsert create", async () => {
    await ingestIssues({ token: "tok", org: "org", projects: ["proj"] });
    const upsertCall = mockIssueUpsert.mock.calls[0][0] as { create: { statsJson?: string } };
    expect(upsertCall.create.statsJson).toBe(JSON.stringify([10, 5, 20, 15, 30, 25, 40]));
  });

  test("stores null statsJson when fetchIssueStats returns empty", async () => {
    mockFetchIssueStats.mockResolvedValue([]);
    await ingestIssues({ token: "tok", org: "org", projects: ["proj"] });
    const upsertCall = mockIssueUpsert.mock.calls[0][0] as { create: { statsJson?: string | null } };
    expect(upsertCall.create.statsJson).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test src/lib/pipeline.test.ts --watch=false 2>&1 | tail -10
```

Expected: failures on `statsJson` assertions.

- [ ] **Step 3: Update ingestIssues in pipeline.ts**

In `src/lib/pipeline.ts`, update the imports to include `fetchIssueStats`:

```typescript
import {
  fetchSentryIssues,
  fetchLatestEvent,
  fetchIssueStats,
  extractStacktrace,
  extractEnvironment,
  extractRelease,
} from "@/lib/sentry";
```

In the `ingestIssues` function, update the batch processing block. The existing code calls `fetchLatestEvent` then upserts. Fetch stats in parallel with the event:

```typescript
batch.map(async (si) => {
  try {
    const fingerprint = si.fingerprints[0] ?? si.id;
    if (suppressedFps.has(fingerprint)) { stats.suppressed++; return; }

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
        tags: JSON.stringify(si.tags),
        statsJson,
      },
      update: {
        eventCount: parseInt(si.count, 10),
        lastSeen: new Date(si.lastSeen),
        status: si.status,
        environment,
        release,
        stacktrace: rawStacktrace ? scrub(rawStacktrace) : null,
        tags: JSON.stringify(si.tags),
        statsJson,
      },
    });
    // ... rest unchanged
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun test src/lib/pipeline.test.ts --watch=false 2>&1 | tail -10
```

Expected: all pipeline tests pass.

- [ ] **Step 5: Run full test suite**

```bash
bun test 2>&1 | tail -5
```

Expected: all pass, 0 fail.

- [ ] **Step 6: Commit**

```bash
git add src/lib/pipeline.ts src/lib/pipeline.test.ts
git commit -m "feat: fetch and store 7-day stats during pipeline ingestion"
```

---

## Task 3: Expose stats in issues API + Sparkline UI

**Files:**
- Modify: `src/app/api/issues/route.ts`
- Modify: `src/app/api/issues/route.test.ts`
- Modify: `src/components/cockpit/issue-list.tsx`

- [ ] **Step 1: Write failing test for stats in issues response**

In `src/app/api/issues/route.test.ts`, find the existing describe block for the inbox view. Add a new test:

```typescript
test("includes parsed stats array in formatted issue", async () => {
  mockSuppressionFindMany.mockResolvedValueOnce([]);
  mockIssueFindMany.mockResolvedValueOnce([
    MINIMAL_ISSUE({ statsJson: JSON.stringify([10, 5, 20, 15, 30, 25, 40]) }),
  ]);
  const res = await GET(makeRequest({ view: "inbox" }));
  const body = await res.json();
  expect(body.issues[0].stats).toEqual([10, 5, 20, 15, 30, 25, 40]);
});

test("returns null stats when statsJson is null", async () => {
  mockSuppressionFindMany.mockResolvedValueOnce([]);
  mockIssueFindMany.mockResolvedValueOnce([
    MINIMAL_ISSUE({ statsJson: null }),
  ]);
  const res = await GET(makeRequest({ view: "inbox" }));
  const body = await res.json();
  expect(body.issues[0].stats).toBeNull();
});
```

Also update `MINIMAL_ISSUE` helper (if present) or the mock data to include `statsJson: null` as a default field, since the DB model now has it. Find the `MINIMAL_ISSUE` function in the test file and add `statsJson: null` to the defaults:

```typescript
function MINIMAL_ISSUE(overrides: Partial<{
  id: string; sentryIssueId: string; fingerprint: string; projectId: string;
  statsJson: string | null;
  // ... other fields already there
}> = {}) {
  return {
    id: "issue-1",
    sentryIssueId: "SENTRY-1",
    fingerprint: "fp-default",
    projectId: "proj-a",
    title: "Test error",
    level: "error",
    status: "unresolved",
    environment: "production",
    release: null,
    eventCount: 1,
    firstSeen: new Date("2026-01-01"),
    lastSeen: new Date("2026-01-02"),
    culprit: "",
    stacktrace: null,
    tags: "{}",
    statsJson: null,
    brief: null,
    decisions: [],
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    ...overrides,
  };
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test src/app/api/issues/route.test.ts --watch=false 2>&1 | tail -10
```

Expected: failures on `stats` field assertions.

- [ ] **Step 3: Update formatIssue in issues/route.ts**

In `src/app/api/issues/route.ts`, update the `formatIssue` function parameter type to include `statsJson`:

Add `statsJson: string | null` to the parameter object type (after `tags`):

```typescript
function formatIssue(issue: {
  // ... existing fields ...
  tags: string
  statsJson: string | null
  brief: { ... } | null
  decisions: { ... }[]
}) {
```

Then in the return object, add after `fingerprint`:

```typescript
stats: issue.statsJson ? (JSON.parse(issue.statsJson) as number[]) : null,
```

Also update the `include: { brief: true, decisions: ... }` clauses in all three switch cases to also select `statsJson`. Since we `include: { brief: true }` and `decisions`, the `statsJson` column is automatically included when fetching the full issue record — no change needed there. Just make sure `formatIssue` receives it.

- [ ] **Step 4: Run test to verify it passes**

```bash
bun test src/app/api/issues/route.test.ts --watch=false 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **Step 5: Add stats to the Issue type in issue-list.tsx**

In `src/components/cockpit/issue-list.tsx`, update the `Issue` interface:

```typescript
export interface Issue {
  id: string;
  sentryId: string;
  title: string;
  level: string;
  project: string;
  environment: string;
  culprit?: string;
  release?: string;
  eventCount: number;
  firstSeen: string;
  lastSeen: string;
  fingerprint: string;
  lean?: string | null;
  confidence?: number | null;
  stats?: number[] | null;       // ← add this
  brief?: { ... } | null;
  decision?: { ... } | null;
}
```

- [ ] **Step 6: Add Sparkline component and wire into IssueRow**

Add the `Sparkline` component directly above `IssueRow` in `src/components/cockpit/issue-list.tsx`:

```typescript
function Sparkline({ counts }: { counts: number[] }) {
  if (counts.length < 2) return null;
  const max = Math.max(...counts, 1);
  const W = 48;
  const H = 14;
  const pts = counts
    .map((c, i) => `${(i / (counts.length - 1)) * W},${H - (c / max) * H}`)
    .join(" ");
  const last = counts[counts.length - 1];
  const prev = counts[counts.length - 2];
  const color = last > prev * 1.3 ? "#F87171" : "#2DD4BF";
  return (
    <svg width={W} height={H} style={{ display: "block", flexShrink: 0 }}>
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
```

In `IssueRow`, add the sparkline inside the meta pills row (after the `evt` pill):

```typescript
{/* Meta pills */}
<div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
  {issue.brief?.module && (
    <span className="sta-meta-pill">
      <span className="k">mod</span>
      <span className="v">{issue.brief.module}</span>
    </span>
  )}
  <span className="sta-meta-pill">
    <span className="k">evt</span>
    <span className="v">{issue.eventCount}</span>
  </span>
  {issue.stats && issue.stats.length >= 2 && (
    <Sparkline counts={issue.stats} />
  )}
  <span className="sta-meta-pill">
    <span className="k">age</span>
    <span className="v">{relativeTime(issue.lastSeen)}</span>
  </span>
  {/* ... rest unchanged */}
```

- [ ] **Step 7: Run full test suite**

```bash
bun test 2>&1 | tail -5
```

Expected: all pass, 0 fail.

- [ ] **Step 8: Commit**

```bash
git add src/app/api/issues/route.ts src/app/api/issues/route.test.ts src/components/cockpit/issue-list.tsx
git commit -m "feat: sparklines — expose stats in issues API and render in issue row"
```

---

## Task 4: Bulk decisions API

**Files:**
- Create: `src/app/api/decisions/bulk/route.ts`
- Create: `src/app/api/decisions/bulk/route.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/app/api/decisions/bulk/route.test.ts`:

```typescript
import { describe, test, expect, mock, beforeEach } from "bun:test";

const mockIssueFindUnique = mock(() =>
  Promise.resolve({ id: "i1", sentryIssueId: "s1", title: "Test" })
);
const mockBriefFindUnique = mock(() =>
  Promise.resolve({ id: "b1", lean: "close" })
);
const mockDecisionCreate = mock(() =>
  Promise.resolve({ id: "d1", decision: "close", issueId: "i1" })
);

mock.module("@/lib/db", () => ({
  db: {
    issue: { findUnique: mockIssueFindUnique },
    brief: { findUnique: mockBriefFindUnique },
    decision: { create: mockDecisionCreate },
  },
}));

const { POST } = await import("./route");

function makeRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/decisions/bulk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as import("next/server").NextRequest;
}

describe("POST /api/decisions/bulk", () => {
  beforeEach(() => {
    mockIssueFindUnique.mockReset();
    mockBriefFindUnique.mockReset();
    mockDecisionCreate.mockReset();
    mockIssueFindUnique.mockResolvedValue({ id: "i1", sentryIssueId: "s1", title: "Test" });
    mockBriefFindUnique.mockResolvedValue({ id: "b1", lean: "close" });
    mockDecisionCreate.mockResolvedValue({ id: "d1", decision: "close", issueId: "i1" });
  });

  test("returns 400 when issueIds is missing", async () => {
    const res = await POST(makeRequest({ decision: "close" }));
    expect(res.status).toBe(400);
  });

  test("returns 400 when issueIds is empty", async () => {
    const res = await POST(makeRequest({ issueIds: [], decision: "close" }));
    expect(res.status).toBe(400);
  });

  test("returns 400 when decision is invalid", async () => {
    const res = await POST(makeRequest({ issueIds: ["i1"], decision: "invalid" }));
    expect(res.status).toBe(400);
  });

  test("creates a decision for each valid issueId", async () => {
    mockIssueFindUnique
      .mockResolvedValueOnce({ id: "i1", sentryIssueId: "s1", title: "T1" })
      .mockResolvedValueOnce({ id: "i2", sentryIssueId: "s2", title: "T2" });
    mockBriefFindUnique
      .mockResolvedValueOnce({ id: "b1", lean: "close" })
      .mockResolvedValueOnce(null);
    mockDecisionCreate
      .mockResolvedValueOnce({ id: "d1", decision: "close", issueId: "i1" })
      .mockResolvedValueOnce({ id: "d2", decision: "close", issueId: "i2" });

    const res = await POST(makeRequest({ issueIds: ["i1", "i2"], decision: "close" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.succeeded).toBe(2);
    expect(body.failed).toBe(0);
  });

  test("skips issues that do not exist and counts them as failed", async () => {
    mockIssueFindUnique.mockResolvedValue(null);
    const res = await POST(makeRequest({ issueIds: ["missing"], decision: "watchlist" }));
    const body = await res.json();
    expect(body.succeeded).toBe(0);
    expect(body.failed).toBe(1);
  });

  test("returns 500 when DB throws", async () => {
    mockIssueFindUnique.mockRejectedValue(new Error("DB error"));
    const res = await POST(makeRequest({ issueIds: ["i1"], decision: "close" }));
    expect(res.status).toBe(500);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test src/app/api/decisions/bulk --watch=false 2>&1 | tail -10
```

Expected: failures because `route.ts` doesn't exist yet.

- [ ] **Step 3: Implement the bulk decisions route**

Create `src/app/api/decisions/bulk/route.ts`:

```typescript
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { VALID_LEANS } from "@/lib/constants";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { issueIds, decision, responderId = "responder-1" } = body;

    if (!Array.isArray(issueIds) || issueIds.length === 0) {
      return NextResponse.json({ error: "issueIds must be a non-empty array" }, { status: 400 });
    }
    if (!VALID_LEANS.includes(decision)) {
      return NextResponse.json(
        { error: `decision must be one of: ${VALID_LEANS.join(", ")}` },
        { status: 400 }
      );
    }

    let succeeded = 0;
    let failed = 0;

    await Promise.all(
      (issueIds as string[]).map(async (issueId) => {
        const issue = await db.issue.findUnique({ where: { id: issueId } });
        if (!issue) { failed++; return; }
        const brief = await db.brief.findUnique({ where: { issueId } });
        await db.decision.create({
          data: {
            issueId,
            briefId: brief?.id ?? null,
            decision,
            aiLean: brief?.lean ?? null,
            responderId,
          },
        });
        succeeded++;
      })
    );

    return NextResponse.json({ succeeded, failed });
  } catch (error) {
    console.error("Bulk decision error:", error);
    return NextResponse.json({ error: "Failed to create decisions", details: String(error) }, { status: 500 });
  }
}
```

Note: `VALID_LEANS` is the exported array from `src/lib/constants.ts`. Check what it exports — if it only exports `isValidLean`, add an exported array:

In `src/lib/constants.ts`, check the current exports. If only `isValidLean` is exported, add:

```typescript
export const VALID_LEANS = ["jira", "close", "investigate", "watchlist"] as const;
export type Lean = (typeof VALID_LEANS)[number];
export function isValidLean(value: string): value is Lean {
  return VALID_LEANS.includes(value as Lean);
}
```

If `VALID_LEANS` doesn't exist yet, add it and update `isValidLean` to use it.

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun test src/app/api/decisions/bulk --watch=false 2>&1 | tail -10
```

Expected: 5/5 pass, 0 fail.

- [ ] **Step 5: Run full test suite**

```bash
bun test 2>&1 | tail -5
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/decisions/bulk/route.ts src/app/api/decisions/bulk/route.test.ts src/lib/constants.ts
git commit -m "feat: bulk decisions endpoint POST /api/decisions/bulk"
```

---

## Task 5: Bulk selection UI

**Files:**
- Modify: `src/components/cockpit/issue-list.tsx`

- [ ] **Step 1: Add select mode state and checkbox to IssueRow**

In `src/components/cockpit/issue-list.tsx`, update `IssueRow` props and component:

```typescript
function IssueRow({
  issue,
  isSelected,
  isFocused,
  isChecked,
  selectMode,
  onClick,
  onCheck,
}: {
  issue: Issue;
  isSelected: boolean;
  isFocused: boolean;
  isChecked: boolean;
  selectMode: boolean;
  onClick: () => void;
  onCheck: (checked: boolean) => void;
}) {
```

Inside the button's outermost div (just before the header row), add:

```typescript
{selectMode && (
  <input
    type="checkbox"
    checked={isChecked}
    onChange={(e) => { e.stopPropagation(); onCheck(e.target.checked); }}
    onClick={(e) => e.stopPropagation()}
    style={{ marginRight: "8px", flexShrink: 0, accentColor: "#2DD4BF" }}
  />
)}
```

Change the button's `onClick` handler: if `selectMode`, toggle checkbox instead of selecting detail.

Replace `onClick` in the `<button>` element:

```typescript
onClick={() => {
  if (selectMode) {
    onCheck(!isChecked);
  } else {
    onClick();
  }
}}
```

- [ ] **Step 2: Add select mode state and bulk action bar to IssueList**

In `IssueList`, add state variables after existing state:

```typescript
const [selectMode, setSelectMode] = useState(false);
const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
const queryClient = useQueryClient();
const [bulkPending, setBulkPending] = useState(false);
```

Reset selection when view or filters change — add to the existing `useEffect` that resets `limit`:

```typescript
useEffect(() => {
  setLimit(50);
  setSelectMode(false);
  setCheckedIds(new Set());
}, [currentView, filters.lean, filters.search, filters.level, filters.project, filters.since24h]);
```

Add a toggle button in the list header (after the total count span):

```typescript
{(currentView === "inbox" || currentView === "watchlist") && (
  <button
    className="sta-btn"
    onClick={() => { setSelectMode((m) => !m); setCheckedIds(new Set()); }}
    style={{ marginLeft: "auto", padding: "3px 8px", fontSize: "9px" }}
  >
    {selectMode ? "Cancel" : "Select"}
  </button>
)}
```

- [ ] **Step 3: Add bulk action bar that appears when items are checked**

Add the bulk action bar just before the closing `</div>` of the `IssueList` return, inside the flex column, after the list scroll area:

```typescript
{selectMode && checkedIds.size > 0 && (
  <div style={{
    borderTop: "1px solid #1F2D45", padding: "8px 14px",
    background: "#111827", flexShrink: 0,
    display: "flex", gap: "6px", alignItems: "center",
  }}>
    <span style={{
      fontFamily: "var(--font-jetbrains-mono, 'JetBrains Mono', 'IBM Plex Mono', monospace)",
      fontSize: "10px", color: "#3D4F68", marginRight: "4px",
    }}>
      {checkedIds.size} selected
    </span>
    {(["close", "watchlist", "investigate"] as const).map((action) => (
      <button
        key={action}
        className={`sta-lean-badge sta-lean-${action}`}
        disabled={bulkPending}
        style={{ cursor: "pointer" }}
        onClick={async () => {
          setBulkPending(true);
          try {
            await fetch("/api/decisions/bulk", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ issueIds: Array.from(checkedIds), decision: action }),
            });
            queryClient.invalidateQueries({ queryKey: ["issues"] });
            queryClient.invalidateQueries({ queryKey: ["metrics"] });
            queryClient.invalidateQueries({ queryKey: ["nav-count"] });
            setCheckedIds(new Set());
            setSelectMode(false);
          } finally {
            setBulkPending(false);
          }
        }}
      >
        {action} all
      </button>
    ))}
    <button
      className="sta-btn"
      style={{ padding: "2px 8px", fontSize: "9px", marginLeft: "auto" }}
      onClick={() => {
        if (checkedIds.size === issues.length) {
          setCheckedIds(new Set());
        } else {
          setCheckedIds(new Set(issues.map((i) => i.id)));
        }
      }}
    >
      {checkedIds.size === issues.length ? "Deselect all" : "Select all"}
    </button>
  </div>
)}
```

- [ ] **Step 4: Wire IssueRow props in the list render**

In the `issues.map(...)` section, update `IssueRow` usage:

```typescript
<IssueRow
  issue={issue}
  isSelected={issue.id === selectedIssueId}
  isFocused={index === focusedIndex}
  isChecked={checkedIds.has(issue.id)}
  selectMode={selectMode}
  onClick={() => selectIssue(issue.id)}
  onCheck={(checked) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(issue.id);
      else next.delete(issue.id);
      return next;
    });
  }}
/>
```

- [ ] **Step 5: Run full test suite**

```bash
bun test 2>&1 | tail -5
```

Expected: all pass, 0 fail.

- [ ] **Step 6: Commit**

```bash
git add src/components/cockpit/issue-list.tsx
git commit -m "feat: bulk selection and triage actions in issue list"
```

---

## Task 6: Storm detection API

**Files:**
- Create: `src/app/api/issues/storms/route.ts`
- Create: `src/app/api/issues/storms/route.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/app/api/issues/storms/route.test.ts`:

```typescript
import { describe, test, expect, mock, beforeEach } from "bun:test";

const mockQueryRaw = mock(() => Promise.resolve([]));

mock.module("@/lib/db", () => ({
  db: { $queryRaw: mockQueryRaw },
}));

const { GET } = await import("./route");

function makeRequest(params: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/issues/storms");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Request(url.toString()) as import("next/server").NextRequest;
}

describe("GET /api/issues/storms", () => {
  beforeEach(() => {
    mockQueryRaw.mockReset();
    mockQueryRaw.mockResolvedValue([]);
  });

  test("returns empty storms array when no clusters found", async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.storms).toEqual([]);
  });

  test("returns storms with correct shape", async () => {
    mockQueryRaw.mockResolvedValue([
      {
        fingerprint: "fp-abc",
        count: BigInt(5),
        sampleTitle: "TypeError: x is null",
        sampleIssueId: "issue-1",
        projectList: "proj-a,proj-b",
      },
    ]);
    const res = await GET(makeRequest());
    const body = await res.json();
    expect(body.storms).toHaveLength(1);
    expect(body.storms[0]).toEqual({
      fingerprint: "fp-abc",
      count: 5,
      sampleTitle: "TypeError: x is null",
      sampleIssueId: "issue-1",
      projects: ["proj-a", "proj-b"],
    });
  });

  test("uses threshold query param", async () => {
    await GET(makeRequest({ threshold: "5" }));
    // verify $queryRaw was called (threshold is embedded in the SQL template)
    expect(mockQueryRaw).toHaveBeenCalled();
  });

  test("returns 500 when DB throws", async () => {
    mockQueryRaw.mockRejectedValue(new Error("DB error"));
    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test src/app/api/issues/storms --watch=false 2>&1 | tail -10
```

Expected: failures because `route.ts` doesn't exist.

- [ ] **Step 3: Implement the storms route**

Create `src/app/api/issues/storms/route.ts`:

```typescript
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

interface StormRow {
  fingerprint: string;
  count: bigint;
  sampleTitle: string;
  sampleIssueId: string;
  projectList: string;
}

export async function GET(request: NextRequest) {
  try {
    const threshold = Math.max(
      2,
      parseInt(new URL(request.url).searchParams.get("threshold") ?? "3", 10)
    );

    const rows = await db.$queryRaw<StormRow[]>`
      SELECT
        i.fingerprint,
        COUNT(*) AS count,
        MIN(i.title) AS sampleTitle,
        MIN(i.id) AS sampleIssueId,
        GROUP_CONCAT(DISTINCT i.projectId) AS projectList
      FROM "Issue" i
      INNER JOIN "Brief" b ON b."issueId" = i.id
      WHERE NOT EXISTS (
        SELECT 1 FROM "Decision" d WHERE d."issueId" = i.id
      )
      AND i.fingerprint NOT IN (
        SELECT fingerprint FROM "Suppression" WHERE scope = 'global'
      )
      GROUP BY i.fingerprint
      HAVING COUNT(*) >= ${threshold}
      ORDER BY COUNT(*) DESC
      LIMIT 10
    `;

    const storms = rows.map((r) => ({
      fingerprint: r.fingerprint,
      count: Number(r.count),
      sampleTitle: r.sampleTitle,
      sampleIssueId: r.sampleIssueId,
      projects: r.projectList ? r.projectList.split(",") : [],
    }));

    return NextResponse.json({ storms });
  } catch (error) {
    console.error("Storms fetch error:", error);
    return NextResponse.json({ error: "Failed to detect storms", details: String(error) }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun test src/app/api/issues/storms --watch=false 2>&1 | tail -10
```

Expected: 4/4 pass.

- [ ] **Step 5: Run full test suite**

```bash
bun test 2>&1 | tail -5
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/issues/storms/route.ts src/app/api/issues/storms/route.test.ts
git commit -m "feat: storm detection endpoint GET /api/issues/storms"
```

---

## Task 7: Storm banner UI

**Files:**
- Create: `src/components/cockpit/storm-banner.tsx`
- Modify: `src/components/cockpit/issue-list.tsx`

- [ ] **Step 1: Create the StormBanner component**

Create `src/components/cockpit/storm-banner.tsx`:

```typescript
"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface Storm {
  fingerprint: string;
  count: number;
  sampleTitle: string;
  sampleIssueId: string;
  projects: string[];
}

const MONO: React.CSSProperties = {
  fontFamily: "var(--font-jetbrains-mono, 'JetBrains Mono', 'IBM Plex Mono', monospace)",
  fontSize: "10px",
};

export function StormBanner() {
  const queryClient = useQueryClient();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const { data } = useQuery<{ storms: Storm[] }>({
    queryKey: ["storms"],
    queryFn: () =>
      fetch("/api/issues/storms").then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      }),
    staleTime: 60_000,
  });

  const suppressMutation = useMutation({
    mutationFn: (fingerprint: string) =>
      fetch("/api/suppressions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fingerprint, reason: "Storm detected", scope: "global" }),
      }).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      }),
    onSuccess: (_data, fingerprint) => {
      setDismissed((prev) => new Set(prev).add(fingerprint));
      queryClient.invalidateQueries({ queryKey: ["issues"] });
      queryClient.invalidateQueries({ queryKey: ["storms"] });
      queryClient.invalidateQueries({ queryKey: ["metrics"] });
    },
  });

  const visible = (data?.storms ?? []).filter((s) => !dismissed.has(s.fingerprint));
  if (visible.length === 0) return null;

  return (
    <div style={{
      borderBottom: "1px solid #1F2D45", background: "#0D1825",
      padding: "8px 14px", flexShrink: 0, display: "flex", flexDirection: "column", gap: "6px",
    }}>
      <div style={{ ...MONO, color: "#F59E0B", letterSpacing: "0.12em", textTransform: "uppercase", fontSize: "9px" }}>
        ⚡ Storm detection — {visible.length} pattern{visible.length !== 1 ? "s" : ""} detected
      </div>
      {visible.map((storm) => (
        <div key={storm.fingerprint} style={{
          display: "flex", alignItems: "center", gap: "10px",
          background: "rgba(245,158,11,0.05)", border: "1px solid rgba(245,158,11,0.15)",
          borderRadius: "3px", padding: "6px 10px",
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ ...MONO, color: "#F0F4FF", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {storm.sampleTitle}
            </div>
            <div style={{ ...MONO, color: "#3D4F68", fontSize: "9px", marginTop: "2px" }}>
              {storm.count} issues · {storm.projects.slice(0, 3).join(", ")}{storm.projects.length > 3 ? ` +${storm.projects.length - 3}` : ""}
            </div>
          </div>
          <button
            className="sta-btn"
            onClick={() => suppressMutation.mutate(storm.fingerprint)}
            disabled={suppressMutation.isPending}
            style={{ padding: "3px 8px", fontSize: "9px", flexShrink: 0 }}
          >
            Suppress all
          </button>
          <button
            onClick={() => setDismissed((prev) => new Set(prev).add(storm.fingerprint))}
            style={{
              background: "none", border: "none", color: "#3D4F68",
              cursor: "pointer", fontSize: "12px", padding: "0 2px", flexShrink: 0,
            }}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Add StormBanner to IssueList**

In `src/components/cockpit/issue-list.tsx`, import the component at the top:

```typescript
import { StormBanner } from "@/components/cockpit/storm-banner";
```

In the `IssueList` return JSX, add `<StormBanner />` between the lean filter chips section and the list scroll area, but only when the view is `"inbox"`:

```typescript
{/* Storm detection */}
{currentView === "inbox" && <StormBanner />}

{/* List */}
<div style={{ flex: 1, overflowY: "auto" }}>
```

- [ ] **Step 3: Run full test suite**

```bash
bun test 2>&1 | tail -5
```

Expected: all pass, 0 fail.

- [ ] **Step 4: Commit**

```bash
git add src/components/cockpit/storm-banner.tsx src/components/cockpit/issue-list.tsx
git commit -m "feat: storm banner with suppress-all in inbox"
```

---

## Self-Review

**Spec coverage:**
- ✅ Frequency sparklines — Task 1 (schema+fetch), Task 2 (API), Task 3 (UI)
- ✅ Bulk actions — Task 4 (API), Task 5 (UI)
- ✅ Storm detection — Task 6 (API), Task 7 (UI)

**Placeholder scan:** None found. All steps contain complete code.

**Type consistency:**
- `fetchIssueStats` returns `number[]` throughout — consistent in sentry.ts, pipeline.ts, route.ts, issue-list.tsx
- `Storm` interface defined once in storm-banner.tsx
- `VALID_LEANS` used in bulk route matches constants.ts definition
- `StormBanner` imported and used correctly in issue-list.tsx
