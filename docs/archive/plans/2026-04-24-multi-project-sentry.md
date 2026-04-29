# Multi-Project Sentry Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow configuring multiple Sentry projects in Settings and add a project/time-range dropdown to the cockpit's issue list.

**Architecture:** A new `SentryProject` DB model holds per-project slugs; `getSentryConfig()` in `pipeline.ts` returns `projects: string[]` and falls back to the legacy `sentry.project` setting / `SENTRY_PROJECT` env var when the table is empty; the pipeline iterates all projects sequentially; `GET /api/issues` gains `project` and `since=24h` query params enforced in-DB for accurate pagination; the Zustand store grows `project` and `since24h` filter fields; `settings-view.tsx` gains an inline project manager; `issue-list.tsx` gains a dropdown. No schema change beyond adding `SentryProject`.

**Tech Stack:** Next.js 16 App Router, Prisma/SQLite (`bun run db:push` for migrations), TanStack Query, Zustand, Bun test runner.

---

## File Structure

**Create:**
- `src/app/api/sentry-projects/route.ts` — `GET` list + `POST` add
- `src/app/api/sentry-projects/[id]/route.ts` — `DELETE` by id
- `src/app/api/sentry-projects/route.test.ts` — unit tests for CRUD

**Modify:**
- `prisma/schema.prisma` — add `SentryProject` model
- `src/lib/pipeline.ts` — `getSentryConfig()` → `projects: string[]`; `ingestIssues()` loops projects
- `src/app/api/settings/test/route.ts` — use `getSentryConfig()` instead of individual settings
- `src/lib/pipeline.test.ts` — update mocks and expectations for new signatures
- `src/app/api/issues/route.ts` — add `project` + `since=24h` to `where` clause
- `src/app/api/issues/route.test.ts` — add tests for new params
- `src/app/api/metrics/route.ts` — `sentryConfigured` checks `SentryProject` count
- `src/app/api/metrics/route.test.ts` — add `db.sentryProject.count` mock
- `src/lib/store.ts` — add `project: string | null` + `since24h: boolean` to `Filters`
- `src/components/cockpit/settings-view.tsx` — replace single project input with `SentryProjectsManager`
- `src/components/cockpit/issue-list.tsx` — add project/since24h dropdown, extend query key

---

## Task 1: Schema — add SentryProject model

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add the model to `prisma/schema.prisma`**

Append before the closing of the file (after the `Suppression` model):

```prisma
model SentryProject {
  id        String   @id @default(cuid())
  slug      String   @unique
  label     String   @default("")
  createdAt DateTime @default(now())
}
```

- [ ] **Step 2: Push schema to the dev database**

The `DATABASE_URL` env var uses a Windows path that Prisma misreads from WSL2. Use the Linux equivalent:

```bash
DATABASE_URL="file:/mnt/c/Projects/STI/db/custom.db" bunx prisma db push --skip-generate
```

Expected output: `🚀 Your database is now in sync with your Prisma schema. Done in ...ms`

- [ ] **Step 3: Regenerate the Prisma client**

```bash
cd /mnt/c/Projects/STI && bun run db:generate
```

Expected: `Generated Prisma Client` (the Windows DLL will be locked while the dev server runs — that's fine, Bun uses the JS client).

- [ ] **Step 4: Run tests to confirm no regressions**

```bash
bun test 2>&1 | tail -5
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat: add SentryProject model to schema"
```

---

## Task 2: SentryProject CRUD API

**Files:**
- Create: `src/app/api/sentry-projects/route.ts`
- Create: `src/app/api/sentry-projects/[id]/route.ts`
- Create: `src/app/api/sentry-projects/route.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/app/api/sentry-projects/route.test.ts`:

```typescript
import { describe, test, expect, mock, beforeEach } from "bun:test";

const mockFindMany = mock(() => Promise.resolve([]));
const mockCreate = mock(() =>
  Promise.resolve({ id: "p1", slug: "my-project", label: "" })
);
const mockFindUnique = mock(() => Promise.resolve(null));
const mockDelete = mock(() => Promise.resolve({ id: "p1" }));

mock.module("@/lib/db", () => ({
  db: {
    sentryProject: {
      findMany: mockFindMany,
      create: mockCreate,
      findUnique: mockFindUnique,
      delete: mockDelete,
    },
  },
}));

const { GET, POST } = await import("./route");
const { DELETE } = await import("./[id]/route");

function makeRequest(method: string, body?: unknown) {
  return new Request("http://localhost/api/sentry-projects", {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  }) as import("next/server").NextRequest;
}

function makeDeleteRequest(id: string) {
  return {
    request: new Request(`http://localhost/api/sentry-projects/${id}`, { method: "DELETE" }) as import("next/server").NextRequest,
    params: Promise.resolve({ id }),
  };
}

describe("GET /api/sentry-projects", () => {
  beforeEach(() => mockFindMany.mockReset());

  test("returns empty array when no projects configured", async () => {
    mockFindMany.mockResolvedValue([]);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });

  test("returns list of projects ordered by createdAt", async () => {
    mockFindMany.mockResolvedValue([
      { id: "p1", slug: "proj-a", label: "" },
      { id: "p2", slug: "proj-b", label: "My B" },
    ]);
    const res = await GET();
    const body = await res.json();
    expect(body).toHaveLength(2);
    expect(body[0].slug).toBe("proj-a");
  });
});

describe("POST /api/sentry-projects", () => {
  beforeEach(() => mockCreate.mockReset());

  test("returns 400 when slug is missing", async () => {
    const res = await POST(makeRequest("POST", {}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("slug");
  });

  test("returns 400 when slug is empty string", async () => {
    const res = await POST(makeRequest("POST", { slug: "   " }));
    expect(res.status).toBe(400);
  });

  test("returns 201 with created project on success", async () => {
    mockCreate.mockResolvedValue({ id: "p1", slug: "my-project", label: "" });
    const res = await POST(makeRequest("POST", { slug: "my-project" }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.slug).toBe("my-project");
  });

  test("returns 409 when slug already exists", async () => {
    mockCreate.mockRejectedValue(Object.assign(new Error("Unique"), { code: "P2002" }));
    const res = await POST(makeRequest("POST", { slug: "duplicate" }));
    expect(res.status).toBe(409);
  });
});

describe("DELETE /api/sentry-projects/[id]", () => {
  beforeEach(() => {
    mockFindUnique.mockReset();
    mockDelete.mockReset();
  });

  test("returns 404 when project not found", async () => {
    mockFindUnique.mockResolvedValue(null);
    const { request, params } = makeDeleteRequest("missing-id");
    const res = await DELETE(request, { params });
    expect(res.status).toBe(404);
  });

  test("deletes and returns ok:true on success", async () => {
    mockFindUnique.mockResolvedValue({ id: "p1", slug: "my-project" });
    mockDelete.mockResolvedValue({ id: "p1" });
    const { request, params } = makeDeleteRequest("p1");
    const res = await DELETE(request, { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
bun test src/app/api/sentry-projects 2>&1 | tail -10
```

Expected: errors about missing modules.

- [ ] **Step 3: Implement `src/app/api/sentry-projects/route.ts`**

```typescript
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const projects = await db.sentryProject.findMany({
    select: { id: true, slug: true, label: true },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(projects);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const slug = typeof body.slug === "string" ? body.slug.trim() : "";
  if (!slug) {
    return NextResponse.json({ error: "slug is required" }, { status: 400 });
  }
  const label = typeof body.label === "string" ? body.label.trim() : "";
  try {
    const project = await db.sentryProject.create({ data: { slug, label } });
    return NextResponse.json(project, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Project already exists" }, { status: 409 });
  }
}
```

- [ ] **Step 4: Implement `src/app/api/sentry-projects/[id]/route.ts`**

```typescript
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const project = await db.sentryProject.findUnique({ where: { id } });
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await db.sentryProject.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
bun test src/app/api/sentry-projects 2>&1 | tail -5
```

Expected: 7 pass, 0 fail.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/sentry-projects/
git commit -m "feat: add SentryProject CRUD API (GET/POST/DELETE)"
```

---

## Task 3: Pipeline — multi-project support

**Files:**
- Modify: `src/lib/pipeline.ts`
- Modify: `src/app/api/settings/test/route.ts`
- Modify: `src/lib/pipeline.test.ts`

- [ ] **Step 1: Update `src/lib/pipeline.ts`**

Replace the entire file content:

```typescript
import { db } from "@/lib/db";
import {
  fetchSentryIssues,
  fetchLatestEvent,
  extractStacktrace,
  extractEnvironment,
  extractRelease,
} from "@/lib/sentry";
import { scrub } from "@/lib/scrubber";
import { generateBrief } from "@/lib/brief";
import { readMeta, writeMeta } from "@/lib/meta";
import { getEffectiveSetting, SETTINGS_KEYS } from "@/lib/settings";

const COLD_START_HOURS = 24;
const BRIEF_CONCURRENCY = 3;
const EVENT_CONCURRENCY = 5;

export interface PipelineStats {
  ingested: number;
  briefed: number;
  skipped: number;
  suppressed: number;
  errors: number;
  durationMs?: number;
}

export async function getSentryConfig() {
  const [token, org] = await Promise.all([
    getEffectiveSetting(SETTINGS_KEYS.sentryToken, "SENTRY_TOKEN"),
    getEffectiveSetting(SETTINGS_KEYS.sentryOrg, "SENTRY_ORG"),
  ]);
  if (!token || !org) return null;

  const dbProjects = await db.sentryProject.findMany({
    select: { slug: true },
    orderBy: { createdAt: "asc" },
  });

  const projects =
    dbProjects.length > 0
      ? dbProjects.map((p) => p.slug)
      : (
          await Promise.all([
            getEffectiveSetting(SETTINGS_KEYS.sentryProject, "SENTRY_PROJECT"),
          ])
        ).filter(Boolean) as string[];

  return projects.length > 0 ? { token, org, projects } : null;
}

export async function ingestIssues(opts: {
  token: string;
  org: string;
  projects: string[];
}): Promise<{ stats: PipelineStats; newIssueIds: string[] }> {
  const stats: PipelineStats = { ingested: 0, briefed: 0, skipped: 0, suppressed: 0, errors: 0 };

  const meta = readMeta();
  const since = meta.lastPullAt
    ? new Date(meta.lastPullAt)
    : new Date(Date.now() - COLD_START_HOURS * 3_600_000);

  const suppressions = await db.suppression.findMany({ select: { fingerprint: true } });
  const suppressedFps = new Set(suppressions.map((s) => s.fingerprint));
  const newIssueIds: string[] = [];

  for (const project of opts.projects) {
    const sentryIssues = await fetchSentryIssues(since, { token: opts.token, org: opts.org, project });

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
  }

  return { stats, newIssueIds };
}

export async function briefIssues(ids: string[], stats: PipelineStats): Promise<void> {
  for (let i = 0; i < ids.length; i += BRIEF_CONCURRENCY) {
    const batch = ids.slice(i, i + BRIEF_CONCURRENCY);
    await Promise.all(
      batch.map(async (id) => {
        try {
          await generateBrief(id);
          stats.briefed++;
        } catch (err) {
          console.error(`[pipeline] Brief failed for ${id}:`, err);
          stats.errors++;
        }
      })
    );
  }
}

// ─── Mutex ────────────────────────────────────────────────────────────────────

let _pipelineRunning = false;

export function isPipelineRunning(): boolean {
  return _pipelineRunning;
}

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
    release();
    return { ...stats, durationMs };
  } catch (err) {
    release();
    throw err;
  }
}
```

- [ ] **Step 2: Update `src/app/api/settings/test/route.ts`**

Replace entire file:

```typescript
import { NextResponse } from "next/server";
import { getSentryConfig } from "@/lib/pipeline";
import { validateSentryToken } from "@/lib/sentry";

export async function POST() {
  const config = await getSentryConfig();

  if (!config) {
    return NextResponse.json(
      { ok: false, error: "Token, org, and at least one project must all be configured." },
      { status: 400 }
    );
  }

  const result = await validateSentryToken({
    token: config.token,
    org: config.org,
    project: config.projects[0],
  });
  return NextResponse.json(result);
}
```

- [ ] **Step 3: Update `src/lib/pipeline.test.ts`**

Replace entire file:

```typescript
import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test";

const mockSettingFindUnique = mock(async () => null as { key: string; value: string } | null);
const mockSuppressionFindMany = mock(async () => [] as { fingerprint: string }[]);
const mockSentryProjectFindMany = mock(async () => [] as { slug: string }[]);
const mockIssueUpsert = mock(async (args: { create: { sentryIssueId: string } }) => ({
  id: "issue-1",
  sentryIssueId: args.create.sentryIssueId,
}));
const mockBriefFindUnique = mock(async () => null);
const mockReadMeta = mock(() => ({ lastPullAt: null, lastPullStats: null }));
const mockWriteMeta = mock((_patch: unknown) => undefined);
const mockGenerateBrief = mock(async (_id: string) => undefined);

mock.module("@/lib/db", () => ({
  db: {
    setting:       { findUnique: mockSettingFindUnique },
    suppression:   { findMany: mockSuppressionFindMany },
    sentryProject: { findMany: mockSentryProjectFindMany },
    issue:         { upsert: mockIssueUpsert },
    brief:         { findUnique: mockBriefFindUnique },
  },
}));

mock.module("@/lib/meta", () => ({
  readMeta:  mockReadMeta,
  writeMeta: mockWriteMeta,
}));

mock.module("@/lib/brief", () => ({ generateBrief: mockGenerateBrief }));

const { getSentryConfig, ingestIssues, isPipelineRunning } =
  await import("@/lib/pipeline");

// ── getSentryConfig ───────────────────────────────────────────────────────────

describe("getSentryConfig", () => {
  beforeEach(() => {
    mockSettingFindUnique.mockReset();
    mockSentryProjectFindMany.mockReset();
    mockSentryProjectFindMany.mockResolvedValue([]); // empty table → falls back to sentry.project
  });

  test("returns config with projects array when all credentials are set (fallback path)", async () => {
    mockSettingFindUnique
      .mockResolvedValueOnce({ key: "sentry.token",   value: "token-abc" })
      .mockResolvedValueOnce({ key: "sentry.org",     value: "my-org" })
      .mockResolvedValueOnce({ key: "sentry.project", value: "my-project" });
    const config = await getSentryConfig();
    expect(config).toEqual({ token: "token-abc", org: "my-org", projects: ["my-project"] });
  });

  test("returns config with multiple projects from DB when table is populated", async () => {
    mockSettingFindUnique
      .mockResolvedValueOnce({ key: "sentry.token", value: "token-abc" })
      .mockResolvedValueOnce({ key: "sentry.org",   value: "my-org" });
    mockSentryProjectFindMany.mockResolvedValue([
      { slug: "proj-a" },
      { slug: "proj-b" },
    ]);
    const config = await getSentryConfig();
    expect(config).toEqual({ token: "token-abc", org: "my-org", projects: ["proj-a", "proj-b"] });
  });

  test("returns null when token is missing", async () => {
    mockSettingFindUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ key: "sentry.org", value: "my-org" });
    expect(await getSentryConfig()).toBeNull();
  });

  test("returns null when org is missing", async () => {
    mockSettingFindUnique
      .mockResolvedValueOnce({ key: "sentry.token", value: "token-abc" })
      .mockResolvedValueOnce(null);
    expect(await getSentryConfig()).toBeNull();
  });

  test("returns null when project is missing from both DB and settings", async () => {
    mockSettingFindUnique
      .mockResolvedValueOnce({ key: "sentry.token", value: "token-abc" })
      .mockResolvedValueOnce({ key: "sentry.org",   value: "my-org" })
      .mockResolvedValueOnce(null); // sentry.project fallback also missing
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

const makeSentryIssue = (id: string, fingerprints: string[]) => ({
  id,
  title: "Test error",
  culprit: "test.ts:1",
  firstSeen: new Date().toISOString(),
  lastSeen: new Date().toISOString(),
  level: "error",
  status: "unresolved",
  count: "1",
  project: { id: "p1", slug: "my-project", name: "My Project" },
  tags: [],
  fingerprints,
});

const jsonResponse = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

describe("ingestIssues — fingerprint fallback", () => {
  const opts = { token: "tok", org: "org", projects: ["proj"] };
  const _originalFetch = globalThis.fetch;

  beforeEach(() => {
    mockSuppressionFindMany.mockReset();
    mockIssueUpsert.mockReset();
    mockBriefFindUnique.mockReset();
    mockReadMeta.mockReturnValue({ lastPullAt: null, lastPullStats: null });
    mockSuppressionFindMany.mockResolvedValue([]);
    mockBriefFindUnique.mockResolvedValue(null);
    mockIssueUpsert.mockResolvedValue({ id: "issue-1", sentryIssueId: "S-1" });
  });

  afterEach(() => {
    globalThis.fetch = _originalFetch;
  });

  test("uses first fingerprint when fingerprints array is non-empty", async () => {
    const issue = makeSentryIssue("S-1", ["fp-custom-fingerprint", "fp-secondary"]);
    globalThis.fetch = mock()
      .mockImplementationOnce(() => jsonResponse([issue]))
      .mockImplementationOnce(() => jsonResponse({}));

    await ingestIssues(opts);

    const upsertCall = mockIssueUpsert.mock.calls[0][0] as { create: { fingerprint: string } };
    expect(upsertCall.create.fingerprint).toBe("fp-custom-fingerprint");
  });

  test("falls back to issue ID when fingerprints array is empty", async () => {
    const issue = makeSentryIssue("S-99", []);
    mockIssueUpsert.mockResolvedValue({ id: "issue-1", sentryIssueId: "S-99" });
    globalThis.fetch = mock()
      .mockImplementationOnce(() => jsonResponse([issue]))
      .mockImplementationOnce(() => jsonResponse({}));

    await ingestIssues(opts);

    const upsertCall = mockIssueUpsert.mock.calls[0][0] as { create: { fingerprint: string } };
    expect(upsertCall.create.fingerprint).toBe("S-99");
  });

  test("skips suppressed fingerprints and increments suppressed count", async () => {
    mockSuppressionFindMany.mockResolvedValue([{ fingerprint: "fp-suppressed" }]);
    const issue = makeSentryIssue("S-100", ["fp-suppressed"]);
    globalThis.fetch = mock()
      .mockImplementationOnce(() => jsonResponse([issue]));

    const { stats } = await ingestIssues(opts);

    expect(stats.suppressed).toBe(1);
    expect(stats.ingested).toBe(0);
    expect(mockIssueUpsert).not.toHaveBeenCalled();
  });

  test("ingests issues from multiple projects in sequence", async () => {
    const multiOpts = { token: "tok", org: "org", projects: ["proj-a", "proj-b"] };
    const issue1 = makeSentryIssue("S-1", ["fp-1"]);
    const issue2 = makeSentryIssue("S-2", ["fp-2"]);
    globalThis.fetch = mock()
      .mockImplementationOnce(() => jsonResponse([issue1]))  // fetchSentryIssues for proj-a
      .mockImplementationOnce(() => jsonResponse({}))        // fetchLatestEvent for S-1
      .mockImplementationOnce(() => jsonResponse([issue2]))  // fetchSentryIssues for proj-b
      .mockImplementationOnce(() => jsonResponse({}));       // fetchLatestEvent for S-2
    mockIssueUpsert
      .mockResolvedValueOnce({ id: "issue-1", sentryIssueId: "S-1" })
      .mockResolvedValueOnce({ id: "issue-2", sentryIssueId: "S-2" });

    const { stats } = await ingestIssues(multiOpts);

    expect(stats.ingested).toBe(2);
    expect(mockIssueUpsert).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 4: Run all tests**

```bash
bun test 2>&1 | tail -8
```

Expected: all tests pass (count increases by the new multi-project test).

- [ ] **Step 5: Commit**

```bash
git add src/lib/pipeline.ts src/app/api/settings/test/route.ts src/lib/pipeline.test.ts
git commit -m "feat: pipeline ingests multiple configured Sentry projects"
```

---

## Task 4: Issues API — project + since=24h filters

**Files:**
- Modify: `src/app/api/issues/route.ts`
- Modify: `src/app/api/issues/route.test.ts`

- [ ] **Step 1: Write failing tests for new params**

Append these two `describe` blocks to the end of `src/app/api/issues/route.test.ts`:

```typescript
// ── Project filter ─────────────────────────────────────────────────────────────

describe("GET /api/issues — project filter", () => {
  beforeEach(() => {
    mockIssueFindMany.mockReset();
    mockIssueFindMany.mockResolvedValue([]);
    mockSuppressionFindMany.mockReset();
    mockSuppressionFindMany.mockResolvedValue([]);
    mockIssueCount.mockReset();
    mockIssueCount.mockResolvedValue(0);
  });

  test("passes projectId filter to DB when project param is provided", async () => {
    await GET(makeRequest({ view: "inbox", project: "my-proj" }));
    const callArg = mockIssueFindMany.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(callArg.where.projectId).toBe("my-proj");
  });

  test("does not add projectId to where clause when project param is absent", async () => {
    await GET(makeRequest({ view: "inbox" }));
    const callArg = mockIssueFindMany.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(callArg.where.projectId).toBeUndefined();
  });
});

// ── since=24h filter ───────────────────────────────────────────────────────────

describe("GET /api/issues — since=24h filter", () => {
  beforeEach(() => {
    mockIssueFindMany.mockReset();
    mockIssueFindMany.mockResolvedValue([]);
    mockSuppressionFindMany.mockReset();
    mockSuppressionFindMany.mockResolvedValue([]);
    mockIssueCount.mockReset();
    mockIssueCount.mockResolvedValue(0);
  });

  test("adds lastSeen gte filter when since=24h", async () => {
    const before = Date.now();
    await GET(makeRequest({ view: "inbox", since: "24h" }));
    const after = Date.now();

    const callArg = mockIssueFindMany.mock.calls[0][0] as {
      where: { lastSeen?: { gte: Date } };
    };
    expect(callArg.where.lastSeen).toBeDefined();
    const cutoff = callArg.where.lastSeen!.gte.getTime();
    expect(cutoff).toBeGreaterThanOrEqual(before - 86_400_000);
    expect(cutoff).toBeLessThanOrEqual(after - 86_400_000 + 100);
  });

  test("does not add lastSeen filter when since param is absent", async () => {
    await GET(makeRequest({ view: "inbox" }));
    const callArg = mockIssueFindMany.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(callArg.where.lastSeen).toBeUndefined();
  });

  test("ignores unrecognised since values", async () => {
    await GET(makeRequest({ view: "inbox", since: "7d" }));
    const callArg = mockIssueFindMany.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(callArg.where.lastSeen).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the new tests to confirm they fail**

```bash
bun test src/app/api/issues/route.test.ts 2>&1 | tail -10
```

Expected: the 5 new tests fail.

- [ ] **Step 3: Add project + since filters to `src/app/api/issues/route.ts`**

In the `GET` function, right after the `level` filter block (after `if (level) { where.level = level }`), add:

```typescript
    const projectParam = searchParams.get('project')
    const sinceParam = searchParams.get('since')

    if (projectParam) where.projectId = projectParam
    if (sinceParam === '24h') where.lastSeen = { gte: new Date(Date.now() - 86_400_000) }
```

No other changes needed — `where` is already forwarded to `countIssues`, so both filters apply to the count automatically.

- [ ] **Step 4: Run all tests**

```bash
bun test 2>&1 | tail -5
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/issues/route.ts src/app/api/issues/route.test.ts
git commit -m "feat: add project and since=24h filter params to GET /api/issues"
```

---

## Task 5: Metrics API — sentryConfigured checks SentryProject table

**Files:**
- Modify: `src/app/api/metrics/route.ts`
- Modify: `src/app/api/metrics/route.test.ts`

- [ ] **Step 1: Update `src/app/api/metrics/route.test.ts`**

Add `mockSentryProjectCount` to the mock setup. Replace the `mock.module("@/lib/db", ...)` block and `SETTINGS_KEYS` constant at the top of the file:

```typescript
import { describe, test, expect, mock, beforeEach } from "bun:test";

const mockIssueCount = mock(() => Promise.resolve(0));
const mockDecisionCount = mock(() => Promise.resolve(0));
const mockDecisionFindMany = mock(() => Promise.resolve([]));
const mockBriefCount = mock(() => Promise.resolve(0));
const mockSentryProjectCount = mock(() => Promise.resolve(0));

mock.module("@/lib/db", () => ({
  db: {
    issue: { count: mockIssueCount },
    decision: { count: mockDecisionCount, findMany: mockDecisionFindMany },
    brief: { count: mockBriefCount },
    sentryProject: { count: mockSentryProjectCount },
  },
}));

const mockReadMeta = mock(() => ({ lastPullAt: null, lastPullStats: null }));
mock.module("@/lib/meta", () => ({ readMeta: mockReadMeta }));

const mockGetEffectiveSetting = mock(() => Promise.resolve(null));
mock.module("@/lib/settings", () => ({
  getEffectiveSetting: mockGetEffectiveSetting,
  SETTINGS_KEYS: {
    sentryToken: "sentry.token",
    sentryOrg: "sentry.org",
    sentryProject: "sentry.project",
    llmModel: "llm.model",
  },
}));

const { GET } = await import("./route");
```

Then add a `mockSentryProjectCount.mockReset()` + `mockSentryProjectCount.mockResolvedValue(0)` to every `beforeEach` block that resets the other mocks (there are three `describe` blocks — add the reset to each).

Also update the `sentryConfigured` tests at the bottom to reflect the new logic (DB projects OR legacy setting):

Replace the `describe("GET /api/metrics — sentryConfigured field ...")` block:

```typescript
describe("GET /api/metrics — sentryConfigured field (TASK-4.1)", () => {
  beforeEach(() => {
    mockIssueCount.mockResolvedValue(0);
    mockDecisionCount.mockResolvedValue(0);
    mockDecisionFindMany.mockResolvedValue([]);
    mockBriefCount.mockResolvedValue(0);
    mockReadMeta.mockReturnValue({ lastPullAt: null, lastPullStats: null });
    mockGetEffectiveSetting.mockReset();
    mockGetEffectiveSetting.mockResolvedValue(null);
    mockSentryProjectCount.mockReset();
    mockSentryProjectCount.mockResolvedValue(0);
  });

  test("includes sentryConfigured in response", async () => {
    const res = await GET();
    const body = await res.json();
    expect("sentryConfigured" in body).toBe(true);
  });

  test("sentryConfigured is true when token, org and legacy project setting are set", async () => {
    mockGetEffectiveSetting.mockImplementation((key: string) => {
      if (["sentry.token", "sentry.org", "sentry.project"].includes(key))
        return Promise.resolve("value");
      return Promise.resolve(null);
    });

    const res = await GET();
    const body = await res.json();
    expect(body.sentryConfigured).toBe(true);
  });

  test("sentryConfigured is true when token, org are set and SentryProject table has rows", async () => {
    mockGetEffectiveSetting.mockImplementation((key: string) => {
      if (["sentry.token", "sentry.org"].includes(key)) return Promise.resolve("value");
      return Promise.resolve(null);
    });
    mockSentryProjectCount.mockResolvedValue(2);

    const res = await GET();
    const body = await res.json();
    expect(body.sentryConfigured).toBe(true);
  });

  test("sentryConfigured is false when token is missing", async () => {
    mockGetEffectiveSetting.mockResolvedValue(null);
    mockSentryProjectCount.mockResolvedValue(3);

    const res = await GET();
    const body = await res.json();
    expect(body.sentryConfigured).toBe(false);
  });

  test("sentryConfigured is false when no projects configured anywhere", async () => {
    mockGetEffectiveSetting.mockImplementation((key: string) => {
      if (key === "sentry.token") return Promise.resolve("tok");
      if (key === "sentry.org") return Promise.resolve("my-org");
      return Promise.resolve(null);
    });
    mockSentryProjectCount.mockResolvedValue(0);

    const res = await GET();
    const body = await res.json();
    expect(body.sentryConfigured).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to confirm new tests fail**

```bash
bun test src/app/api/metrics/route.test.ts 2>&1 | tail -10
```

Expected: the 2 new sentryConfigured tests fail.

- [ ] **Step 3: Update `src/app/api/metrics/route.ts`**

Replace lines 51–57 (the `Promise.all` and `sentryConfigured` line):

```typescript
    const [sentryToken, sentryOrg, sentryProjectLegacy, llmModel, sentryProjectCount] = await Promise.all([
      getEffectiveSetting(SETTINGS_KEYS.sentryToken, "SENTRY_TOKEN"),
      getEffectiveSetting(SETTINGS_KEYS.sentryOrg, "SENTRY_ORG"),
      getEffectiveSetting(SETTINGS_KEYS.sentryProject, "SENTRY_PROJECT"),
      getEffectiveSetting(SETTINGS_KEYS.llmModel, "LLM_MODEL"),
      db.sentryProject.count(),
    ])

    return NextResponse.json({
      queueSize,
      handledToday,
      disagreementRate,
      lastPull: lastPullAt ?? null,
      briefsGenerated,
      totalDecisions,
      llmModel: llmModel ?? null,
      sentryConfigured: !!(sentryToken && sentryOrg && (sentryProjectCount > 0 || sentryProjectLegacy)),
    })
```

Also add `import { db } from '@/lib/db'` at the top if not already present (check line 1).

- [ ] **Step 4: Run all tests**

```bash
bun test 2>&1 | tail -5
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/metrics/route.ts src/app/api/metrics/route.test.ts
git commit -m "feat: sentryConfigured checks SentryProject table in addition to legacy setting"
```

---

## Task 6: Store — add project + since24h to Filters

**Files:**
- Modify: `src/lib/store.ts`

- [ ] **Step 1: Update `src/lib/store.ts`**

Replace the entire file:

```typescript
"use client";

import { create } from "zustand";

export type ViewType = "inbox" | "watchlist" | "decisions" | "suppressed" | "settings" | "help";

interface Filters {
  lean: string | null;
  search: string;
  level: string | null;
  project: string | null;
  since24h: boolean;
}

interface CockpitState {
  currentView: ViewType;
  selectedIssueId: string | null;
  filters: Filters;
  jiraModalOpen: boolean;
  jiraModalIssueId: string | null;
  suppressModalOpen: boolean;
  suppressModalIssueId: string | null;
  focusedIndex: number;
  keyboardHintsOpen: boolean;

  // Actions
  setCurrentView: (view: ViewType) => void;
  selectIssue: (id: string | null) => void;
  setFilters: (filters: Partial<Filters>) => void;
  resetFilters: () => void;
  openJiraModal: (issueId: string) => void;
  closeJiraModal: () => void;
  openSuppressModal: (issueId: string) => void;
  closeSuppressModal: () => void;
  setFocusedIndex: (index: number) => void;
  setKeyboardHintsOpen: (open: boolean) => void;
}

const initialFilters: Filters = {
  lean: null,
  search: "",
  level: null,
  project: null,
  since24h: false,
};

export const useCockpitStore = create<CockpitState>((set) => ({
  currentView: "inbox",
  selectedIssueId: null,
  filters: { ...initialFilters },
  jiraModalOpen: false,
  jiraModalIssueId: null,
  suppressModalOpen: false,
  suppressModalIssueId: null,
  focusedIndex: 0,
  keyboardHintsOpen: false,

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

  selectIssue: (id) =>
    set({ selectedIssueId: id }),

  setFilters: (partial) =>
    set((state) => ({
      filters: { ...state.filters, ...partial },
      focusedIndex: 0,
    })),

  resetFilters: () =>
    set({ filters: { ...initialFilters }, focusedIndex: 0 }),

  openJiraModal: (issueId) =>
    set({ jiraModalOpen: true, jiraModalIssueId: issueId }),

  closeJiraModal: () =>
    set({ jiraModalOpen: false, jiraModalIssueId: null }),

  openSuppressModal: (issueId) =>
    set({ suppressModalOpen: true, suppressModalIssueId: issueId }),

  closeSuppressModal: () =>
    set({ suppressModalOpen: false, suppressModalIssueId: null }),

  setFocusedIndex: (index) => set({ focusedIndex: index }),

  setKeyboardHintsOpen: (open) => set({ keyboardHintsOpen: open }),
}));
```

- [ ] **Step 2: Run tests**

```bash
bun test 2>&1 | tail -5
```

Expected: all tests pass (store has no unit tests — this confirms no import-time regressions).

- [ ] **Step 3: Commit**

```bash
git add src/lib/store.ts
git commit -m "feat: add project and since24h filter fields to Zustand store"
```

---

## Task 7: Settings UI — multi-project manager

**Files:**
- Modify: `src/components/cockpit/settings-view.tsx`

- [ ] **Step 1: Replace the entire `src/components/cockpit/settings-view.tsx`**

```typescript
"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Eye, EyeOff, CheckCircle, XCircle } from "lucide-react";

interface Settings {
  sentryToken: string | null;
  sentryTokenSet: boolean;
  sentryOrg: string;
  pollIntervalMinutes: number;
  llmBaseUrl: string;
  llmApiKey: string | null;
  llmApiKeySet: boolean;
  llmModel: string;
  jiraBaseUrl: string;
  jiraEmail: string;
  jiraApiKey: string | null;
  jiraApiKeySet: boolean;
  jiraProjectKey: string;
}

interface SentryProject {
  id: string;
  slug: string;
  label: string;
}

type TestResult = { ok: true; projectName: string } | { ok: false; error: string } | null;

const MONO: React.CSSProperties = {
  fontFamily: "var(--font-jetbrains-mono, 'JetBrains Mono', 'IBM Plex Mono', monospace)",
  fontSize: "11px",
};
const MONO_SMALL: React.CSSProperties = { ...MONO, fontSize: "10px", color: "#3D4F68" };
const TOKEN_MASK = "••••••••";

function SentryProjectsManager() {
  const queryClient = useQueryClient();
  const [newSlug, setNewSlug] = useState("");
  const [addError, setAddError] = useState<string | null>(null);

  const { data: projects = [] } = useQuery<SentryProject[]>({
    queryKey: ["sentry-projects"],
    queryFn: () =>
      fetch("/api/sentry-projects").then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      }),
  });

  const addMutation = useMutation({
    mutationFn: () =>
      fetch("/api/sentry-projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: newSlug.trim() }),
      }).then((r) => {
        if (r.status === 409) throw new Error("Project already configured");
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sentry-projects"] });
      setNewSlug("");
      setAddError(null);
    },
    onError: (e: Error) => setAddError(e.message),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/sentry-projects/${id}`, { method: "DELETE" }).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sentry-projects"] }),
  });

  return (
    <div>
      <label className="sta-label">Projects</label>
      {projects.length === 0 && (
        <div style={{ ...MONO_SMALL, marginBottom: "8px" }}>
          No projects configured — add a project slug below.
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginBottom: "8px" }}>
        {projects.map((p) => (
          <div
            key={p.id}
            style={{
              display: "flex", alignItems: "center", gap: "8px",
              background: "#0B0F19", border: "1px solid #1C2333",
              borderRadius: "2px", padding: "5px 10px",
            }}
          >
            <code style={{ ...MONO, color: "#2DD4BF", flex: 1 }}>{p.slug}</code>
            <button
              className="sta-btn"
              onClick={() => removeMutation.mutate(p.id)}
              disabled={removeMutation.isPending}
              style={{ padding: "2px 8px", fontSize: "10px", color: "#F87171", borderColor: "#7A1515" }}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: "8px" }}>
        <input
          className="sta-input"
          value={newSlug}
          onChange={(e) => { setNewSlug(e.target.value); setAddError(null); }}
          onKeyDown={(e) => e.key === "Enter" && newSlug.trim() && addMutation.mutate()}
          placeholder="your-project-slug"
          style={{ flex: 1 }}
          spellCheck={false}
        />
        <button
          className="sta-btn"
          onClick={() => addMutation.mutate()}
          disabled={addMutation.isPending || !newSlug.trim()}
          style={{ flexShrink: 0 }}
        >
          {addMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : "Add"}
        </button>
      </div>
      {addError && (
        <div style={{ ...MONO_SMALL, color: "#F87171", marginTop: "5px" }}>{addError}</div>
      )}
      <div style={{ ...MONO_SMALL, marginTop: "5px" }}>
        One slug per project (e.g. <code>backend-api</code>). Test Connection uses the first project.
      </div>
    </div>
  );
}

export function SettingsView() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<Settings, Error>({
    queryKey: ["settings"],
    queryFn: () =>
      fetch("/api/settings").then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      }),
  });

  const [token, setToken] = useState("");
  const [org, setOrg] = useState("");
  const [interval, setInterval] = useState(10);
  const intervalValid = interval >= 1 && interval <= 1440;
  const [showToken, setShowToken] = useState(false);
  const [testResult, setTestResult] = useState<TestResult>(null);
  const [dirty, setDirty] = useState(false);

  const [llmBaseUrl, setLlmBaseUrl] = useState("");
  const [llmApiKey, setLlmApiKey] = useState("");
  const [llmModel, setLlmModel] = useState("gpt-4o");
  const [showLlmKey, setShowLlmKey] = useState(false);

  const [jiraBaseUrl, setJiraBaseUrl] = useState("");
  const [jiraEmail, setJiraEmail] = useState("");
  const [jiraApiKey, setJiraApiKey] = useState("");
  const [jiraProjectKey, setJiraProjectKey] = useState("");
  const [showJiraKey, setShowJiraKey] = useState(false);

  useEffect(() => {
    if (data) {
      setToken(data.sentryTokenSet ? TOKEN_MASK : "");
      setOrg(data.sentryOrg);
      setInterval(data.pollIntervalMinutes);
      setLlmBaseUrl(data.llmBaseUrl);
      setLlmApiKey(data.llmApiKeySet ? TOKEN_MASK : "");
      setLlmModel(data.llmModel);
      setJiraBaseUrl(data.jiraBaseUrl);
      setJiraEmail(data.jiraEmail);
      setJiraApiKey(data.jiraApiKeySet ? TOKEN_MASK : "");
      setJiraProjectKey(data.jiraProjectKey);
      setDirty(false);
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sentryToken: token,
          sentryOrg: org,
          pollIntervalMinutes: interval,
          llmBaseUrl,
          llmApiKey,
          llmModel,
          jiraBaseUrl,
          jiraEmail,
          jiraApiKey,
          jiraProjectKey,
        }),
      }).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      setDirty(false);
      setTestResult(null);
    },
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sentryToken: token, sentryOrg: org, llmBaseUrl, llmApiKey, llmModel, jiraBaseUrl, jiraEmail, jiraApiKey, jiraProjectKey }),
      });
      return fetch("/api/settings/test", { method: "POST" }).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      });
    },
    onSuccess: (result) => {
      setTestResult(result as TestResult);
      queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
  });

  function field(_val: string, set: (v: string) => void) {
    return (v: string) => { set(v); setDirty(true); setTestResult(null); };
  }

  if (isLoading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#3D4F68" }}>
        <Loader2 size={16} className="animate-spin" />
      </div>
    );
  }

  const sectionHeader = (label: string) => ({
    style: {
      fontFamily: "var(--font-jetbrains-mono, 'JetBrains Mono', 'IBM Plex Mono', monospace)",
      fontSize: "10px", letterSpacing: "0.12em", textTransform: "uppercase" as const,
      color: "#2DD4BF", marginBottom: "16px",
      paddingBottom: "8px", borderBottom: "1px solid #1a2030",
    },
    children: `▸ ${label}`,
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <div style={{
        padding: "14px 24px", borderBottom: "1px solid #1F2D45",
        background: "#111827", flexShrink: 0,
        ...MONO, letterSpacing: "0.12em", textTransform: "uppercase", color: "#9BAAC4",
      }}>
        Settings
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "24px" }}>
        <div style={{ maxWidth: "520px", display: "flex", flexDirection: "column", gap: "32px" }}>

          {/* Sentry Connection */}
          <section>
            <div {...sectionHeader("Sentry Connection")} />
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div>
                <label className="sta-label">Auth Token</label>
                <div style={{ display: "flex", gap: "8px" }}>
                  <input
                    className="sta-input"
                    type={showToken ? "text" : "password"}
                    value={token}
                    onChange={(e) => field(token, setToken)(e.target.value)}
                    onFocus={() => { if (token === TOKEN_MASK) setToken(""); }}
                    placeholder="sntrys_..."
                    style={{ flex: 1 }}
                    spellCheck={false}
                    autoComplete="off"
                  />
                  <button className="sta-btn" onClick={() => setShowToken((v) => !v)} style={{ flexShrink: 0, padding: "0 10px" }} title={showToken ? "Hide token" : "Show token"}>
                    {showToken ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                </div>
                <div style={MONO_SMALL}>
                  Generate at sentry.io → Settings → Auth Tokens. Needs <code>project:read</code>.
                </div>
              </div>

              <div>
                <label className="sta-label">Organisation slug</label>
                <input
                  className="sta-input"
                  value={org}
                  onChange={(e) => field(org, setOrg)(e.target.value)}
                  placeholder="your-org"
                  spellCheck={false}
                />
              </div>

              <SentryProjectsManager />

              {testResult && (
                <div style={{
                  display: "flex", alignItems: "center", gap: "8px",
                  ...MONO,
                  color: testResult.ok ? "#4ADE80" : "#F87171",
                  background: testResult.ok ? "rgba(74,222,128,0.06)" : "rgba(248,113,113,0.06)",
                  border: `1px solid ${testResult.ok ? "#2d5c24" : "#5c2528"}`,
                  borderRadius: "2px", padding: "8px 12px",
                }}>
                  {testResult.ok
                    ? <><CheckCircle size={13} /> Connected — {testResult.projectName}</>
                    : <><XCircle size={13} /> {testResult.error}</>}
                </div>
              )}

              <div>
                <button
                  className="sta-btn"
                  onClick={() => testMutation.mutate()}
                  disabled={testMutation.isPending || !org}
                >
                  {testMutation.isPending && <Loader2 size={12} className="animate-spin" />}
                  Test Connection
                </button>
              </div>
            </div>
          </section>

          {/* Pipeline */}
          <section>
            <div {...sectionHeader("Pipeline")} />
            <div>
              <label className="sta-label">Poll interval (minutes)</label>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <input
                  className="sta-input"
                  type="number" min={1} max={1440}
                  value={interval}
                  onChange={(e) => { const v = parseInt(e.target.value, 10); if (!isNaN(v)) { setInterval(v); setDirty(true); } }}
                  onBlur={() => { if (interval < 1) setInterval(1); else if (interval > 1440) setInterval(1440); }}
                  style={{ width: "100px", borderColor: intervalValid ? undefined : "#7A1515" }}
                />
                <span style={MONO_SMALL}>
                  {intervalValid && (interval < 60 ? `every ${interval}m` : `every ${(interval / 60).toFixed(interval % 60 === 0 ? 0 : 1)}h`)}
                </span>
              </div>
              {!intervalValid && <div style={{ ...MONO_SMALL, color: "#F87171", marginTop: "4px" }}>Must be between 1 and 1440 minutes</div>}
              <div style={MONO_SMALL}>The poller reads this on each cycle — no restart needed.</div>
            </div>
          </section>

          {/* AI / LLM */}
          <section>
            <div {...sectionHeader("AI / LLM Runtime")} />
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div>
                <label className="sta-label">Base URL</label>
                <input className="sta-input" value={llmBaseUrl} onChange={(e) => { setLlmBaseUrl(e.target.value); setDirty(true); }} placeholder="https://api.openai.com/v1" spellCheck={false} autoComplete="off" />
                <div style={MONO_SMALL}>OpenAI-compatible endpoint. Leave blank to use <code>.z-ai-config</code>.</div>
              </div>
              <div>
                <label className="sta-label">API Key</label>
                <div style={{ display: "flex", gap: "8px" }}>
                  <input className="sta-input" type={showLlmKey ? "text" : "password"} value={llmApiKey} onChange={(e) => { setLlmApiKey(e.target.value); setDirty(true); }} onFocus={() => { if (llmApiKey === TOKEN_MASK) setLlmApiKey(""); }} placeholder="sk-..." style={{ flex: 1 }} spellCheck={false} autoComplete="off" />
                  <button className="sta-btn" onClick={() => setShowLlmKey((v) => !v)} style={{ flexShrink: 0, padding: "0 10px" }} title={showLlmKey ? "Hide key" : "Show key"}>
                    {showLlmKey ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                </div>
              </div>
              <div>
                <label className="sta-label">Model</label>
                <input className="sta-input" value={llmModel} onChange={(e) => { setLlmModel(e.target.value); setDirty(true); }} placeholder="gpt-4o" spellCheck={false} />
                <div style={MONO_SMALL}>Any OpenAI-compatible model ID (gpt-4o, gpt-4o-mini, deepseek-chat, etc.).</div>
              </div>
            </div>
          </section>

          {/* Jira */}
          <section>
            <div {...sectionHeader("Jira")} />
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div>
                <label className="sta-label">Base URL</label>
                <input className="sta-input" value={jiraBaseUrl} onChange={(e) => { setJiraBaseUrl(e.target.value); setDirty(true); }} placeholder="https://your-org.atlassian.net" spellCheck={false} autoComplete="off" />
              </div>
              <div>
                <label className="sta-label">Atlassian email</label>
                <input className="sta-input" type="email" value={jiraEmail} onChange={(e) => { setJiraEmail(e.target.value); setDirty(true); }} placeholder="you@yourorg.com" spellCheck={false} autoComplete="off" />
                <div style={MONO_SMALL}>The email address associated with your Atlassian account.</div>
              </div>
              <div>
                <label className="sta-label">API Token</label>
                <div style={{ display: "flex", gap: "8px" }}>
                  <input className="sta-input" type={showJiraKey ? "text" : "password"} value={jiraApiKey} onChange={(e) => { setJiraApiKey(e.target.value); setDirty(true); }} onFocus={() => { if (jiraApiKey === TOKEN_MASK) setJiraApiKey(""); }} placeholder="Atlassian API token" style={{ flex: 1 }} spellCheck={false} autoComplete="off" />
                  <button className="sta-btn" onClick={() => setShowJiraKey((v) => !v)} style={{ flexShrink: 0, padding: "0 10px" }} title={showJiraKey ? "Hide token" : "Show token"}>
                    {showJiraKey ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                </div>
                <div style={MONO_SMALL}>Generate at id.atlassian.com → Security → API tokens.</div>
              </div>
              <div>
                <label className="sta-label">Project key</label>
                <input className="sta-input" value={jiraProjectKey} onChange={(e) => { setJiraProjectKey(e.target.value.toUpperCase()); setDirty(true); }} placeholder="PLATFORM" spellCheck={false} style={{ width: "160px" }} />
                <div style={MONO_SMALL}>Tickets will be created in this project (e.g. <code>PLATFORM</code>).</div>
              </div>
            </div>
          </section>

        </div>
      </div>

      <div style={{ padding: "12px 24px", borderTop: "1px solid #1F2D45", background: "#111827", display: "flex", gap: "10px", flexShrink: 0 }}>
        <button className="sta-btn primary" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !dirty || !intervalValid}>
          {saveMutation.isPending && <Loader2 size={12} className="animate-spin" />}
          Save
        </button>
        {saveMutation.isSuccess && !dirty && (
          <span style={{ ...MONO, color: "#4ADE80", alignSelf: "center" }}>Saved</span>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run tests**

```bash
bun test 2>&1 | tail -5
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/components/cockpit/settings-view.tsx
git commit -m "feat: replace single project input with multi-project manager in Settings"
```

---

## Task 8: IssueList — project/since24h dropdown

**Files:**
- Modify: `src/components/cockpit/issue-list.tsx`

- [ ] **Step 1: Add the sentry-projects query and update query key + params**

In `IssueList()`, after the existing `useQuery` for issues data, add:

```typescript
  const { data: sentryProjects = [] } = useQuery<{ id: string; slug: string }[]>({
    queryKey: ["sentry-projects"],
    queryFn: () => fetch("/api/sentry-projects").then((r) => r.json()),
    staleTime: 60_000,
  });
```

Update the destructuring at the top of `IssueList` to also pull `filters.project` and `filters.since24h`:

```typescript
  const {
    currentView,
    selectedIssueId,
    filters,
    focusedIndex,
    selectIssue,
    setFilters,
    setFocusedIndex,
  } = useCockpitStore();
```

(No change needed — `filters` already contains all fields.)

Update the `setLimit` effect to depend on the new filters:

```typescript
  useEffect(() => { setLimit(50); }, [currentView, filters.lean, filters.search, filters.level, filters.project, filters.since24h]);
```

Update the `params` and `queryKey`:

```typescript
  const params = new URLSearchParams({ view: currentView, limit: String(limit) });
  if (filters.lean) params.set("lean", filters.lean);
  if (filters.search) params.set("search", filters.search);
  if (filters.level) params.set("level", filters.level);
  if (filters.project) params.set("project", filters.project);
  if (filters.since24h) params.set("since", "24h");

  const { data, isLoading, isError } = useQuery<IssuesResponse, Error>({
    queryKey: ["issues", currentView, filters.lean, filters.search, filters.level, filters.project, filters.since24h, limit],
    queryFn: () => fetch(`/api/issues?${params.toString()}`).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
    staleTime: 10_000,
  });
```

- [ ] **Step 2: Add the dropdown in JSX**

Insert the following block between the search `<div>` and the lean filter chips `<div>` (after the closing `</div>` of the search section):

```tsx
      {/* Project / time-range filter */}
      {sentryProjects.length > 0 && (
        <div style={{ padding: "8px 14px", borderBottom: "1px solid #1F2D45", flexShrink: 0 }}>
          <select
            className="sta-select"
            value={filters.since24h ? "__24h__" : (filters.project ?? "")}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "__24h__") {
                setFilters({ project: null, since24h: true });
              } else if (v === "") {
                setFilters({ project: null, since24h: false });
              } else {
                setFilters({ project: v, since24h: false });
              }
            }}
            style={{ width: "100%" }}
          >
            <option value="">All projects</option>
            {sentryProjects.map((p) => (
              <option key={p.id} value={p.slug}>{p.slug}</option>
            ))}
            <option value="__24h__">Last 24h — all projects</option>
          </select>
        </div>
      )}
```

- [ ] **Step 3: Run tests**

```bash
bun test 2>&1 | tail -5
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/cockpit/issue-list.tsx
git commit -m "feat: add project/since24h dropdown to issue list"
```

---

## Self-Review

**Spec coverage check:**
- ✅ Multiple Sentry projects configurable in Settings → Task 2 (API) + Task 7 (UI)
- ✅ Pipeline ingests from all configured projects → Task 3
- ✅ Project dropdown on main ticket page → Task 8
- ✅ "Last 24h across all projects" filter → Task 4 (API param) + Task 8 (UI)
- ✅ Backward compat with single `sentry.project` setting → Task 3 (fallback in `getSentryConfig`)
- ✅ `sentryConfigured` updated for multi-project → Task 5

**Placeholder scan:** No TBDs, all code blocks complete.

**Type consistency:**
- `SentryProject { id, slug, label }` used consistently in Task 2, 7, 8
- `getSentryConfig()` returns `{ token, org, projects: string[] }` used in Task 3 and Task 5 (via `sentryProject.count()` directly)
- `filters.project` + `filters.since24h` added in Task 6, consumed in Task 8, applied in Task 4
