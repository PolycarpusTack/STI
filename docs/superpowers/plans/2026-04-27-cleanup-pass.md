# Cleanup Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove dead code, fix structural issues, and improve performance in the STI codebase as identified in the code review.

**Architecture:** Changes are organised bottom-up: dead code first (zero risk), then type/structural fixes (import-only impact), then performance changes that touch pipeline and API logic. Each task is independently committable and testable.

**Tech Stack:** Next.js 14, TypeScript, Prisma/SQLite, Bun test, TanStack Query

---

## Already Fixed (do not re-implement)

The following bugs were fixed in the previous session and are complete:
- `si.fingerprints?.[0]` optional-chain crash in `pipeline.ts:74`
- Tenant suppression `tenantValue` validation in `suppressions/route.ts`
- Disagreement filter pagination bug in `decisions/route.ts`
- Decision value validation against `VALID_LEANS` in `decisions/route.ts`

---

## File Map

| File | Change |
|---|---|
| `src/lib/admin-guard.ts` | DELETE |
| `src/lib/poller.ts` | Remove `stopPoller` export |
| `src/lib/settings.ts` | Remove `getSettings`, `SettingsKey` |
| `src/lib/settings.test.ts` | Remove `getSettings` test |
| `src/lib/meta.ts` | Import `PipelineStats` from pipeline, remove local definition |
| `src/lib/pipeline.ts` | Remove local `PipelineStats`; add `LlmConfig` + `resolveLlmConfig`; use `include: { brief }` on upsert; pass config to `briefIssues` |
| `src/lib/brief.ts` | Accept optional `LlmConfig` param in `generateBrief` |
| `src/lib/types.ts` | Add `Issue` interface (moved from `issue-list.tsx`) |
| `src/components/cockpit/issue-list.tsx` | Remove `Issue` definition, import from `@/lib/types` |
| `src/components/cockpit/issue-detail.tsx` | Remove `CONF_COLOR` alias; import `Issue` from `@/lib/types` |
| `src/app/api/decisions/route.ts` | Remove `responderId` GET param |
| `src/app/api/decisions/bulk/route.ts` | Replace per-ID queries with batch `findMany` + `createMany` |
| `src/app/api/decisions/bulk/route.test.ts` | Update mocks for batch approach |
| `src/app/api/issues/[id]/route.ts` | Remove `jiraId` from response |
| `src/app/api/issues/route.ts` | Remove `jiraId` from `formatIssue` input type; remove fragile `suppressedFps` fallback in `countIssues` |
| `src/app/api/settings/route.ts` | Replace inline env-var fallback with `getEffectiveSetting` |

---

## Task 1: Delete dead exports

**Files:**
- Delete: `src/lib/admin-guard.ts`
- Modify: `src/lib/poller.ts` (remove `stopPoller`)
- Modify: `src/lib/settings.ts` (remove `getSettings`, `SettingsKey`)
- Modify: `src/lib/settings.test.ts` (remove `getSettings` test)

- [ ] **Step 1: Verify nothing imports admin-guard**

```bash
grep -r "admin-guard" /mnt/c/Projects/STI/src
```
Expected: no output.

- [ ] **Step 2: Delete admin-guard.ts**

Delete the file `src/lib/admin-guard.ts` entirely.

- [ ] **Step 3: Verify nothing imports stopPoller**

```bash
grep -r "stopPoller" /mnt/c/Projects/STI/src
```
Expected: only `src/lib/poller.ts` itself.

- [ ] **Step 4: Remove stopPoller from poller.ts**

In `src/lib/poller.ts`, remove lines 39–45:

```ts
// REMOVE this entire block:
export function stopPoller() {
  if (g._staPollerTimer) {
    clearTimeout(g._staPollerTimer);
    g._staPollerTimer = undefined;
  }
  g._staPollerStarted = false;
}
```

- [ ] **Step 5: Verify nothing imports getSettings or SettingsKey**

```bash
grep -r "getSettings\|SettingsKey" /mnt/c/Projects/STI/src
```
Expected: only `src/lib/settings.ts` and `src/lib/settings.test.ts`.

- [ ] **Step 6: Remove getSettings and SettingsKey from settings.ts**

In `src/lib/settings.ts`, remove line 17 and lines 32–35:

```ts
// REMOVE:
export type SettingsKey = (typeof SETTINGS_KEYS)[keyof typeof SETTINGS_KEYS];

// REMOVE:
export async function getSettings() {
  const rows = await db.setting.findMany();
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}
```

- [ ] **Step 7: Remove getSettings test from settings.test.ts**

Open `src/lib/settings.test.ts` and delete any `describe`/`test` block that imports or calls `getSettings`. Leave all other tests intact.

- [ ] **Step 8: Run tests**

```bash
bun test src/lib/settings.test.ts
```
Expected: all remaining tests pass.

- [ ] **Step 9: Commit**

```bash
git add src/lib/admin-guard.ts src/lib/poller.ts src/lib/settings.ts src/lib/settings.test.ts
git commit -m "chore: remove dead exports (admin-guard, stopPoller, getSettings, SettingsKey)"
```

---

## Task 2: Remove dead jiraId field from decisions write/read

The `jiraId` column is always written as `null` and has no frontend consumer. Remove it from the decision write and from the single-issue response.

**Files:**
- Modify: `src/app/api/decisions/route.ts` (remove `jiraId: null` from create payload)
- Modify: `src/app/api/issues/[id]/route.ts` (remove `jiraId` from decision shape)
- Modify: `src/app/api/issues/route.ts` (remove `jiraId` from the `formatIssue` input type)

- [ ] **Step 1: Remove jiraId from decisions/route.ts create**

In `src/app/api/decisions/route.ts`, find the `db.decision.create` call (around line 150) and remove the `jiraId: null` field:

```ts
// BEFORE:
const createdDecision = await db.decision.create({
  data: {
    issueId,
    briefId: brief?.id ?? null,
    decision,
    aiLean: brief?.lean ?? null,
    responderId: responderId ?? 'responder-1',
    jiraId: null,
    jiraKey,
    jiraError,
    ...metaFields,
  },
})

// AFTER:
const createdDecision = await db.decision.create({
  data: {
    issueId,
    briefId: brief?.id ?? null,
    decision,
    aiLean: brief?.lean ?? null,
    responderId: responderId ?? 'responder-1',
    jiraKey,
    jiraError,
    ...metaFields,
  },
})
```

- [ ] **Step 2: Remove jiraId from issues/[id]/route.ts response**

In `src/app/api/issues/[id]/route.ts`, find the `decision` shape in the formatted response (around line 58) and remove `jiraId`:

```ts
// BEFORE:
decision: latestDecision ? {
  decision: latestDecision.decision,
  responder: latestDecision.responderId,
  timestamp: latestDecision.createdAt.toISOString(),
  aiLean: latestDecision.aiLean,
  jiraId: latestDecision.jiraId,
  jiraKey: latestDecision.jiraKey ?? null,
} : null,

// AFTER:
decision: latestDecision ? {
  decision: latestDecision.decision,
  responder: latestDecision.responderId,
  timestamp: latestDecision.createdAt.toISOString(),
  aiLean: latestDecision.aiLean,
  jiraKey: latestDecision.jiraKey ?? null,
} : null,
```

- [ ] **Step 3: Remove jiraId from formatIssue input type in issues/route.ts**

In `src/app/api/issues/route.ts`, find the `formatIssue` function signature (around line 5). The `decisions` array type includes `jiraId: string | null`. Remove it:

```ts
// BEFORE (in the decisions array type):
  decisions: {
    id: string
    issueId: string
    briefId: string | null
    decision: string
    aiLean: string | null
    responderId: string
    jiraId: string | null
    jiraKey?: string | null
    suppressed: boolean
    createdAt: Date
  }[]

// AFTER:
  decisions: {
    id: string
    issueId: string
    briefId: string | null
    decision: string
    aiLean: string | null
    responderId: string
    jiraKey?: string | null
    suppressed: boolean
    createdAt: Date
  }[]
```

- [ ] **Step 4: Run tests**

```bash
bun test src/app/api/decisions/route.test.ts src/app/api/issues/route.test.ts
```
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/decisions/route.ts src/app/api/issues/[id]/route.ts src/app/api/issues/route.ts
git commit -m "chore: remove always-null jiraId from decision write and issue responses"
```

---

## Task 3: Remove dead responderId GET filter from decisions route

The frontend never passes `responderId` as a GET param. The filter is dead.

**Files:**
- Modify: `src/app/api/decisions/route.ts`

- [ ] **Step 1: Remove responderId from GET handler**

In `src/app/api/decisions/route.ts`, in the `GET` function, remove the `responderId` param and its `where` usage:

```ts
// BEFORE:
const responderId = url.searchParams.get('responderId')
const disagreementsOnly = url.searchParams.get('disagreement') === 'true'

const where: Record<string, unknown> = {}
if (responderId) where.responderId = responderId

// AFTER:
const disagreementsOnly = url.searchParams.get('disagreement') === 'true'

const where: Record<string, unknown> = {}
```

Also remove the `responderId` check inside `disagreementsOnly` path — after removing it from `where`, the spread `{ ...where, aiLean: { not: null } }` will simply not include it. Nothing else references `responderId` in the GET handler.

- [ ] **Step 2: Run tests**

```bash
bun test src/app/api/decisions/route.test.ts
```
Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/decisions/route.ts
git commit -m "chore: remove dead responderId GET filter from decisions endpoint"
```

---

## Task 4: Remove CONF_COLOR alias in issue-detail.tsx

A one-line alias `const CONF_COLOR = CONF_COLORS` is unused except once, needlessly.

**Files:**
- Modify: `src/components/cockpit/issue-detail.tsx`

- [ ] **Step 1: Search for CONF_COLOR usage**

```bash
grep -n "CONF_COLOR" /mnt/c/Projects/STI/src/components/cockpit/issue-detail.tsx
```
Expected: line 9 (definition) and one other line (usage).

- [ ] **Step 2: Remove the alias and replace its usage**

In `src/components/cockpit/issue-detail.tsx`:

Remove line 9:
```ts
// REMOVE:
const CONF_COLOR = CONF_COLORS;
```

Find the line that uses `CONF_COLOR[...]` and replace with `CONF_COLORS[...]`:
```ts
// BEFORE (wherever CONF_COLOR is used, e.g.):
className={CONF_COLOR[confidenceLevel(issue.confidence ?? 0)]}

// AFTER:
className={CONF_COLORS[confidenceLevel(issue.confidence ?? 0)]}
```

- [ ] **Step 3: Run lint**

```bash
bun run lint
```
Expected: no errors related to this file.

- [ ] **Step 4: Commit**

```bash
git add src/components/cockpit/issue-detail.tsx
git commit -m "chore: remove pointless CONF_COLOR alias in issue-detail"
```

---

## Task 5: Deduplicate PipelineStats — meta.ts imports from pipeline.ts

`PipelineStats` is defined in both `src/lib/pipeline.ts` and `src/lib/meta.ts` with slightly different shapes (`durationMs` optional vs. required). `meta.ts` should import the canonical definition.

**Files:**
- Modify: `src/lib/meta.ts`
- Modify: `src/lib/pipeline.ts` (confirm it exports `PipelineStats`)

- [ ] **Step 1: Confirm pipeline.ts exports PipelineStats**

```bash
grep -n "export interface PipelineStats" /mnt/c/Projects/STI/src/lib/pipeline.ts
```
Expected: found at approximately line 19.

- [ ] **Step 2: Update meta.ts to import PipelineStats from pipeline**

Replace the local `PipelineStats` definition in `src/lib/meta.ts` and import it from `pipeline`. The file should become:

```ts
import { readFileSync, writeFileSync, mkdirSync, renameSync } from "fs";
import { join } from "path";
import type { PipelineStats } from "@/lib/pipeline";

const META_PATH = join(process.cwd(), "db", "meta.json");
const META_TMP  = META_PATH + ".tmp";

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

- [ ] **Step 3: Run tests**

```bash
bun test src/lib/pipeline.test.ts
```
Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/meta.ts
git commit -m "chore: deduplicate PipelineStats — meta.ts imports from pipeline.ts"
```

---

## Task 6: Move Issue interface to lib/types.ts

`Issue` is defined in `src/components/cockpit/issue-list.tsx` and imported through it by `issue-detail.tsx`. A domain type should not live in a renderer.

**Files:**
- Modify: `src/lib/types.ts` (add `Issue`)
- Modify: `src/components/cockpit/issue-list.tsx` (remove definition, import from types)
- Modify: `src/components/cockpit/issue-detail.tsx` (change import source)

- [ ] **Step 1: Add Issue to lib/types.ts**

`src/lib/types.ts` currently only contains `Metrics`. Append the `Issue` interface (copy exactly from `issue-list.tsx` lines 11–46):

```ts
export interface Metrics {
  queueSize: number;
  handledToday: number;
  disagreementRate: number;
  lastPull: string | null;
  briefsGenerated: number;
  totalDecisions: number;
  llmModel: string | null;
  sentryConfigured: boolean;
}

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
  stats?: number[] | null;
  brief?: {
    summary?: string;
    module?: string;
    tenantImpact?: string;
    reproductionHint?: string;
    priority?: string | null;
    issueType?: string | null;
    confidenceNotes?: string | null;
    signals?: string | null;
    promptVersion?: string;
    parseError?: string | null;
    rawResponse?: string | null;
  } | null;
  decision?: {
    decision: string;
    responder: string;
    timestamp: string;
    jiraKey?: string | null;
  } | null;
}
```

- [ ] **Step 2: Update issue-list.tsx — remove definition, import from types**

In `src/components/cockpit/issue-list.tsx`:

Remove the `export interface Issue { ... }` block (lines 11–46).

Add import at the top:
```ts
import type { Issue } from "@/lib/types";
```

Keep the existing `interface IssuesResponse` and everything else unchanged.

- [ ] **Step 3: Update issue-detail.tsx — change import source**

In `src/components/cockpit/issue-detail.tsx`, change:
```ts
// BEFORE:
import type { Issue } from "./issue-list";

// AFTER:
import type { Issue } from "@/lib/types";
```

- [ ] **Step 4: Check for any other consumers of the Issue type**

```bash
grep -rn "from.*issue-list" /mnt/c/Projects/STI/src
```
Expected: zero remaining imports of `Issue` from `issue-list`.

- [ ] **Step 5: Run lint**

```bash
bun run lint
```
Expected: no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/types.ts src/components/cockpit/issue-list.tsx src/components/cockpit/issue-detail.tsx
git commit -m "refactor: move Issue interface from issue-list.tsx to lib/types.ts"
```

---

## Task 7: Fix settings GET — use getEffectiveSetting instead of inline env-var fallback

`src/app/api/settings/route.ts` calls `getSetting()` and then falls back to `process.env.*` inline, duplicating the env-var name strings that `getEffectiveSetting` already centralises. If an env var is renamed, the settings UI would silently stop reflecting it.

Note: token fields (`sentryToken`, `llmApiKey`, `jiraApiKey`) use `TOKEN_MASK` and must NOT show the actual value — they keep special handling. Only the display-safe fields switch to `getEffectiveSetting`.

**Files:**
- Modify: `src/app/api/settings/route.ts`

- [ ] **Step 1: Update import in settings/route.ts**

Change the import line from:
```ts
import { getSetting, setSetting, SETTINGS_KEYS } from "@/lib/settings";
```
to:
```ts
import { getSetting, setSetting, getEffectiveSetting, SETTINGS_KEYS } from "@/lib/settings";
```

- [ ] **Step 2: Replace inline fallbacks in GET handler**

Replace the entire `GET` function body with:

```ts
export async function GET() {
  const [token, org, interval, llmBaseUrl, llmApiKey, llmModel, jiraBaseUrl, jiraEmail, jiraApiKey, jiraProjectKey] = await Promise.all([
    getSetting(SETTINGS_KEYS.sentryToken),
    getEffectiveSetting(SETTINGS_KEYS.sentryOrg, "SENTRY_ORG"),
    getEffectiveSetting(SETTINGS_KEYS.pollIntervalMinutes, "POLL_INTERVAL_MINUTES"),
    getEffectiveSetting(SETTINGS_KEYS.llmBaseUrl, "LLM_BASE_URL"),
    getSetting(SETTINGS_KEYS.llmApiKey),
    getEffectiveSetting(SETTINGS_KEYS.llmModel, "LLM_MODEL"),
    getEffectiveSetting(SETTINGS_KEYS.jiraBaseUrl, "JIRA_BASE_URL"),
    getEffectiveSetting(SETTINGS_KEYS.jiraEmail, "JIRA_EMAIL"),
    getSetting(SETTINGS_KEYS.jiraApiKey),
    getEffectiveSetting(SETTINGS_KEYS.jiraProjectKey, "JIRA_PROJECT_KEY"),
  ]);

  return NextResponse.json({
    sentryToken: token ? TOKEN_MASK : null,
    sentryTokenSet: !!token,
    sentryOrg: org ?? "",
    pollIntervalMinutes: parseInt(interval ?? "10", 10),
    llmBaseUrl: llmBaseUrl ?? "",
    llmApiKey: llmApiKey ? TOKEN_MASK : null,
    llmApiKeySet: !!llmApiKey,
    llmModel: llmModel ?? "deepseek-chat",
    jiraBaseUrl: jiraBaseUrl ?? "",
    jiraEmail: jiraEmail ?? "",
    jiraApiKey: jiraApiKey ? TOKEN_MASK : null,
    jiraApiKeySet: !!jiraApiKey,
    jiraProjectKey: jiraProjectKey ?? "",
  });
}
```

- [ ] **Step 3: Run tests**

```bash
bun test src/app/api/settings/route.test.ts
```
Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/settings/route.ts
git commit -m "fix: settings GET uses getEffectiveSetting to honour env-var fallbacks consistently"
```

---

## Task 8: Fix countIssues — remove fragile suppressedFps fallback

`countIssues` accepts `suppressedFps?: string[]` for the `suppressed` case. When undefined, it re-fetches from DB, but the caller always passes it. The fallback is dead code and hides an implicit extra query if the interface changes.

**Files:**
- Modify: `src/app/api/issues/route.ts`

- [ ] **Step 1: Make suppressedFps required for suppressed view**

In `src/app/api/issues/route.ts`, update the `countIssues` signature and the `suppressed` case to remove the fallback. Change `suppressedFps?: string[]` to `suppressedFps: string[]` (required):

```ts
async function countIssues(
  view: string,
  where: Record<string, unknown>,
  lean: string | null,
  globalFps: string[],
  suppressedFps: string[],
  tenantSuppressions: { fingerprint: string; tenantValue: string | null }[]
): Promise<number> {
```

Update the `suppressed` case to remove the `?? await db.suppression.findMany(...)` fallback:

```ts
case 'suppressed': {
  return db.issue.count({
    where: {
      ...where,
      fingerprint: { in: suppressedFps },
      ...(lean ? { brief: { lean } } : {}),
    },
  });
}
```

- [ ] **Step 2: Update all callers of countIssues**

Search for every call to `countIssues` in `issues/route.ts` and ensure all three array params are always passed. Since the function is private to this file, check every call site:

```bash
grep -n "countIssues(" /mnt/c/Projects/STI/src/app/api/issues/route.ts
```

For any call that passed `undefined` for `suppressedFps`, substitute an empty array `[]`. In practice the `inbox` call passes `inboxGlobalFps`, `undefined` for `suppressedFps`, and `inboxTenantSuppressions`. Update it to pass `[]` for `suppressedFps`:

```ts
// BEFORE (in the GET handler, after the switch):
const total = await countIssues(view, where, lean, inboxGlobalFps, suppressedFps, inboxTenantSuppressions)

// The inbox path sets suppressedFps = undefined; watchlist/suppressed set it.
// Ensure empty array fallback:
const total = await countIssues(view, where, lean, inboxGlobalFps ?? [], suppressedFps ?? [], inboxTenantSuppressions ?? [])
```

- [ ] **Step 3: Run tests**

```bash
bun test src/app/api/issues/route.test.ts
```
Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/issues/route.ts
git commit -m "refactor: remove fragile suppressedFps fallback in countIssues"
```

---

## Task 9: Bulk decisions — replace per-ID queries with batch fetch + createMany

The current bulk handler fires `findUnique` per issue and per brief (up to 400 DB calls for 200 IDs). Replace with two `findMany` batch queries and one `createMany`.

**Files:**
- Modify: `src/app/api/decisions/bulk/route.ts`
- Modify: `src/app/api/decisions/bulk/route.test.ts`

- [ ] **Step 1: Rewrite bulk route handler**

Replace the `Promise.all(issueIds.map(...))` block in `src/app/api/decisions/bulk/route.ts` with:

```ts
// Batch-fetch all issues and briefs in two queries instead of 2×N
const [issues, briefs] = await Promise.all([
  db.issue.findMany({
    where: { id: { in: issueIds as string[] } },
    select: { id: true },
  }),
  db.brief.findMany({
    where: { issueId: { in: issueIds as string[] } },
    select: { id: true, issueId: true, lean: true },
  }),
]);

const issueSet = new Set(issues.map((i) => i.id));
const briefMap = new Map(briefs.map((b) => [b.issueId, b]));

const validIds = (issueIds as string[]).filter((id) => issueSet.has(id));

if (validIds.length > 0) {
  await db.decision.createMany({
    data: validIds.map((issueId) => {
      const brief = briefMap.get(issueId) ?? null;
      return {
        issueId,
        briefId: brief?.id ?? null,
        decision,
        aiLean: brief?.lean ?? null,
        responderId,
      };
    }),
  });
}

const succeeded = validIds.length;
const failed = (issueIds as string[]).length - succeeded;
```

Remove the old `const results = await Promise.all(...)` block and `const succeeded = results.filter(Boolean).length` lines.

- [ ] **Step 2: Update the test mocks**

The test currently mocks `issue.findUnique`, `brief.findUnique`, and `decision.create`. These no longer exist in the new code path. Update `src/app/api/decisions/bulk/route.test.ts`:

```ts
import { describe, test, expect, mock, beforeEach } from "bun:test";

const mockIssueFindMany = mock(() => Promise.resolve([] as { id: string }[]));
const mockBriefFindMany = mock(() =>
  Promise.resolve([] as { id: string; issueId: string; lean: string }[])
);
const mockDecisionCreateMany = mock(() => Promise.resolve({ count: 0 }));

mock.module("@/lib/db", () => ({
  db: {
    issue: { findMany: mockIssueFindMany },
    brief: { findMany: mockBriefFindMany },
    decision: { createMany: mockDecisionCreateMany },
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
    mockIssueFindMany.mockReset();
    mockBriefFindMany.mockReset();
    mockDecisionCreateMany.mockReset();
    mockIssueFindMany.mockResolvedValue([{ id: "i1" }]);
    mockBriefFindMany.mockResolvedValue([{ id: "b1", issueId: "i1", lean: "close" }]);
    mockDecisionCreateMany.mockResolvedValue({ count: 1 });
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

  test("creates decisions for all found issueIds", async () => {
    mockIssueFindMany.mockResolvedValue([{ id: "i1" }, { id: "i2" }]);
    mockBriefFindMany.mockResolvedValue([
      { id: "b1", issueId: "i1", lean: "close" },
    ]);
    mockDecisionCreateMany.mockResolvedValue({ count: 2 });

    const res = await POST(makeRequest({ issueIds: ["i1", "i2"], decision: "close" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.succeeded).toBe(2);
    expect(body.failed).toBe(0);
    expect(mockDecisionCreateMany).toHaveBeenCalledTimes(1);
  });

  test("counts issues not found in DB as failed", async () => {
    mockIssueFindMany.mockResolvedValue([]);
    mockBriefFindMany.mockResolvedValue([]);
    const res = await POST(makeRequest({ issueIds: ["missing"], decision: "watchlist" }));
    const body = await res.json();
    expect(body.succeeded).toBe(0);
    expect(body.failed).toBe(1);
    expect(mockDecisionCreateMany).not.toHaveBeenCalled();
  });

  test("returns 500 when DB throws", async () => {
    mockIssueFindMany.mockRejectedValue(new Error("DB error"));
    const res = await POST(makeRequest({ issueIds: ["i1"], decision: "close" }));
    expect(res.status).toBe(500);
  });

  test("returns 400 when decision is jira", async () => {
    const res = await POST(makeRequest({ issueIds: ["i1"], decision: "jira" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("jira");
  });

  test("returns 400 when more than 200 issueIds", async () => {
    const ids = Array.from({ length: 201 }, (_, i) => `id-${i}`);
    const res = await POST(makeRequest({ issueIds: ids, decision: "close" }));
    expect(res.status).toBe(400);
  });

  test("returns 400 when issueIds contains non-string items", async () => {
    const res = await POST(makeRequest({ issueIds: ["valid", 42], decision: "close" }));
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 3: Run tests**

```bash
bun test src/app/api/decisions/bulk/route.test.ts
```
Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/decisions/bulk/route.ts src/app/api/decisions/bulk/route.test.ts
git commit -m "perf: bulk decisions — batch findMany + createMany replaces N×2 per-ID queries"
```

---

## Task 10: Resolve LLM config once per pipeline run

`generateBrief` fetches three DB settings on every invocation. During a pipeline run with many issues, this fires 3×N DB calls for the same values. Resolve once in `pipeline.ts` and pass the config down.

**Files:**
- Modify: `src/lib/brief.ts`
- Modify: `src/lib/pipeline.ts`
- Modify: `src/lib/pipeline.test.ts`
- Modify: `src/lib/brief.test.ts`

- [ ] **Step 1: Add LlmConfig type and optional param to generateBrief**

In `src/lib/brief.ts`, add an `LlmConfig` interface near the top (after imports) and update `generateBrief`:

```ts
export interface LlmConfig {
  baseUrl: string | null;
  apiKey: string | null;
  model: string | null;
}
```

Change the `generateBrief` signature to accept an optional config:

```ts
export async function generateBrief(issueId: string, config?: LlmConfig) {
```

Inside the function, replace the three `getEffectiveSetting` calls:

```ts
// BEFORE:
const [llmBaseUrl, llmApiKey, llmModel] = await Promise.all([
  getEffectiveSetting(SETTINGS_KEYS.llmBaseUrl, "LLM_BASE_URL"),
  getEffectiveSetting(SETTINGS_KEYS.llmApiKey, "LLM_API_KEY"),
  getEffectiveSetting(SETTINGS_KEYS.llmModel, "LLM_MODEL"),
]);
const model = llmModel ?? "gpt-4o";

// AFTER:
let resolved = config;
if (!resolved) {
  const [llmBaseUrl, llmApiKey, llmModel] = await Promise.all([
    getEffectiveSetting(SETTINGS_KEYS.llmBaseUrl, "LLM_BASE_URL"),
    getEffectiveSetting(SETTINGS_KEYS.llmApiKey, "LLM_API_KEY"),
    getEffectiveSetting(SETTINGS_KEYS.llmModel, "LLM_MODEL"),
  ]);
  resolved = { baseUrl: llmBaseUrl, apiKey: llmApiKey, model: llmModel };
}
const { baseUrl: llmBaseUrl, apiKey: llmApiKey, model: llmModel } = resolved;
const model = llmModel ?? "gpt-4o";
```

- [ ] **Step 2: Add resolveLlmConfig to pipeline.ts and thread it through briefIssues**

In `src/lib/pipeline.ts`:

Add import at top:
```ts
import { generateBrief, LlmConfig } from "@/lib/brief";
```
(Replace the existing `import { generateBrief }` line.)

Add `resolveLlmConfig` function after `getSentryConfig`:
```ts
async function resolveLlmConfig(): Promise<LlmConfig> {
  const [baseUrl, apiKey, model] = await Promise.all([
    getEffectiveSetting(SETTINGS_KEYS.llmBaseUrl, "LLM_BASE_URL"),
    getEffectiveSetting(SETTINGS_KEYS.llmApiKey, "LLM_API_KEY"),
    getEffectiveSetting(SETTINGS_KEYS.llmModel, "LLM_MODEL"),
  ]);
  return { baseUrl, apiKey, model };
}
```

Update `briefIssues` to accept and forward the config:
```ts
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
```

Update `runPipeline` to resolve config once and pass it:
```ts
export async function runPipeline(opts: { background?: boolean } = {}): Promise<PipelineStats> {
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

    if (opts.background) {
      void briefIssues(newIssueIds, stats, llmConfig)
        .then(() => writeMeta({ lastPullStats: { ...stats, durationMs: Date.now() - startTime } }))
        .catch((err) => console.error("[pipeline] Background brief error:", err))
        .finally(release);
      return { ...stats, durationMs: Date.now() - startTime };
    }

    await briefIssues(newIssueIds, stats, llmConfig);
    const durationMs = Date.now() - startTime;
    writeMeta({ lastPullStats: { ...stats, durationMs } });
    release();
    return { ...stats, durationMs };
  } catch (err) {
    release();
    throw err;
  }
}
```

- [ ] **Step 3: Update pipeline.test.ts mock for generateBrief**

The existing mock in `src/lib/pipeline.test.ts` mocks `generateBrief` as `mock(async (_id: string) => undefined)`. Update to accept two args:

```ts
const mockGenerateBrief = mock(async (_id: string, _config?: unknown) => undefined);
```

- [ ] **Step 4: Run tests**

```bash
bun test src/lib/pipeline.test.ts src/lib/brief.test.ts
```
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/brief.ts src/lib/pipeline.ts src/lib/pipeline.test.ts
git commit -m "perf: resolve LLM config once per pipeline run instead of per brief"
```

---

## Task 11: Eliminate redundant brief-existence check after upsert

After `db.issue.upsert`, the code immediately fires `db.brief.findUnique` to check whether a brief already exists. Adding `include: { brief: { select: { id: true } } }` to the upsert removes that second round-trip.

**Files:**
- Modify: `src/lib/pipeline.ts`
- Modify: `src/lib/pipeline.test.ts`

- [ ] **Step 1: Add include to the upsert call**

In `src/lib/pipeline.ts`, update the `db.issue.upsert` call inside `ingestIssues`:

```ts
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
  include: { brief: { select: { id: true } } },
});
```

- [ ] **Step 2: Remove the separate findUnique and use the included brief**

Replace the lines immediately after the upsert:

```ts
// BEFORE:
stats.ingested++;

const hasBrief = await db.brief.findUnique({
  where: { issueId: issue.id },
  select: { id: true },
});
if (!hasBrief) newIssueIds.push(issue.id);
else stats.skipped++;

// AFTER:
stats.ingested++;

if (!issue.brief) newIssueIds.push(issue.id);
else stats.skipped++;
```

- [ ] **Step 3: Update pipeline.test.ts mock**

The existing mock for `issue.upsert` returns `{ id: "issue-1", sentryIssueId: ... }`. Now the route reads `issue.brief`, so the mock must include it. Update the `mockIssueUpsert` mock in `src/lib/pipeline.test.ts`:

```ts
const mockIssueUpsert = mock(async (args: { create: { sentryIssueId: string } }) => ({
  id: "issue-1",
  sentryIssueId: args.create.sentryIssueId,
  brief: null,
}));
```

Also update any tests that expect the `mockBriefFindUnique` to be called — those assertions are no longer valid. Remove or replace them with checks on `newIssueIds` behaviour instead.

- [ ] **Step 4: Remove mockBriefFindUnique from pipeline.test.ts mock setup**

Since `brief.findUnique` is no longer called from `ingestIssues`, update the `mock.module("@/lib/db", ...)` call to remove `brief: { findUnique: mockBriefFindUnique }` from the `db` mock object. Also remove the `const mockBriefFindUnique = mock(...)` line. (The brief module itself still has its own tests; this is only the pipeline test.)

- [ ] **Step 5: Run tests**

```bash
bun test src/lib/pipeline.test.ts
```
Expected: all tests pass.

- [ ] **Step 6: Run full test suite**

```bash
bun test
```
Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/pipeline.ts src/lib/pipeline.test.ts
git commit -m "perf: use include on upsert to eliminate redundant brief findUnique per ingested issue"
```

---

## Self-Review

**Spec coverage check:**
- D1 (admin-guard.ts) → Task 1 ✓
- D2 (stopPoller) → Task 1 ✓
- D3/D4 (getSettings, SettingsKey) → Task 1 ✓
- D5 (jiraId) → Task 2 ✓
- D6 (responderId GET) → Task 3 ✓
- D7 (CONF_COLOR alias) → Task 4 ✓
- S1 (PipelineStats dedup) → Task 5 ✓
- S2 (Issue type location) → Task 6 ✓
- S4 (settings GET env-var) → Task 7 ✓
- S5 (countIssues fragility) → Task 8 ✓
- P1 (bulk N+1) → Task 9 ✓
- P2 (settings per-brief) → Task 10 ✓
- P3 (brief findUnique after upsert) → Task 11 ✓

**Placeholder scan:** No TBDs, no "implement later", no "similar to Task N" shortcuts. Each code step shows the full before/after.

**Type consistency:** `LlmConfig` is defined in Task 10 Step 1 (`brief.ts`) and imported in Task 10 Step 2 (`pipeline.ts`). `PipelineStats` is defined in `pipeline.ts` and imported by `meta.ts` in Task 5. `Issue` is defined in `lib/types.ts` in Task 6 Step 1 and imported in Steps 2 and 3.
