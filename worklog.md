# Worklog

## 2025-01-15 — STA Backend API Routes

### Summary
Created 9 API route files for the Sentry Triage Assistant (STA) cockpit backend:

### Routes Created

1. **POST /api/seed** (`src/app/api/seed/route.ts`)
   - Idempotent database seeding: clears all tables then seeds
   - 15 diverse Sentry issues (scheduling, auth, payments, notifications, browser extensions, search, email, etc.)
   - 13 AI briefs with realistic leans, confidence scores, and summaries
   - 6 decisions (mix of jira, close, watchlist)
   - 3 suppressions (browser extensions, bot scanners)

2. **GET /api/issues** (`src/app/api/issues/route.ts`)
   - 4 views: inbox, watchlist, suppressed, decided
   - Filters: lean, search, level, limit, offset
   - Includes related brief and latest decision per issue
   - Proper pagination support

3. **POST /api/brief/[id]** (`src/app/api/brief/[id]/route.ts`)
   - Real LLM integration via z-ai-web-dev-sdk (deepseek-chat model)
   - STA v0.4.0 system prompt with structured JSON output
   - Robust JSON parsing (direct + markdown code block extraction)
   - Graceful parseError handling when LLM returns malformed output
   - Tracks latencyMs and tokenCount

4. **POST /api/decisions** (`src/app/api/decisions/route.ts`)
   - Creates decision records linked to issues and briefs
   - Validates issue existence, auto-links brief

5. **DELETE /api/decisions/[id]** (`src/app/api/decisions/[id]/route.ts`)
   - Undo/delete decisions

6. **GET /api/suppressions** (`src/app/api/suppressions/route.ts`)
   - Lists all suppressions with issue counts, ordered by createdAt desc

7. **POST /api/suppressions** (`src/app/api/suppressions/route.ts`)
   - Creates new suppression rules by fingerprint

8. **DELETE /api/suppressions/[id]** (`src/app/api/suppressions/[id]/route.ts`)
   - Removes suppression rules

9. **GET /api/metrics** (`src/app/api/metrics/route.ts`)
   - Dashboard metrics: queueSize, handledToday, disagreementRate, lastPullAt, briefsGenerated, totalDecisions

### Notes
- All routes use `import { db } from '@/lib/db'` for Prisma access
- z-ai-web-dev-sdk used server-side only (brief generation route)
- Next.js Route Handlers with proper `export async function GET/POST/DELETE`
- Comprehensive error handling with try/catch and proper JSON responses

---

## 2026-04-22 — STA Cockpit Frontend UI

### Summary
Built the complete three-pane Sentry Triage Assistant cockpit UI with 13 files: a Zustand store, TanStack Query provider, 8 cockpit components, and the main page assembly.

### Files Created

1. **`/src/lib/store.ts`** — Zustand store
   - State: currentView, selectedIssueId, filters (lean/search/level), modal states, sidebarExpanded, focusedIndex, keyboardHintsOpen
   - Actions for all state mutations

2. **`/src/providers/query-provider.tsx`** — TanStack Query provider
   - QueryClient with 15s staleTime, retry: 1

3. **`/src/components/cockpit/top-bar.tsx`** — Metrics bar (48px fixed top)
   - Queue size, handled today, disagreement rate, last pull timestamp, briefs generated
   - Auto-refreshes every 30s via useQuery
   - Monospace numbers, Lucide icons, shadcn Badge

4. **`/src/components/cockpit/sidebar.tsx`** — Navigation sidebar
   - 4 nav items (Inbox, Watchlist, Decisions, Suppressed) with live count badges
   - Expandable/collapsible (48px ↔ 192px) with tooltips when collapsed
   - Seed Data and Generate Brief action buttons
   - Dark themed using bg-sidebar shadcn tokens

5. **`/src/components/cockpit/issue-list.tsx`** — Issue list pane
   - Fetches issues via GET /api/issues with view + filters using useQuery
   - Lean indicator dots (jira=orange, close=green, investigate=amber, watchlist=blue)
   - Filter bar: search input, lean dropdown, level dropdown
   - Keyboard navigation (↑↓ navigate, Enter select, / focus search)
   - Loading skeleton, empty state, error state with retry
   - Decision badges (✓ green, ✗ red for disagreements)

6. **`/src/components/cockpit/issue-detail.tsx`** — Issue detail pane
   - Full issue header: title, Sentry ID, project, env, level, release, timestamps, event count
   - AI Brief section: lean badge, confidence bar, summary, module, tenant impact, reproduction hint
   - Parse error warning display
   - 6 action buttons with keyboard shortcuts: 1=Jira, 2=Close, 3=Investigate, 4=Watchlist, S=Suppress, U=Undo
   - Disagreement indicator when human differs from AI lean
   - Decision history display
   - "Generate Brief" CTA when no brief exists

7. **`/src/components/cockpit/jira-modal.tsx`** — Jira draft dialog
   - Pre-fills summary/description from AI brief in Jira wiki markup format
   - Priority dropdown (Critical/High/Medium/Low), component text input
   - Submit calls POST /api/decisions with decision="jira"

8. **`/src/components/cockpit/suppress-modal.tsx`** — Suppression confirmation
   - AlertDialog with fingerprint display, reason input, scope selector (Global/Per-tenant)
   - Creates suppression + records close decision on confirm

9. **`/src/components/cockpit/decisions-view.tsx`** — Decisions log
   - Table: timestamp, issue title, AI lean, human decision, responder, disagreement flag
   - Filters: responder, disagreements-only toggle
   - CSV export button

10. **`/src/components/cockpit/suppressed-view.tsx`** — Suppressions management
    - Table: fingerprint, reason, scope, author, created, last matched
    - Stats cards: total suppressed, matched this week
    - Delete with confirmation dialog

11. **`/src/components/cockpit/watchlist-view.tsx`** — Watchlist view
    - Reuses IssueList + IssueDetail with resizable panels

12. **`/src/components/cockpit/keyboard-hints.tsx`** — Keyboard shortcuts overlay
    - Toggle with "?" key, Dialog with all shortcuts listed

13. **`/src/app/page.tsx`** — Main page (complete rewrite)
    - Full viewport height, no scrolling on main container
    - TopBar + Sidebar + content area
    - Resizable panels (react-resizable-panels) for inbox/watchlist list/detail split
    - Full-width views for decisions and suppressed
    - Global keyboard shortcuts (? toggle help, Escape deselect)
    - QueryProvider wrapper

### Technical Details
- All components use `'use client'` directive
- TanStack Query v5 for all data fetching (useQuery/useMutation)
- Zustand v5 for client state management
- Resizable panels from react-resizable-panels via shadcn/ui wrapper
- Color coding: jira=orange, close=emerald, investigate=amber, watchlist=sky
- All API calls use relative paths
- ESLint passes cleanly with 0 errors

---

## 2026-04-22 — Data Format Fixes & Integration

### Summary
Fixed critical data format mismatches between API routes and frontend components, added the missing individual issue API route, and added undo support to the decisions API.

### Changes Made

1. **Created `/src/app/api/issues/[id]/route.ts`** — Individual issue API
   - GET returns a single issue with brief and latest decision
   - Field mapping: `sentryIssueId→sentryId`, `projectId→project`, `brief.lean→lean`, etc.

2. **Fixed `/src/app/api/issues/route.ts`** — Issues list response format
   - Added `formatIssue()` helper to transform all responses to frontend-expected format
   - Maps: `sentryIssueId→sentryId`, `projectId→project`, `brief→lean/confidence/brief`, `decisions[0]→decision`

3. **Fixed `/src/app/api/decisions/route.ts`** — Added GET handler + undo support
   - GET returns decisions with `humanDecision`, `responder`, `timestamp`, `disagreement` fields
   - POST with `decision="undo"` now deletes the latest decision (undo action)
   - Proper disagreement filtering (in-memory after fetch for accuracy)

4. **Fixed `/src/app/api/suppressions/route.ts`** — Response format
   - GET returns flat array (was `{ suppressions: [...] }`)
   - Maps: `authorId→author`, `lastMatchedAt→lastMatched`, `_count.issues→matchCount`

5. **Fixed `/src/app/api/metrics/route.ts`** — Field name
   - Changed `lastPullAt` → `lastPull` (null → ISO string)

6. **Fixed confidence display** in `issue-detail.tsx`
   - Converts 0-1 float to 0-100 percentage for Progress bar and label

7. **Updated layout metadata** — Changed page title to "STA · Sentry Triage Assistant"

### Verification
- All 10 API endpoints verified working: seed, issues, issues/[id], brief/[id], decisions, decisions/[id], suppressions, suppressions/[id], metrics
- Database seeded with 15 issues, 13 briefs, 6 decisions, 3 suppressions
- ESLint passes cleanly with 0 errors
- Dev server running without errors
