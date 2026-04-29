# STA · Development Plan

**Sentry Triage Assistant** · Standalone triage tool for the WHATS'ON Support team
**Target**: working team cockpit within 6 weeks
**Owner**: TBD (Hive · Support)
**Status**: v1.1 · Phase 2 cockpit built; Phase 1 automated pipeline not yet implemented

---

## 1 · Scope and outcomes

**What this plan delivers.** A working tool the Support team uses daily to triage Sentry issues from Hive SaaS WHATS'ON tenants. The tool pulls issues, generates an AI brief with a lean (jira / close / investigate / watchlist), presents them in a cockpit, captures the human decision, and logs disagreements for review.

**What this plan does not deliver.** Not an incident response platform. Not an auto-routing pipeline. Not a replacement for PagerDuty or Jira. Not part of the AIR Platform. The tool assists humans making Jira-or-close decisions; it does not make those decisions autonomously.

**Definition of done for the whole effort.** Three things must be true six weeks in:

1. Every Sentry issue across the in-scope projects receives an AI brief within 15 minutes of being seen.
2. At least two First Responders use the cockpit as their primary triage surface and say it is faster than reading Sentry directly.
3. Weekly disagreement review has run at least twice and has produced at least one prompt adjustment or suppression list update.

If any of those three are not true at week six, we pause feature work and address the gap before adding scope.

**Non-negotiables.**

- Human decides. The tool never creates a Jira ticket, closes an issue, or notifies PagerDuty without a human click.
- AI output is structured JSON conforming to the v0.4.0 schema. No freeform prose.
- Secrets, PII, and tenant data scrubbed before they reach the LLM. EU region pinning, ZDR on.
- Suppression list is additive and auditable. Every entry has a reason and an author.

---

## Current implementation state

As of this revision, the build has diverged from the original phase order. Phase 2 (Cockpit UI) is substantially complete; Phase 1 (automated pipeline) is not yet built.

**Built:**
- Next.js 14 cockpit with three-pane resizable layout (sidebar / list / detail)
- All four views: inbox, watchlist, decisions, suppressed
- Keyboard navigation and action keys (1/2/3/4, S, U, /, ?)
- Decision logging, Jira draft modal, suppression management
- On-demand brief generation (manual trigger per issue, no automated pull)
- Top-bar metrics: queue size, handled today, disagreement rate, last pull, briefs generated
- Prisma + SQLite persistence with all four tables (issues, briefs, decisions, suppressions)
- LLM integration via `z-ai-web-dev-sdk` using DeepSeek; system prompt aligned to v0.4.0 schema

**Not yet built (Phase 1 pipeline):**
- Scheduled Sentry puller (10-minute cadence)
- PII / secrets scrubber (currently, raw issue data is sent to the LLM)
- Suppression filter applied before brief generation
- Authentication (responder ID is currently hardcoded)
- OpenTelemetry / Prometheus observability

---

## 2 · Phasing at a glance

| Phase | Weeks | Goal | Exit criterion |
|---|---|---|---|
| 0 · Decisions & setup | 0 | Answer open questions, provision accounts | All Phase 1 dependencies unblocked |
| 1 · Pipeline MVP | 1–2 | Briefs generated and stored for every issue | 24h clean run with <5% brief failures |
| 2 · Cockpit UI | 3–4 | First Responder workstation live | Two responders can complete a triage shift in the tool |
| 3 · Team rollout | 5–6 | Everyone uses it, feedback loop running | Two disagreement reviews completed |
| 4 · Iteration | ongoing | Prompt, suppression list, and heuristics improve weekly | — |

---

## 3 · Phase 0 · Decisions and setup (Week 0)

Nothing in Phase 1 can start until these are resolved. Treat Phase 0 as a blocker list with an owner on each line.

### 3.1 Open questions to close

1. **Sentry project scope.** Which Hive SaaS projects are in the initial pull? Start with one high-signal project, expand after Phase 1.
2. **Expected issue volume.** Estimate issues/day across the in-scope projects. Drives rate limits, cost ceiling, and pull cadence.
3. **LLM access path.** ~~Open.~~ **Resolved:** Using `z-ai-web-dev-sdk` with the `deepseek-chat` model for the on-demand brief generation path. Revisit before Phase 3 rollout — ZDR, EU pinning, and cost controls need to be confirmed for the chosen endpoint.
4. **Suppression list scope.** Global across all tenants, or per-tenant? Recommendation: global for noise patterns (scanners, bots, browser extensions), per-tenant for environment-specific noise. Build both from the start; default to global.
5. **Prompt iteration ownership.** Who owns the STA system prompt? Must be one named person, not a committee. Proposed: Support Tech Lead, with a weekly sync with the responder team.
6. **Hosting.** ~~Open.~~ **Resolved for Phase 2:** Running as a Next.js app locally. Production hosting decision (Hive Kubernetes vs. small VM) is still required before Phase 3 rollout.
7. **Jira project target.** Which Jira project receives tickets drafted from STA? Does it need its own label, component, or issue type to distinguish STA-originated tickets?

### 3.2 Infrastructure preconditions

- Sentry API token with read access to in-scope projects, rotated 90-day.
- Atlassian Jira API token with create-issue scope on the target project.
- Outbound egress to the LLM endpoint (gateway or Anthropic API, EU region).
- Secrets storage (existing vault or Kubernetes secrets, not committed to repo).
- A small persistent store — SQLite on a mounted volume is sufficient for Phase 1–2.

### 3.3 Phase 0 exit criteria

All seven open questions have a written answer. All four infrastructure preconditions are verified working with a one-line smoke test each.

---

## 4 · Phase 1 · Pipeline MVP (Weeks 1–2)

**Goal.** A headless pipeline that produces an AI brief for every Sentry issue within 15 minutes of it being seen, persists it, and logs every LLM call.

No UI in Phase 1. This is deliberate. A half-working pipeline behind a pretty UI is worse than no UI at all — the UI hides the failure modes.

### 4.1 Components

**Scheduled Puller.** Runs every 10 minutes. Fetches issues updated since the last run from each in-scope Sentry project. Persists raw issue payloads keyed on `(project, issue_id, updated_at)`. Idempotent — re-running produces no duplicates. First run pulls the last 24h as a cold start.

**Suppression Filter.** Before any brief is generated, check the issue fingerprint against the suppression list. If suppressed, skip the LLM call and log the skip. This is the primary cost control.

**Rebrief Logic.** If an issue already has a brief and no material fact has changed (no new release tag, no crossing of an event-count threshold, no last_seen bucket change), skip. Only re-brief on material change. This keeps LLM costs bounded and stable.

**Scrubber.** Before the payload leaves the pipeline boundary, strip: user emails, names, session tokens, any header matching `authorization`, anything matching common secret regex patterns. Replace with `[REDACTED]` so the stack trace context is preserved.

**Briefing Service.** Takes a scrubbed issue payload, builds the prompt (system = STA v0.4.0, user = scrubbed JSON), calls the LLM, validates the response against the schema. On valid response, persist the brief. On invalid, retry once with a stricter instruction; on second failure, persist the raw response with a `parse_error` flag and alert.

**Persistence.** SQLite for MVP. Four tables: `issues` (raw), `briefs` (parsed), `decisions`, `suppressions`. Schema managed via Prisma migrations.

**Observability.** Every LLM call logged with prompt version, token count, latency, outcome. No call is fire-and-forget. Count briefs produced per hour; alert if the rate drops to zero for more than 20 minutes.

### 4.2 Backlog

**P1-01** · Scheduled puller against one Sentry project, writing to `issues` table. *(M)*
**P1-02** · Scrubber with test fixtures covering email, bearer tokens, UNC paths, common PII patterns. *(S)*
**P1-03** · Briefing service with schema validator for v0.4.0 output. *(M)*
**P1-04** · Suppression filter with seed list (bots, known browser extension patterns). *(S)*
**P1-05** · Rebrief logic based on material-change detection. *(S)*
**P1-06** · SQLite persistence with migration runner. *(S)*
**P1-07** · Logging and minimal metrics (briefs/hour, parse error rate, latency p50/p95). *(S)*
**P1-08** · Smoke test that runs the pipeline end-to-end against a fixture payload. *(S)*
**P1-09** · 24h soak run against the production Sentry project, report: how many briefs, how many failures, how many suppressions, cost per day. *(M)*

### 4.3 Exit criteria

- 24h continuous run with ≥95% of issues receiving a valid parsed brief.
- Cost per day is within the target bound set in Phase 0. If not, investigate suppression coverage before scaling.
- No scrubber regression: the test fixtures all pass in CI.
- Every LLM call visible in the metrics log.

---

## 5 · Phase 2 · Cockpit UI (Weeks 3–4)

**Goal.** Turn the pipeline into something a First Responder opens every morning and closes at the end of a shift. This is the phase where the tool becomes real.

### 5.1 Scope

Build the cockpit interface based on the mockup prototype already produced. Three-pane layout (sidebar / list / detail). Keyboard-first navigation. Four action keys: 1 jira, 2 close, 3 investigate, 4 watchlist. Plus `s` suppress, `u` undo, `/` search.

**Decision logging.** Every action writes to the `decisions` table with fields: `issue_id`, `decision`, `ai_lean`, `timestamp`, `responder_id`, `jira_id` (nullable). The disagreement flag is derived, not stored — `ai_lean != decision`.

**Jira drafting.** The "Draft Jira" action opens a modal pre-filled with the brief formatted as a Jira description. The responder can edit before submission. On submit, call the Jira API, capture the returned issue key, update the decision record.

**Suppression management.** Suppressing a fingerprint from the UI writes to the `suppressions` table with the responder's ID and a timestamp. Optionally allow a free-text reason.

**Authentication.** Use whatever SSO the rest of Hive uses. Responder ID comes from the SSO claim; no separate user management.

### 5.2 Out of scope for Phase 2

- Custom dashboards and charts. The top-bar stats (queue size, handled today, disagreement rate) are enough.
- Multi-responder coordination. If two people pick up the same issue at once, last-write-wins is acceptable.
- Mobile responsive layout. This is a workstation tool.
- Email / Teams notifications. Phase 3.

### 5.3 Backlog

**P2-01** · Static shell: three-pane layout, routing, auth. *(M)*
**P2-02** · Inbox view: list pane with filters (lean, module, tenant, confidence, search). *(M)*
**P2-03** · Detail pane rendering the brief with all sections. *(M)*
**P2-04** · Keyboard navigation and action keys with visible shortcut hints. *(S)*
**P2-05** · Decision actions (close, investigate, watchlist) with optimistic UI and undo. *(M)*
**P2-06** · Jira draft modal and Atlassian API integration with idempotency key. *(L)*
**P2-07** · Suppression flow: suppress from detail pane, write to suppressions table, confirm in toast. *(S)*
**P2-08** · Watchlist view (non-destructive re-classification). *(S)*
**P2-09** · Decisions view (session log with disagreement flagging). *(S)*
**P2-10** · Suppressed view (read-only list with removal action gated on a confirmation). *(S)*
**P2-11** · Metrics in top bar: queue size, handled today, disagreement rate, last pull timestamp. *(S)*
**P2-12** · Error states: brief parse failure, pipeline stale, LLM call failed. Show, don't hide. *(S)*

### 5.4 Exit criteria

- Two First Responders each complete a full triage shift using only the cockpit, not Sentry directly.
- Median time-per-issue dropped compared to pre-tool measurement (record before tool exists — see Section 8).
- No crash, data loss, or duplicate Jira tickets during a one-week observation period.
- The disagreement rate is visible, even if nobody has reviewed it yet.

---

## 6 · Phase 3 · Team rollout and feedback loop (Weeks 5–6)

**Goal.** Move from two responders using it to the whole support team using it. Establish the disagreement review rhythm. This is where the tool starts improving.

### 6.1 Onboarding

A 30-minute walkthrough per responder, live or recorded. Cover: what the lean means, how to disagree cleanly, how suppression works, how to undo. Emphasise that disagreement with the AI is expected and valuable — the tool only gets better if people override it when they know better.

Add a one-page quick reference to the internal wiki: keyboard shortcuts, lean definitions, when to choose investigate vs. watchlist. This is often what people actually read.

### 6.2 Teams delivery (optional)

If the team already lives in Teams, add a daily digest: an adaptive card posted at start-of-day listing the top 5 jira-leaning issues that are not yet decided. Clicking opens the cockpit. Do not send per-issue notifications — that path leads to notification fatigue and people tuning it out.

### 6.3 Feedback loop

**Weekly disagreement review.** 30 minutes on a fixed day. The facilitator (prompt owner) pulls the week's disagreements from the decisions table, groups them by pattern, and the team reviews:

- Did the AI miss a signal the humans saw? → candidate for prompt update.
- Did the humans override because of context the AI didn't have? → candidate for input enrichment.
- Did the same fingerprint get closed by different people multiple times? → candidate for suppression list.
- Did investigate-vs-watchlist get flipped repeatedly? → tighten the prompt's distinction.

Outputs of every review: zero or more concrete changes, each with an owner and a target date. No change goes in without someone owning it.

**Prompt versioning.** Every material change to the system prompt increments the version. The version string is stored with every brief. This means a future bug investigation can always trace "which prompt produced this brief" and compare performance across versions.

### 6.4 Backlog

**P3-01** · Onboarding session + quick-reference wiki page. *(S)*
**P3-02** · Daily Teams digest (optional; skip if team prefers not). *(M)*
**P3-03** · Disagreement export query: decisions table → CSV for the weekly review. *(XS)*
**P3-04** · Prompt version string persisted with every brief. *(XS)*
**P3-05** · Baseline metrics recorded: briefs/day, decisions/day, disagreement rate by lean, suppression list growth rate. *(S)*
**P3-06** · First two disagreement reviews completed and documented. *(S)*

### 6.5 Exit criteria

- Every member of the responder team has used the cockpit at least once in a real shift.
- Two disagreement reviews have produced at least one prompt change or suppression addition.
- The team has a written point of view on whether to keep, adjust, or kill the Teams digest.

---

## 7 · Phase 4 · Iteration (Ongoing)

No more phases after this. This is the steady state.

**Weekly rhythm.** Disagreement review on a fixed day. Suppression list hygiene on the same day — remove entries older than 90 days that haven't matched, so the list doesn't become a graveyard.

**Monthly rhythm.** A 60-minute review of prompt performance: disagreement rate trend, confidence-vs-disagreement correlation, distribution of leans, cost. Decide if a prompt version bump is warranted.

**Quarterly rhythm.** Decide whether to expand the tool's scope — more Sentry projects, more tenants, new lean categories, new integrations. Scope expansion requires an explicit case, not momentum.

---

## 8 · Technical stack decisions

Each decision stated with rationale. Change requires a written counter-case.

**Framework.** Next.js 14 (App Router) with TypeScript. Rationale: the cockpit is a full-stack tool — the API routes, server-side logic, and React UI live in one project; no separate backend deployment; the TypeScript team is available; Next.js is already used elsewhere in the stack. The original plan specified Python + FastAPI + React/Vite; this was changed during early prototyping when the team moved faster with a single full-stack TypeScript codebase.

**UI.** React components via shadcn/ui on Tailwind CSS v4. Custom CSS design language (STA dark theme — IBM Plex Sans/Mono, `#0a0d11` base, `#5ee0e8` cyan accent) aligned to the approved mockup. Resizable panels via `react-resizable-panels`.

**State management.** Zustand for cockpit state (selected issue, current view, modal state); TanStack Query for server state and cache management.

**LLM.** `deepseek-chat` via `z-ai-web-dev-sdk` for on-demand brief generation. Rationale: fast iteration; the brief format and system prompt are identical regardless of model. Before Phase 3 rollout, this should be evaluated against the internal LLM gateway (ZDR, EU-region pinning, audit trail). Claude Sonnet 4.x remains the recommended production model.

**Storage.** SQLite in Phase 1–2 via Prisma ORM, Postgres in Phase 3 if team concurrency becomes an issue. Prisma handles schema migrations. Rationale: SQLite is sufficient for one-writer workloads; migration to Postgres is a day of work when needed.

**Hosting.** Internal Hive Kubernetes if available, otherwise a single small VM. Rationale: the service is stateless (database is a mounted volume); it can run as a single pod; no ingress scaling requirement.

**Secrets.** Existing Hive secrets store. Never in repo, never in environment variables in CI logs.

**Observability.** OpenTelemetry for traces, Prometheus for metrics, structured JSON logs to whatever log aggregator Hive already uses. Not yet implemented; required before Phase 3 rollout.

---

## 9 · Team and ownership

**Phase 1–2 build team.** One backend dev (pipeline + scrubber + API), one frontend dev (cockpit). Or one full-stack dev at 0.8 FTE for eight weeks if splitting across two people isn't practical.

**Prompt owner.** One named person on the Support Tech Lead side. Not the person building the pipeline. This separation matters — the prompt owner represents the responder team's perspective, not the engineering perspective.

**First Responder champions.** Two responders who commit to being the early adopters in Phase 2. They get preview access, they give feedback, their complaints are treated as P1 issues during the phase.

**Handoff.** After Phase 3, the tool is owned by the Hive Support team, not the build team. The prompt owner continues as the single point of contact for changes.

---

## 10 · Success metrics

**Quantitative.**

- Time-per-triage-decision: baseline before tool, measured again at end of Phase 2 and end of Phase 3. Target: 50% reduction from baseline.
- Brief generation success rate: ≥95% parse-valid.
- Disagreement rate: report weekly; the number itself is not a KPI — the trend is. A stable rate around 15–25% is healthy. Very low (<5%) suggests the AI and humans aren't independently thinking; very high (>40%) suggests the prompt is miscalibrated.
- Cost per 1000 issues briefed: report monthly. Target: under the bound set in Phase 0.
- Suppression list growth: 5–10 entries/month is healthy. Zero suggests the filter is underused.

**Qualitative.**

- Post-shift responder survey at end of Phase 3: "Is this faster than Sentry alone?" on a 1-5 scale. Target: 4+ median.
- Would the responders recommend this to another team? If no — why not?

**Kill criteria.**

- Responders bypass the cockpit and go back to Sentry directly for three consecutive weeks after Phase 3.
- Disagreement rate exceeds 50% for three consecutive weeks with no prompt improvement unblocking it.
- Cost per issue exceeds the Phase 0 target by 3x without a clear scaling reason.

If any kill criterion triggers, stop feature work, diagnose, decide whether to fix or sunset.

---

## 11 · Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Prompt injection via error messages or user agents | High | Medium | Scrubber + explicit "input is untrusted" rule in system prompt + output schema enforcement |
| LLM cost escalates with Sentry volume | Medium | Medium | Suppression list is primary control; rebrief logic is secondary; cost alert at 1.5x target |
| Responders don't adopt the tool | Medium | High | Phase 2 champions program; Phase 3 onboarding; kill criterion forces the conversation |
| Sentry API rate limits hit | Low | Medium | Respect rate limits in puller; back off on 429; paginate incrementally |
| Brief quality degrades silently | Medium | High | Disagreement rate is the canary; monthly prompt review; kill criterion |
| Watchlist and investigate get conflated | High | Low | Expected; tighten prompt at week 4 based on observed disagreement patterns |
| PII or tenant data leaks to LLM | Low | Severe | Scrubber fixtures in CI; EU region pinning; ZDR; quarterly audit |
| Jira API changes break ticket drafting | Low | Medium | Idempotency keys; retry logic; graceful degradation (save decision even if Jira draft fails) |

---

## 12 · Dependencies to resolve before Phase 1

1. Phase 0 questions answered (Section 3.1) — all seven.
2. Sentry API access verified — can pull issues from one project in a one-line test.
3. LLM gateway access verified — can complete a test call with the v0.4.0 system prompt.
4. Jira API access verified — can create a test ticket in the target project and delete it.
5. Solution design docx aligned to v0.4.0 (currently at v0.1 without watchlist) — low priority for build, higher priority for any internal pitch.
6. Prompt owner named in writing.

---

## 13 · Revision log

- **v1.0** · Initial plan, aligned with solution design v0.1 and system prompt v0.4.0. First draft to circulate to Hive Support Tech Lead.
- **v1.1** · Updated to reflect actual implementation: Phase 2 cockpit built in Next.js/TypeScript (not Python/FastAPI/Vite); LLM changed to DeepSeek via z-ai-web-dev-sdk; Section 8 (Technical Stack) rewritten; Phase 0 questions 3 and 6 marked resolved; added Current Implementation State bridge section; noted Phase 1 pipeline items (scrubber, puller, auth, observability) as not yet built.

---

*This plan is a working document. Treat it as a tool for coordination, not a contract. Update the phase headers, backlog items, and metrics as reality diverges from prediction — which it will.*
