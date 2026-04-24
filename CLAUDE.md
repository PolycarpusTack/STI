# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

**Sentinel Triage Assistant (STA)** — a full-stack Next.js tool for the WHATS'ON Support team to triage Sentry issues. It pulls issues from Sentry, generates AI briefs via an LLM ("Sentinel" persona), and presents them in a keyboard-driven cockpit where responders make jira/close/investigate/watchlist decisions.

## Commands

```bash
# Development
bun dev                   # start Next.js on port 3000
bun run lint              # ESLint

# Database
bun run db:push           # push schema changes without migration (dev)
bun run db:migrate        # create + apply a migration
bun run db:generate       # regenerate Prisma client after schema changes
bun run db:reset          # wipe and re-apply all migrations

# Tests
bun test                  # run all tests
bun test --watch          # watch mode
bun test src/lib/brief    # run a single test file by path prefix

# Build / production
bun run build             # build standalone Next.js output
bun run start             # serve production build (reads server.log)
```

Tests use an in-memory SQLite database by default (set in `src/test/setup.ts` via `bunfig.toml` preload).

## Architecture

### Data flow

```
Sentry API → pipeline.ts → db (SQLite/Prisma)
                         → brief.ts → LLM → db.brief
```

1. `src/instrumentation.ts` starts the poller on server boot (Node.js runtime, non-test).
2. `src/lib/poller.ts` — timer loop that calls `runPipeline()` on an interval read from settings/env.
3. `src/lib/pipeline.ts` — orchestrates ingestion:
   - Fetches issues from Sentry since `lastPullAt` (or 24h cold start).
   - Checks fingerprints against suppression list; skips suppressed.
   - Upserts `Issue` rows; collects IDs with no brief yet.
   - Calls `briefIssues()` in batches of 3.
4. `src/lib/brief.ts` — sends scrubbed issue data to the LLM with the Sentinel system prompt and few-shot examples. Parses the strict JSON response into a `Brief` row. Falls back to `parse_error: true` + raw response on failure.
5. `src/lib/scrubber.ts` — redacts emails, JWTs, secret key-value pairs, and credit card numbers before the payload leaves the pipeline boundary.

The pipeline can also be triggered on-demand via `POST /api/pipeline/run`. Ingestion returns immediately; brief generation continues in the background.

### LLM integration

`src/lib/brief.ts` supports two paths:

- **Custom endpoint** — if `LLM_BASE_URL` and `LLM_API_KEY` are set (DB setting or env var), uses a raw `fetch` to any OpenAI-compatible `/chat/completions` endpoint.
- **z-ai-web-dev-sdk** — fallback when no custom endpoint is configured.

The system prompt version is tracked per brief (`promptVersion` field). The four valid leans are `jira | close | investigate | watchlist` (defined in `src/lib/constants.ts`).

### Settings resolution

`getEffectiveSetting(key, envVar)` in `src/lib/settings.ts` — DB row wins over env var. This lets operators configure everything through the UI (`/api/settings`) without restarting the server.

### Frontend (Cockpit)

Single-page app at `src/app/page.tsx`. State lives in two places:

- **Zustand** (`src/lib/store.ts`) — cockpit UI state: current view, selected issue, modal open/closed, focused list index, filters.
- **TanStack Query** — server state: issues list, metrics, decisions. Cache is invalidated optimistically on decision actions.

Views: `inbox` and `watchlist` use a two-pane resizable layout (list + detail). `decisions`, `suppressed`, `settings`, `help` are full-width.

Components live in `src/components/cockpit/`. shadcn/ui primitives are in `src/components/ui/`.

### API routes (`src/app/api/`)

| Route | Purpose |
|---|---|
| `GET /api/issues` | Paginated issue list; `view` param selects inbox/watchlist/suppressed |
| `GET/POST /api/decisions` | Decision log; POST creates a decision, triggers Jira if `decision === 'jira'` |
| `POST /api/pipeline/run` | Manual pipeline trigger |
| `GET/POST /api/settings` | Read/write settings in DB |
| `GET/POST /api/suppressions` | Suppression list management |
| `POST /api/brief/[id]` | Re-generate a brief for a single issue |

### Database

SQLite via Prisma. Schema: `Issue`, `Brief` (1:1 with Issue), `Decision` (many per Issue), `Suppression` (matched by fingerprint), `Setting` (key/value store).

`db/meta.json` stores last pipeline run timestamp and stats as a lightweight sidecar (not in SQLite).

## Environment variables

All settings can be set via the UI (persisted to `Setting` table) or via env vars. DB values take precedence.

```
DATABASE_URL              # sqlite file path (e.g. file:./db/custom.db)
SENTRY_TOKEN / ORG / PROJECT
POLL_INTERVAL_MINUTES     # default 10
LLM_BASE_URL / LLM_API_KEY / LLM_MODEL
JIRA_BASE_URL / JIRA_EMAIL / JIRA_API_KEY / JIRA_PROJECT_KEY
```

## Key constraints

- `reactStrictMode: false` and `typescript.ignoreBuildErrors: true` are intentional in `next.config.ts`.
- The poller does NOT start during tests (`NODE_ENV === 'test'` guard in `instrumentation.ts`).
- Jira integration is best-effort: a Jira API failure is logged but the decision is still saved.
- The `scrub()` function must be applied to issue title, culprit, and stacktrace before any LLM call or DB write.
