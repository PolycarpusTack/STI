# STA · Engineering Backlog

**Format**: EPIC → TASK → SUBTASK  
**Process**: TDD (Red → Green → Refactor) on every subtask  
**Updated**: 2026-04-23  

---

## Global Definitions

### Definition of Ready (DoR) — applies to every item before work starts

- [ ] Acceptance criteria written and unambiguous  
- [ ] No blocking external dependencies open  
- [ ] Affected files identified  
- [ ] Test scenarios listed (happy path + at least one failure path)  
- [ ] Estimate agreed (XS/S/M/L/XL)  
- [ ] Previous tech-debt review for the affected module completed  

### Definition of Done (DoD) — applies to every item before it closes

- [ ] All acceptance criteria pass  
- [ ] Tests written **before** implementation (TDD)  
- [ ] TypeScript: zero new `any`, zero new type errors (`next build` clean)  
- [ ] Code review passed by one other person (or self-review against clean-code checklist if solo)  
- [ ] No `console.log`, commented-out code, or TODO comments left behind  
- [ ] If a shortcut was taken: a Technical Debt Record (TDR) filed in `/docs/TDR/`  
- [ ] Public API change? → route contract documented in the relevant API section of this file  

---

## TDD Protocol

Every subtask follows this cycle:

1. **Red** — write a failing test that describes the desired behaviour  
2. **Green** — write the minimum code to make it pass  
3. **Refactor** — clean up without breaking the test  
4. Commit after each green; commit message references the subtask ID  

Test runner: `bun test` (Bun's built-in runner).  
Test files: co-located as `*.test.ts` next to the module under test.  
Coverage target: ≥ 80 % on `src/lib/` and `src/app/api/`.  

---

## Technical Debt Review Cycle

| Cadence | Activity |
|---------|----------|
| **Before each epic** | Read all open TDRs for modules touched by the epic. Decide which to pay down in-sprint. |
| **End of each task** | Check: did this task introduce debt? If yes, write a TDR immediately. |
| **Monthly** | Review full TDR list. Rank by *interest rate* (how much does this slow us down per week?). Schedule top 3 for next cycle. |

TDR template lives at `/docs/TDR/_template.md`.

---

## Clean Code Review Checklist

Run this before marking any task Done:

- [ ] Functions ≤ 20 lines; if longer, extract  
- [ ] No magic strings or numbers — use named constants  
- [ ] One responsibility per function and module  
- [ ] Error paths are explicit — no silent swallows  
- [ ] TypeScript types are specific — no `any`, no `object`, no `unknown` without a narrowing guard  
- [ ] No duplicate logic — if the same pattern appears twice, extract it  
- [ ] Imports ordered: external → internal → relative  

---

---

## EPIC-1 · Jira Integration

**Problem**: The Jira modal collects ticket details, the API receives them, and silently discards everything. No ticket is ever created. No Jira credentials exist anywhere in the app.

**Business value**: First Responders' primary action — "create a Jira ticket" — does nothing today. This is the most visible gap.

**Epic DoR**
- [ ] Jira project key confirmed (e.g. `PLATFORM`)  
- [ ] Atlassian base URL confirmed (e.g. `https://hive.atlassian.net`)  
- [ ] Jira API token with `create-issue` scope obtained and tested manually  
- [ ] Decision table migration designed (see EPIC-2 — must land first)  

**Epic DoD**
- [ ] Submitting the Jira modal creates a real ticket in Jira  
- [ ] Jira issue key (`ABC-123`) is stored on the Decision record  
- [ ] If Jira API fails, the decision is still saved and the error is shown in the UI  
- [ ] Credentials are configurable in Settings UI and never committed to repo  
- [ ] Integration test covers the happy path and the Jira-down path  

---

### TASK-1.1 · Jira credentials in Settings

**Estimate**: S  

**DoR**
- [ ] Jira base URL and project key confirmed  
- [ ] Settings API PUT/GET contract understood  

**DoD**
- [ ] `jira.baseUrl`, `jira.apiKey`, `jira.projectKey` stored in `Setting` table  
- [ ] Settings UI shows a "Jira" section with the three fields  
- [ ] API key masked in GET (same pattern as Sentry token)  
- [ ] Test: GET returns masked key when set; PUT with placeholder string leaves value unchanged  

#### SUBTASK-1.1.1 · Add Jira keys to `SETTINGS_KEYS` constant `[TDD]`
- File: `src/lib/settings.ts`  
- Red: test that `SETTINGS_KEYS.jiraBaseUrl` etc. exist and equal the expected string keys  
- Green: add three keys  
- Refactor: confirm no duplication with Sentry keys  

#### SUBTASK-1.1.2 · Extend GET /api/settings to return Jira fields `[TDD]`
- File: `src/app/api/settings/route.ts`  
- Red: test that GET response includes `jiraBaseUrl`, `jiraApiKey` (masked), `jiraProjectKey`  
- Green: read the three new keys and include in response  
- Refactor: extract mask helper (used for both Sentry token and Jira key) to avoid duplication  

#### SUBTASK-1.1.3 · Extend PUT /api/settings to save Jira fields `[TDD]`
- Red: test that PUT with `jiraApiKey: "••••••••"` does not overwrite the stored value  
- Green: add conditionals matching the Sentry token pattern  

#### SUBTASK-1.1.4 · Add Jira section to SettingsView `[TDD]`
- File: `src/components/cockpit/settings-view.tsx`  
- Red: render test — Jira section present with three inputs  
- Green: add section below AI/LLM, same styling as existing sections  
- Refactor: extract `MaskedInput` component (used for Sentry token, LLM key, and now Jira key) to remove duplication  

---

### TASK-1.2 · Jira API client

**Estimate**: M  

**DoR**
- [ ] TASK-1.1 done  
- [ ] Atlassian REST API v3 endpoint documented (`POST /rest/api/3/issue`)  

**DoD**
- [ ] `createJiraIssue` function returns `{ key: string }` on success  
- [ ] Throws typed error with `status` field on HTTP failure  
- [ ] Unit tests with mocked fetch cover: 201 Created, 401 Unauthorized, 403 Forbidden, network error  

#### SUBTASK-1.2.1 · Create `src/lib/jira.ts` `[TDD]`
- Red: test `createJiraIssue` returns `{ key: "ABC-1" }` when fetch resolves with 201  
- Green: implement using `getEffectiveSetting` for credentials + direct `fetch`  
- Refactor: type the Jira error response; extract `JiraError` class  

#### SUBTASK-1.2.2 · Test failure paths `[TDD]`
- Red: tests for 401 → throws `JiraError` with `status: 401`, 403, network error  
- Green: add `if (!res.ok) throw new JiraError(...)` branch  
- Refactor: ensure error messages are user-readable (shown in UI later)  

---

### TASK-1.3 · Wire Jira creation into the decisions route

**Estimate**: M  

**DoR**
- [ ] TASK-1.2 done  
- [ ] EPIC-2 TASK-2.1 done (Decision schema has `jiraKey`, `metadata` columns)  

**DoD**
- [ ] POST /api/decisions with `decision: "jira"` calls `createJiraIssue` and stores the returned key  
- [ ] If Jira call fails, decision is still persisted with `jiraKey: null` and `jiraError` set  
- [ ] Response includes `jiraKey` so the modal can show it  
- [ ] Tests: Jira succeeds, Jira fails (decision still saved)  

#### SUBTASK-1.3.1 · Call createJiraIssue in decisions route `[TDD]`
- File: `src/app/api/decisions/route.ts`  
- Red: test that posting `decision: "jira"` with metadata triggers `createJiraIssue`  
- Green: call the lib function; store returned key on Decision record  

#### SUBTASK-1.3.2 · Graceful Jira failure path `[TDD]`
- Red: test that when `createJiraIssue` throws, the decision is saved with `jiraKey: null`  
- Green: wrap in try/catch; set `jiraError` field  
- Refactor: add `jiraError` to Decision model if not present (migration)  

---

### TASK-1.4 · Surface Jira result in the UI

**Estimate**: S  

**DoR**
- [ ] TASK-1.3 done  

**DoD**
- [ ] On success: modal closes and toast shows "Jira ticket ABC-123 created"  
- [ ] On failure: modal shows inline error, stays open, user can retry  
- [ ] Issue row in inbox shows Jira key badge after decision logged  

#### SUBTASK-1.4.1 · Update JiraModal to show key or error `[TDD]`
- Red: test that mutation success with `jiraKey` shows a toast with the key  
- Green: read `jiraKey` from mutation result and pass to `toast.success`  

#### SUBTASK-1.4.2 · Show Jira key badge in issue list row `[TDD]`
- Red: test that an issue with a jira-lean decision renders a key badge  
- Green: read decision data from the issue list query and render badge  

---

---

## EPIC-2 · Decision Data Model & Audit Trail

**Problem**: The `Decision` table has no columns for Jira ticket details or suppression metadata. Data entered in the modals is silently discarded.

**Business value**: Without an audit trail, the disagreement review (the core feedback loop) has no context.

**Epic DoR**
- [ ] All fields to be added identified and agreed  
- [ ] Prisma migration plan reviewed — no destructive changes to existing rows  

**Epic DoD**
- [ ] All metadata submitted via the modals is persisted  
- [ ] Decisions view displays the stored metadata  
- [ ] Prisma migration runs cleanly against the existing DB with no data loss  
- [ ] Migration covered by a smoke test  

---

### TASK-2.1 · Extend Decision schema

**Estimate**: S  

**DoR**
- [ ] Full field list agreed: `jiraKey`, `jiraSummary`, `jiraDescription`, `jiraPriority`, `jiraComponent`, `suppressReason`, `suppressScope`, `jiraError`  

**DoD**
- [ ] Prisma schema updated with new nullable fields  
- [ ] Migration file generated and committed  
- [ ] Migration test: apply to empty DB, apply to DB with existing rows — no errors  

#### SUBTASK-2.1.1 · Add columns to Decision model `[TDD]`
- File: `prisma/schema.prisma`  
- Red: write a DB integration test that inserts a Decision with `jiraSummary` set  
- Green: add nullable String fields to the model; run `prisma migrate dev`  
- Refactor: review all Decision queries — add only fields actually queried  

---

### TASK-2.2 · Persist metadata in decisions route

**Estimate**: S  

**DoR**
- [ ] TASK-2.1 done  

**DoD**
- [ ] POST body fields `metadata.summary`, `.description`, `.priority`, `.component`, `.suppressReason`, `.suppressScope` are mapped to Decision columns  
- [ ] Unit test: posted metadata appears on the retrieved decision  

#### SUBTASK-2.2.1 · Destructure and save metadata fields `[TDD]`
- File: `src/app/api/decisions/route.ts`  
- Red: test that `decision.jiraSummary` equals the posted `metadata.summary`  
- Green: read `body.metadata` and spread into `db.decision.create`  
- Refactor: extract a `buildDecisionData(body)` helper to keep the route handler lean  

---

### TASK-2.3 · Display metadata in Decisions view

**Estimate**: S  

**DoR**
- [ ] TASK-2.2 done  

**DoD**
- [ ] Decisions view shows Jira key (linked to Jira if key present), suppress reason, and scope  
- [ ] Disagreement rows are visually distinct  

#### SUBTASK-2.3.1 · Extend decisions API response `[TDD]`
- File: `src/app/api/decisions/route.ts` (GET)  
- Red: test that GET response includes `jiraKey`, `jiraSummary`, `suppressReason`  
- Green: add new fields to the select clause  

#### SUBTASK-2.3.2 · Render new fields in DecisionsView `[TDD]`
- File: `src/components/cockpit/decisions-view.tsx`  
- Red: render test — Jira key links, suppress reason text present  
- Green: add cells/chips to the decision row  
- Refactor: extract `DecisionRow` component  

---

---

## EPIC-3 · Suppression System Completeness

**Problem (a)**: Suppressions only block new issues arriving via the pipeline. Issues already in the DB still show in the inbox after the fingerprint is suppressed.  
**Problem (b)**: The "tenant" scope option is stored but never used — suppression always matches globally.

**Epic DoR**
- [ ] Suppression matching logic documented: fingerprint exact match, global vs. tenant  
- [ ] Decision made on "tenant" scope UX (which tenant field to match against?)  

**Epic DoD**
- [ ] Suppressing a fingerprint removes matching existing issues from the inbox immediately  
- [ ] Re-opening the inbox after adding a suppression shows no issues with that fingerprint  
- [ ] Tenant-scoped suppression only hides issues whose `projectId` matches  
- [ ] All suppression behaviour covered by integration tests  

---

### TASK-3.1 · Retroactive suppression on inbox query

**Estimate**: S  

**DoR**
- [ ] Issues query location identified: `src/app/api/issues/route.ts`  

**DoD**
- [ ] `view=inbox` and `view=watchlist` queries exclude issues whose fingerprint appears in the `Suppression` table  
- [ ] Test: seed an issue + suppression with matching fingerprint; GET /api/issues returns zero results  

#### SUBTASK-3.1.1 · Add suppression exclusion to issues WHERE clause `[TDD]`
- File: `src/app/api/issues/route.ts`  
- Red: integration test — suppressed fingerprint issue absent from inbox  
- Green: add `NOT: { fingerprint: { in: suppressedFingerprints } }` to Prisma where clause (fetch fingerprints from Suppression table first)  
- Refactor: extract `getSuppressedFingerprints()` helper to `src/lib/suppressions.ts`  

#### SUBTASK-3.1.2 · Optimise — single query with subquery `[TDD]`
- Red: performance test (not strict timing — just verify it's one round-trip to the DB)  
- Green: use Prisma `where: { NOT: { suppression: { isNot: null } } }` relational filter if schema supports it, else keep two-step with caching  
- Refactor: document chosen approach in a comment if non-obvious  

---

### TASK-3.2 · Implement tenant-scoped suppression

**Estimate**: M  

**DoR**
- [ ] Tenant identifier field agreed — using `Issue.projectId` as the tenant discriminator  
- [ ] TASK-3.1 done  

**DoD**
- [ ] A suppression with `scope: "tenant"` and `tenantId` set only hides issues where `issue.projectId === suppression.tenantId`  
- [ ] A suppression with `scope: "global"` hides all issues with that fingerprint regardless of project  
- [ ] Suppress modal's "This project only" option populates `tenantId` from the current issue  
- [ ] Tests cover both scopes  

#### SUBTASK-3.2.1 · Add `tenantId` to Suppression model `[TDD]`
- File: `prisma/schema.prisma`  
- Red: insert suppression with `tenantId`; confirm it's stored and retrieved  
- Green: add nullable `tenantId String?` field; migrate  

#### SUBTASK-3.2.2 · Update suppression matching logic `[TDD]`
- File: `src/lib/suppressions.ts`  
- Red: test that a tenant-scoped suppression does NOT exclude an issue from a different project  
- Green: update `getSuppressedFingerprints(projectId?)` to filter by scope  

#### SUBTASK-3.2.3 · Pass current projectId from SuppressModal `[TDD]`
- File: `src/components/cockpit/suppress-modal.tsx`  
- Red: test that submitted body contains `tenantId` when "This project only" is selected  
- Green: read `issue.projectId` from store; include in POST body  

#### SUBTASK-3.2.4 · Handle tenantId in suppressions POST route `[TDD]`
- File: `src/app/api/suppressions/route.ts`  
- Red: test that POST body `tenantId` is saved to the Suppression record  
- Green: destructure and persist  

---

---

## EPIC-4 · Pipeline Health & Observability

**Problem**: The sidebar always shows a hardcoded green "OPERATIONAL". The status bar hardcodes the model name. There is no real health check and no visibility into pipeline errors.

**Epic DoR**
- [ ] Decision on health-check endpoint contract (what fields does it return?)  
- [ ] Decision on what "operational" means (last successful run within N minutes?)  

**Epic DoD**
- [ ] Sidebar pipeline status reflects actual last-run outcome  
- [ ] Status bar reads model name from current Settings  
- [ ] Brief parse errors are visible in the issue detail, not just a DB flag  
- [ ] A Sentry connection test also validates issue-read scope  

---

### TASK-4.1 · Real pipeline status in sidebar

**Estimate**: S  

**DoR**
- [ ] `/api/pipeline/run` GET already returns `lastPullAt` and `lastPullStats`  

**DoD**
- [ ] Sidebar queries GET /api/pipeline/run and shows: green dot if last run < 20 min ago, amber if 20–60 min, red if > 60 min or never run  
- [ ] Tooltip shows last run timestamp and stats  
- [ ] Test: component renders correct colour for each time-bucket  

#### SUBTASK-4.1.1 · Add health status derivation to pipeline GET `[TDD]`
- File: `src/app/api/pipeline/run/route.ts` (GET handler)  
- Red: test that `status: "ok"` returned when `lastPullAt` is within 20 min  
- Green: add `status: "ok" | "stale" | "unknown"` to response based on age  

#### SUBTASK-4.1.2 · Replace hardcoded status in Sidebar `[TDD]`
- File: `src/components/cockpit/sidebar.tsx`  
- Red: render test — amber indicator when status is `"stale"`  
- Green: query the pipeline GET endpoint; map status to colour/label  
- Refactor: extract `PipelineStatusDot` component  

---

### TASK-4.2 · Dynamic model name in status bar

**Estimate**: XS  

**DoR**
- [ ] Settings query already used in SettingsView  

**DoD**
- [ ] Status bar reads `llmModel` from `/api/settings`  
- [ ] Falls back to `"deepseek-chat"` if not set  
- [ ] Test: renders updated model name after settings change  

#### SUBTASK-4.2.1 · Fetch model name in StatusBar `[TDD]`
- File: `src/app/page.tsx`  
- Red: test that StatusBar renders the value returned by /api/settings  
- Green: call `useQuery(["settings"])` in StatusBar; read `llmModel`  
- Refactor: StatusBar is currently a local function — keep it local, just add the query hook  

---

### TASK-4.3 · Validate Sentry token issue-read scope

**Estimate**: S  

**DoR**
- [ ] Sentry issues endpoint known: `GET /api/0/projects/{org}/{project}/issues/`  

**DoD**
- [ ] The "Test Connection" button makes one paginated issues request (limit 1) in addition to the project fetch  
- [ ] Specific error shown if the project fetch passes but the issues fetch returns 403  
- [ ] Test covers: project OK + issues OK, project OK + issues 403  

#### SUBTASK-4.3.1 · Add issues scope check to settings/test route `[TDD]`
- File: `src/app/api/settings/test/route.ts`  
- Red: test returns `{ ok: false, error: "Token cannot read issues (project:read scope insufficient)" }` when issues endpoint returns 403  
- Green: add secondary fetch; check status  
- Refactor: extract Sentry error message helper shared with `src/lib/sentry.ts`  

---

### TASK-4.4 · Expose brief parse errors in issue detail

**Estimate**: S  

**DoR**
- [ ] `parseError` flag exists on Brief model  

**DoD**
- [ ] IssueDetail shows a warning banner when `brief.parseError === true`  
- [ ] Raw LLM response visible in an expandable block for debugging  
- [ ] Test: component renders warning banner when `parseError` is true  

#### SUBTASK-4.4.1 · Return `parseError` and `rawResponse` from brief API `[TDD]`
- File: `src/app/api/brief/[id]/route.ts`  
- Red: test that response includes `parseError` boolean  
- Green: include in select  

#### SUBTASK-4.4.2 · Render parse error state in IssueDetail `[TDD]`
- File: `src/components/cockpit/issue-detail.tsx`  
- Red: render test — warning banner present when `parseError: true`  
- Green: add conditional banner with amber styling  

---

---

## EPIC-5 · Technical Debt & Code Hygiene

**Problem**: Several low-level issues will accumulate into real problems: query logging in production leaks SQL, unvalidated filter inputs, an inefficient metrics query, and `any` types hiding bugs.

**This epic runs in parallel with other epics and is never "done" — it is a recurring cycle.**

**Epic DoR**
- [ ] All open TDRs reviewed at the start of each cycle  
- [ ] At least one tech-debt item scheduled per sprint  

**Epic DoD** (per task — not a single release gate)
- [ ] Each task below meets its own DoD  
- [ ] Net `any` count does not increase sprint-over-sprint  
- [ ] `bun test` passes with no skipped tests  

---

### TASK-5.1 · Remove production query logging

**Estimate**: XS  

**DoR**
- [ ] Confirmed that removing `log: ['query']` does not break any test  

**DoD**
- [ ] `log` option removed from PrismaClient in production; kept only in `NODE_ENV === "development"` if desired  
- [ ] Test: no SQL strings appear in captured stdout during test suite run  

#### SUBTASK-5.1.1 · Conditionally enable Prisma query logging `[TDD]`
- File: `src/lib/db.ts`  
- Red: test (or lint rule) that confirms `log` is not set unconditionally  
- Green: `log: process.env.NODE_ENV === "development" ? ['query'] : []`  

---

### TASK-5.2 · Validate lean filter parameter

**Estimate**: XS  

**DoR**
- [ ] Allowed lean values defined: `jira | close | investigate | watchlist`  

**DoD**
- [ ] GET /api/issues with `lean=INVALID` returns 400 with a clear error  
- [ ] Tests: valid lean passes through, invalid lean returns 400  

#### SUBTASK-5.2.1 · Add lean validation to issues route `[TDD]`
- File: `src/app/api/issues/route.ts`  
- Red: test that `GET /api/issues?lean=BOGUS` returns 400  
- Green: add allowlist check before building Prisma where clause  
- Refactor: extract `VALID_LEANS` constant to `src/lib/constants.ts`; reuse in brief.ts validation  

---

### TASK-5.3 · Fix metrics disagreement query

**Estimate**: S  

**DoR**
- [ ] Prisma `groupBy` or raw SQL aggregation approach chosen  

**DoD**
- [ ] Disagreement count computed in a single DB query, not in-memory filter over all rows  
- [ ] Test: metrics route returns correct disagreement count for seeded data  
- [ ] Query time does not scale linearly with decision count (checked with explain plan)  

#### SUBTASK-5.3.1 · Rewrite disagreement count as SQL aggregation `[TDD]`
- File: `src/app/api/metrics/route.ts`  
- Red: test disagreement count against known seed data  
- Green: use `db.$queryRaw` or Prisma `_count` + `where` to compute in-database  
- Refactor: document the SQL approach in a one-line comment  

---

### TASK-5.4 · Fix decisions view filter inversion

**Estimate**: XS  

**DoR**
- [ ] Expected behaviour confirmed: decisions view should show ALL decisions including watchlist  

**DoD**
- [ ] GET /api/issues with `view=decisions` (or equivalent decisions endpoint) returns issues with any decision, including watchlist  
- [ ] Test: a watchlist decision causes the issue to appear in the decisions view  

#### SUBTASK-5.4.1 · Fix the WHERE clause `[TDD]`
- File: `src/app/api/issues/route.ts` (decisions view branch)  
- Red: test that issue with only a `watchlist` decision appears in the decisions view  
- Green: change `NOT: watchlist` filter to `some: { decision: { not: null } }` or equivalent  

---

### TASK-5.5 · Settings UI interval validation

**Estimate**: XS  

**DoR**
- [ ] Server-side validation already rejects ≤ 0 values  

**DoD**
- [ ] Frontend disables Save if interval is ≤ 0 and shows an inline validation message  
- [ ] Test: Save button disabled when interval is 0  

#### SUBTASK-5.5.1 · Add client-side interval guard `[TDD]`
- File: `src/components/cockpit/settings-view.tsx`  
- Red: render test — Save button disabled when interval === 0  
- Green: add `interval <= 0` to the `!dirty` disable condition; show helper text  

---

### TASK-5.6 · Establish test infrastructure

**Estimate**: M  
*(Prerequisite for all TDD subtasks above — do this first)*

**DoR**
- [ ] Decision on test runner: Bun built-in (`bun test`)  
- [ ] Decision on mock strategy: `bun:test` mocks for external fetch; Prisma test client seeded in-memory  

**DoD**
- [ ] `bun test` runs and exits 0 on a clean checkout  
- [ ] At least one passing test per file in `src/lib/`  
- [ ] At least one passing test per API route group  
- [ ] CI step added to package.json scripts (`"test": "bun test"`)  
- [ ] README updated with how to run tests  

#### SUBTASK-5.6.1 · Configure bun test with a global setup file `[TDD]`
- Create `src/test/setup.ts` — mock `fetch`, configure Prisma test DB URL  
- Create `bunfig.toml` with `[test] preload = ["src/test/setup.ts"]`  

#### SUBTASK-5.6.2 · Seed tests for src/lib/scrubber.ts `[TDD]`
- This module has no tests yet; it was built without them  
- Red: test that an email is replaced with `[REDACTED:email]`  
- Red: test that a JWT is replaced with `[REDACTED:jwt]`  
- Red: test that a `password=abc123` pair is redacted  
- Green: tests pass against existing implementation  
- Refactor: if any test fails, fix the scrubber  

#### SUBTASK-5.6.3 · Seed tests for src/lib/settings.ts `[TDD]`
- Red: test `getEffectiveSetting` returns DB value when set, env value when not  
- Green: passes against current implementation  

#### SUBTASK-5.6.4 · Seed tests for src/lib/sentry.ts `[TDD]`
- Red: test `extractStacktrace` returns null when no stacktrace in event  
- Red: test `scrub(extractStacktrace(...))` does not contain raw email address from fixture  
- Green: passes against current implementation  

---

---

## TDR Template

Path: `/docs/TDR/_template.md`

```markdown
# TDR-NNN · [Short title]

**Opened**: YYYY-MM-DD  
**Area**: src/lib/ | src/app/api/ | components/ | prisma/  
**Interest rate**: High / Medium / Low  
**Status**: Open | Scheduled (Sprint N) | Closed

## What we did

[One paragraph describing the shortcut taken.]

## Why

[Constraint, deadline, or uncertainty that justified it.]

## Cost if not paid

[What slows down, what breaks, what risks accumulate.]

## Payoff plan

[Steps to eliminate the debt. Link to a task in this backlog.]
```

---

## Dependency Graph

```
EPIC-2 (schema) ──────────────────────┐
                                       ▼
EPIC-1 (Jira) ──► TASK-1.3 (wire) ──► decisions route
                   TASK-1.1 (creds)
                   TASK-1.2 (client)

EPIC-3 (suppression) ─ independent of EPIC-1 and EPIC-2

EPIC-4 (observability) ─ independent; TASK-4.3 depends on src/lib/sentry.ts

EPIC-5 TASK-5.6 (test infra) ──► all other TDD subtasks
```

**Recommended start order**:
1. TASK-5.6 (test infra) — unblocks TDD on everything else  
2. TASK-2.1 (schema migration) — unblocks EPIC-1 TASK-1.3  
3. TASK-1.1 + TASK-1.2 in parallel (Jira creds + Jira client)  
4. TASK-3.1 (retroactive suppression) — independent, high value  
5. TASK-5.1 + TASK-5.2 + TASK-5.4 — all XS, clear the easy wins  
6. TASK-1.3 → TASK-1.4 (complete Jira flow)  
7. TASK-3.2 (tenant scope)  
8. EPIC-4 tasks  

---

*This backlog is a living document. Add TDRs as debt is incurred. Update status as tasks close. Review the dependency graph before starting a new epic.*
