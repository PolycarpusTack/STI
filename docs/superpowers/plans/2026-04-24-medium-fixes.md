# Medium-Severity Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix six medium-severity issues across the frontend (stale cache, modal state, keyboard handling), backend (environment default, metrics query), and test suite (wrong assertions, missing coverage).

**Architecture:** Cache invalidation is extended to include `["nav-count"]` and `["decisions"]` on every decision mutation. The Zustand store's `setCurrentView` action closes open modals. The Escape key handler reads live store state before clearing selection. Modals reset their form state when closed. `extractEnvironment` returns `"unknown"` instead of `"production"` as fallback. The metrics disagrement query is capped at 1000 rows. Tests are tightened and coverage added for `getSettings` and key pipeline behaviours.

**Tech Stack:** Next.js 16 App Router, React 19, TanStack Query v5, Zustand 5, Bun test runner.

---

### Task 1: Fix query cache invalidation for nav counts and decisions log

**Files:**
- Modify: `src/components/cockpit/issue-detail.tsx`
- Modify: `src/components/cockpit/jira-modal.tsx`
- Modify: `src/components/cockpit/suppress-modal.tsx`

After a decision is made, the sidebar nav counts and the decisions log go stale because their query keys are never invalidated. The `["nav-count"]` key family and `["decisions"]` must be invalidated alongside the existing `["issues"]` and `["metrics"]` invalidations.

- [ ] **Step 1: Update `decisionMutation.onSuccess` in `issue-detail.tsx`**

Find the `onSuccess` callback in `decisionMutation` (around line 31) and replace it:

```typescript
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["issue", selectedIssueId] });
      queryClient.invalidateQueries({ queryKey: ["issues"] });
      queryClient.invalidateQueries({ queryKey: ["metrics"] });
      queryClient.invalidateQueries({ queryKey: ["decisions"] });
      queryClient.invalidateQueries({ queryKey: ["nav-count"] });
    },
```

- [ ] **Step 2: Update `submitMutation.onSuccess` in `jira-modal.tsx`**

Find the `onSuccess` callback in `submitMutation` (around line 92) and add the two extra invalidations after the existing three:

```typescript
      queryClient.invalidateQueries({ queryKey: ["issue", jiraModalIssueId] });
      queryClient.invalidateQueries({ queryKey: ["issues"] });
      queryClient.invalidateQueries({ queryKey: ["metrics"] });
      queryClient.invalidateQueries({ queryKey: ["decisions"] });
      queryClient.invalidateQueries({ queryKey: ["nav-count"] });
```

- [ ] **Step 3: Update `suppressMutation.onSuccess` in `suppress-modal.tsx`**

Find the `onSuccess` callback (around line 45) and add the nav-count invalidation:

```typescript
      queryClient.invalidateQueries({ queryKey: ["issue", suppressModalIssueId] });
      queryClient.invalidateQueries({ queryKey: ["issues"] });
      queryClient.invalidateQueries({ queryKey: ["suppressions"] });
      queryClient.invalidateQueries({ queryKey: ["metrics"] });
      queryClient.invalidateQueries({ queryKey: ["nav-count"] });
      queryClient.invalidateQueries({ queryKey: ["decisions"] });
```

- [ ] **Step 4: Commit**

```bash
git add src/components/cockpit/issue-detail.tsx src/components/cockpit/jira-modal.tsx src/components/cockpit/suppress-modal.tsx
git commit -m "fix: invalidate nav-count and decisions cache after every decision mutation"
```

---

### Task 2: Close open modals when navigating views

**Files:**
- Modify: `src/lib/store.ts`

`setCurrentView` resets `selectedIssueId` and `filters` but leaves `jiraModalOpen`/`suppressModalOpen` as `true`. If a modal is open and the user clicks a sidebar item, the modal stays visible over the new view.

- [ ] **Step 1: Update `setCurrentView` in `src/lib/store.ts`**

Replace the `setCurrentView` action:

```typescript
  setCurrentView: (view) =>
    set({
      currentView: view,
      selectedIssueId: null,
      focusedIndex: 0,
      filters: { ...initialFilters },
      jiraModalOpen: false,
      suppressModalOpen: false,
      jiraModalIssueId: null,
      suppressModalIssueId: null,
    }),
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/store.ts
git commit -m "fix: close open modals when navigating to a different view"
```

---

### Task 3: Fix Escape key clearing selection when a modal is open

**Files:**
- Modify: `src/app/page.tsx`

The global `handleKeyDown` in `CockpitContent` calls `selectIssue(null)` on `Escape` unconditionally. When a Radix Dialog modal is open, Radix also handles Escape to close it — both handlers fire, the modal closes and the selection is also lost. Fix: read live store state in the handler to skip selection clearing when a modal is open.

- [ ] **Step 1: Update `handleKeyDown` in `src/app/page.tsx`**

Find the `useEffect` with `handleKeyDown` (around line 77). Replace the Escape handling:

```typescript
      if (e.key === "?") { e.preventDefault(); setKeyboardHintsOpen(true); }
      if (e.key === "Escape") {
        const state = useCockpitStore.getState();
        if (!state.jiraModalOpen && !state.suppressModalOpen && !state.keyboardHintsOpen) {
          selectIssue(null);
        }
        setKeyboardHintsOpen(false);
      }
```

Also add the `useCockpitStore` import reference — it is already imported in the file since `useCockpitStore` is used in `CockpitContent`. The static `.getState()` method on the store does not require the hook and reads the current state without subscribing.

- [ ] **Step 2: Commit**

```bash
git add src/app/page.tsx
git commit -m "fix: don't clear issue selection on Escape when a modal is open"
```

---

### Task 4: Reset modal form state when closed without submitting

**Files:**
- Modify: `src/components/cockpit/jira-modal.tsx`
- Modify: `src/components/cockpit/suppress-modal.tsx`

Cancelling either modal leaves form fields (`summary`, `description`, `priority`, `component`, `reason`, `scope`) dirty. Re-opening the modal for a different issue shows the previous issue's draft values.

- [ ] **Step 1: Add reset effect to `jira-modal.tsx`**

Inside `JiraModal`, add a `useEffect` after the existing `useEffect` (the one that populates fields from `issue`):

```typescript
  // Reset form state whenever the modal closes.
  useEffect(() => {
    if (!jiraModalOpen) {
      setSummary("");
      setDescription("");
      setPriority("medium");
      setComponent("");
      setJiraSubmitError(null);
    }
  }, [jiraModalOpen]);
```

- [ ] **Step 2: Add reset effect to `suppress-modal.tsx`**

Inside `SuppressModal`, add a `useEffect` after the existing `useQuery`:

```typescript
  // Reset form state whenever the modal closes.
  useEffect(() => {
    if (!suppressModalOpen) {
      setReason("");
      setScope("global");
    }
  }, [suppressModalOpen]);
```

- [ ] **Step 3: Commit**

```bash
git add src/components/cockpit/jira-modal.tsx src/components/cockpit/suppress-modal.tsx
git commit -m "fix: reset modal form fields when modal is closed without submitting"
```

---

### Task 5: Fix `extractEnvironment` incorrect production fallback

**Files:**
- Modify: `src/lib/sentry.ts`

When neither `event.environment` nor issue tags carry an environment, `extractEnvironment` returns the hardcoded string `"production"`. Issues from staging or dev environments that lack the tag are stored as production issues and surface in the triage queue with the wrong context.

- [ ] **Step 1: Update `extractEnvironment` in `src/lib/sentry.ts`**

Replace the function:

```typescript
export function extractEnvironment(issue: SentryIssue, event: SentryEvent | null): string {
  if (event?.environment) return event.environment;
  return issue.tags.find((t) => t.key === "environment")?.value ?? "unknown";
}
```

- [ ] **Step 2: Update the test for this function in `src/lib/sentry.test.ts`**

Find the test that checks the fallback value and update the expected value from `"production"` to `"unknown"`. Look for a test like:

```typescript
test("falls back to ... when no environment tag", () => {
  // update expected value to "unknown"
  expect(extractEnvironment(issueWithNoEnvTag, null)).toBe("unknown");
});
```

- [ ] **Step 3: Run tests**

```bash
cd /mnt/c/Projects/STI && bun test src/lib/sentry 2>&1 | tail -20
```

Expected: all sentry tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/sentry.ts src/lib/sentry.test.ts
git commit -m "fix: extractEnvironment returns 'unknown' instead of 'production' when env tag missing"
```

---

### Task 6: Cap the metrics disagreement rate query

**Files:**
- Modify: `src/app/api/metrics/route.ts`

`db.decision.findMany({ where: { aiLean: { not: null }, decision: { not: 'watchlist' } } })` has no row limit and loads all historical decisions into memory on every dashboard load. Add a `take: 1000` to cap it — the rate over the most recent 1000 actionable decisions is representative and the response stays bounded.

- [ ] **Step 1: Update the disagreement query in `src/app/api/metrics/route.ts`**

Find the `actionable` query (around line 35) and add `orderBy` and `take`:

```typescript
    const actionable = await db.decision.findMany({
      where: { aiLean: { not: null }, decision: { not: 'watchlist' } },
      select: { decision: true, aiLean: true },
      orderBy: { createdAt: 'desc' },
      take: 1000,
    })
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/metrics/route.ts
git commit -m "fix: cap metrics disagreement query at 1000 rows to bound memory usage"
```

---

### Task 7: Fix scrubber test assertions

**Files:**
- Modify: `src/lib/scrubber.test.ts`

Two test gaps:
1. The `"redacts Authorization header value"` test asserts `toContain("[REDACTED]")` which passes even if the key name is mangled. It should assert the exact output.
2. No test covers the interaction between `JWT_RE` and `SECRET_KV_RE` when both could apply (e.g. `Authorization: Bearer eyJ...`).

- [ ] **Step 1: Tighten the Authorization test and add interaction test in `src/lib/scrubber.test.ts`**

Replace the `"redacts Authorization header value"` test with a precise assertion, and add a new interaction test:

```typescript
  test("redacts Authorization header value — preserves key name", () => {
    const result = scrub("Authorization: Bearer abc123xyz789");
    expect(result).toBe("Authorization=[REDACTED]");
    expect(result).not.toContain("abc123xyz789");
  });

  test("JWT regex fires before secret-KV regex on Authorization Bearer JWT", () => {
    const jwt =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9" +
      ".eyJzdWIiOiIxMjM0NTY3ODkwIn0" +
      ".SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
    const input = `Authorization: Bearer ${jwt}`;
    const result = scrub(input);
    expect(result).toContain("[REDACTED:jwt]");
    expect(result).not.toContain("eyJ");
  });
```

- [ ] **Step 2: Run the scrubber tests**

```bash
cd /mnt/c/Projects/STI && bun test src/lib/scrubber 2>&1 | tail -20
```

Expected: all tests pass including the two new/updated ones.

- [ ] **Step 3: Commit**

```bash
git add src/lib/scrubber.test.ts
git commit -m "test: tighten Authorization scrubber assertion; add JWT+KV interaction test"
```

---

### Task 8: Add missing `getSettings` tests

**Files:**
- Modify: `src/lib/settings.test.ts`

`getSettings` is imported in the test file but never exercised. It calls `db.setting.findMany()` and builds a key→value map — a simple but untested transformation.

- [ ] **Step 1: Add `getSettings` tests to `src/lib/settings.test.ts`**

Add a new `describe` block after the existing `getEffectiveSetting` describe block. The `mockFindMany` mock is already set up in the file:

```typescript
// ── getSettings ───────────────────────────────────────────────────────────────

describe("getSettings", () => {
  beforeEach(() => mockFindMany.mockReset());

  test("returns a key-value map of all stored settings", async () => {
    mockFindMany.mockResolvedValueOnce([
      { key: "sentry.token", value: "tok123", updatedAt: new Date() },
      { key: "sentry.org",   value: "my-org", updatedAt: new Date() },
    ]);
    const result = await getSettings();
    expect(result).toEqual({ "sentry.token": "tok123", "sentry.org": "my-org" });
  });

  test("returns an empty object when no settings are stored", async () => {
    mockFindMany.mockResolvedValueOnce([]);
    const result = await getSettings();
    expect(result).toEqual({});
  });

  test("calls findMany with no filter to return all settings", async () => {
    mockFindMany.mockResolvedValueOnce([]);
    await getSettings();
    expect(mockFindMany).toHaveBeenCalledWith();
  });
});
```

- [ ] **Step 2: Run the settings tests**

```bash
cd /mnt/c/Projects/STI && bun test src/lib/settings 2>&1 | tail -20
```

Expected: all tests pass including the three new ones.

- [ ] **Step 3: Commit**

```bash
git add src/lib/settings.test.ts
git commit -m "test: add getSettings tests for key-value map transformation"
```

---

### Task 9: Add core pipeline tests

**Files:**
- Create: `src/lib/pipeline.test.ts`

`pipeline.ts` has zero test coverage. The three most important behaviors to cover: `getSentryConfig` returns null when any credential is missing, `isPipelineRunning` reflects the mutex state, and the fingerprint fallback in `ingestIssues` (`fingerprints[0] ?? si.id`).

- [ ] **Step 1: Create `src/lib/pipeline.test.ts`**

```typescript
import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test";

// ── Mocks (must be declared before dynamic imports) ───────────────────────────

const mockGetEffectiveSetting = mock(async (_key: string) => null as string | null);
const mockFindMany = mock(async () => [] as { fingerprint: string }[]);
const mockFindUnique = mock(async () => null);
const mockUpsert = mock(async (args: { create: { sentryIssueId: string } }) => ({
  id: "issue-1",
  sentryIssueId: args.create.sentryIssueId,
}));
const mockReadMeta = mock(() => ({ lastPullAt: null, lastPullStats: null }));
const mockWriteMeta = mock((_patch: unknown) => undefined);
const mockFetchSentryIssues = mock(async () => []);
const mockFetchLatestEvent = mock(async () => null);
const mockExtractStacktrace = mock(() => null);
const mockExtractEnvironment = mock(() => "production");
const mockExtractRelease = mock(() => null);
const mockScrub = mock((s: string) => s);
const mockGenerateBrief = mock(async (_id: string) => undefined);

mock.module("@/lib/settings", () => ({
  getEffectiveSetting: mockGetEffectiveSetting,
  SETTINGS_KEYS: {
    sentryToken:   "sentry.token",
    sentryOrg:     "sentry.org",
    sentryProject: "sentry.project",
  },
}));

mock.module("@/lib/db", () => ({
  db: {
    suppression: { findMany: mockFindMany },
    issue:       { upsert: mockUpsert },
    brief:       { findUnique: mockFindUnique },
  },
}));

mock.module("@/lib/meta", () => ({
  readMeta:  mockReadMeta,
  writeMeta: mockWriteMeta,
}));

mock.module("@/lib/sentry", () => ({
  fetchSentryIssues:  mockFetchSentryIssues,
  fetchLatestEvent:   mockFetchLatestEvent,
  extractStacktrace:  mockExtractStacktrace,
  extractEnvironment: mockExtractEnvironment,
  extractRelease:     mockExtractRelease,
}));

mock.module("@/lib/scrubber", () => ({ scrub: mockScrub }));

mock.module("@/lib/brief", () => ({ generateBrief: mockGenerateBrief }));

const { getSentryConfig, ingestIssues, isPipelineRunning } =
  await import("@/lib/pipeline");

// ── getSentryConfig ───────────────────────────────────────────────────────────

describe("getSentryConfig", () => {
  beforeEach(() => mockGetEffectiveSetting.mockReset());

  test("returns config object when all three credentials are set", async () => {
    mockGetEffectiveSetting
      .mockResolvedValueOnce("token-abc")
      .mockResolvedValueOnce("my-org")
      .mockResolvedValueOnce("my-project");
    const config = await getSentryConfig();
    expect(config).toEqual({ token: "token-abc", org: "my-org", project: "my-project" });
  });

  test("returns null when token is missing", async () => {
    mockGetEffectiveSetting
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce("my-org")
      .mockResolvedValueOnce("my-project");
    expect(await getSentryConfig()).toBeNull();
  });

  test("returns null when org is missing", async () => {
    mockGetEffectiveSetting
      .mockResolvedValueOnce("token-abc")
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce("my-project");
    expect(await getSentryConfig()).toBeNull();
  });

  test("returns null when project is missing", async () => {
    mockGetEffectiveSetting
      .mockResolvedValueOnce("token-abc")
      .mockResolvedValueOnce("my-org")
      .mockResolvedValueOnce(null);
    expect(await getSentryConfig()).toBeNull();
  });
});

// ── isPipelineRunning ─────────────────────────────────────────────────────────

describe("isPipelineRunning", () => {
  test("returns false initially", () => {
    expect(isPipelineRunning()).toBe(false);
  });
});

// ── ingestIssues — fingerprint fallback ───────────────────────────────────────

describe("ingestIssues — fingerprint fallback", () => {
  const opts = { token: "tok", org: "org", project: "proj" };

  beforeEach(() => {
    mockFindMany.mockReset();
    mockFetchSentryIssues.mockReset();
    mockFetchLatestEvent.mockReset();
    mockUpsert.mockReset();
    mockFindUnique.mockReset();
    mockReadMeta.mockReturnValue({ lastPullAt: null, lastPullStats: null });
    mockFindMany.mockResolvedValue([]);
    mockFetchLatestEvent.mockResolvedValue(null);
    mockExtractEnvironment.mockReturnValue("production");
    mockExtractRelease.mockReturnValue(null);
    mockExtractStacktrace.mockReturnValue(null);
    mockFindUnique.mockResolvedValue(null);
    mockUpsert.mockResolvedValue({ id: "issue-1", sentryIssueId: "S-1" });
  });

  test("uses first fingerprint when fingerprints array is non-empty", async () => {
    mockFetchSentryIssues.mockResolvedValue([{
      id: "S-1",
      title: "Test error",
      culprit: "test.ts:1",
      firstSeen: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
      level: "error",
      status: "unresolved",
      count: "5",
      project: { id: "p1", slug: "my-project", name: "My Project" },
      tags: [],
      fingerprints: ["fp-custom-fingerprint", "fp-secondary"],
    }]);

    await ingestIssues(opts);

    const upsertCall = mockUpsert.mock.calls[0][0] as { create: { fingerprint: string } };
    expect(upsertCall.create.fingerprint).toBe("fp-custom-fingerprint");
  });

  test("falls back to issue ID when fingerprints array is empty", async () => {
    mockFetchSentryIssues.mockResolvedValue([{
      id: "S-99",
      title: "Test error",
      culprit: "test.ts:1",
      firstSeen: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
      level: "error",
      status: "unresolved",
      count: "1",
      project: { id: "p1", slug: "my-project", name: "My Project" },
      tags: [],
      fingerprints: [],
    }]);

    await ingestIssues(opts);

    const upsertCall = mockUpsert.mock.calls[0][0] as { create: { fingerprint: string } };
    expect(upsertCall.create.fingerprint).toBe("S-99");
  });

  test("skips suppressed fingerprints and increments suppressed count", async () => {
    mockFindMany.mockResolvedValue([{ fingerprint: "fp-suppressed" }]);
    mockFetchSentryIssues.mockResolvedValue([{
      id: "S-100",
      title: "Suppressed error",
      culprit: "",
      firstSeen: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
      level: "error",
      status: "unresolved",
      count: "1",
      project: { id: "p1", slug: "my-project", name: "My Project" },
      tags: [],
      fingerprints: ["fp-suppressed"],
    }]);

    const { stats } = await ingestIssues(opts);

    expect(stats.suppressed).toBe(1);
    expect(stats.ingested).toBe(0);
    expect(mockUpsert).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the pipeline tests**

```bash
cd /mnt/c/Projects/STI && bun test src/lib/pipeline 2>&1 | tail -30
```

Expected: all tests pass. If a mock import path doesn't resolve, check that the module path matches exactly (Bun resolves `@/` from `tsconfig.json` `paths`).

- [ ] **Step 3: Commit**

```bash
git add src/lib/pipeline.test.ts
git commit -m "test: add pipeline tests for getSentryConfig, isPipelineRunning, and fingerprint fallback"
```
