# Team Page Design

**Date:** 2026-04-29  
**Status:** Approved  
**Project:** Sentinel Triage Assistant (STA)

## Overview

Add a "Team" page to the STA sidebar. It gives the WHATS'ON Support team a single view to see who is on call this week, manage the weekly rotation schedule, configure support roles, and maintain the team roster. All data persists in SQLite via Prisma.

---

## Data Model

Four new Prisma tables:

### `TeamRole`
| Field | Type | Notes |
|---|---|---|
| id | String (cuid) | PK |
| name | String | e.g. "Support Developer" |
| sortOrder | Int | Controls display order |
| createdAt | DateTime | |

Seeded on first `GET /api/team/roles` if the table is empty: "Support Developer" (order 1) and "Support Engineer" (order 2).

### `TeamMember`
| Field | Type | Notes |
|---|---|---|
| id | String (cuid) | PK |
| name | String | Display name |
| defaultRoleId | String? | FK → TeamRole (nullable) |
| createdAt | DateTime | |

### `WeeklyRota`
| Field | Type | Notes |
|---|---|---|
| id | String (cuid) | PK |
| isoYear | Int | e.g. 2025 |
| isoWeek | Int | e.g. 18 |
| notes | String | Default "" |
| createdAt | DateTime | |
| updatedAt | DateTime | |

Unique constraint on `(isoYear, isoWeek)`.

### `RotaEntry`
| Field | Type | Notes |
|---|---|---|
| id | String (cuid) | PK |
| rotaId | String | FK → WeeklyRota (cascade delete) |
| roleId | String | FK → TeamRole |
| memberId | String | FK → TeamMember |

Unique constraint on `(rotaId, roleId)` — one person per role per week. A role can be left unassigned (no RotaEntry for that role that week).

---

## API Routes

All routes under `src/app/api/team/`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/team/roles` | List all roles ordered by sortOrder. Seeds defaults if empty. |
| POST | `/api/team/roles` | Create a role. Body: `{ name, sortOrder? }` |
| DELETE | `/api/team/roles/[id]` | Remove a role. |
| GET | `/api/team/members` | List all members with their defaultRole resolved. |
| POST | `/api/team/members` | Add a member. Body: `{ name, defaultRoleId? }` |
| DELETE | `/api/team/members/[id]` | Remove a member. |
| GET | `/api/team/rota` | List rota weeks with entries. Accepts `?weeks=N` (default 8: 4 past + current + 3 future). |
| POST | `/api/team/rota` | Upsert a week. Body: `{ isoYear, isoWeek, notes?, assignments: [{ roleId, memberId }] }`. Replaces all RotaEntries for that week atomically. |
| DELETE | `/api/team/rota/[id]` | Delete a rota week and all its entries. |

---

## Frontend

### Sidebar

- Add `"team"` to `ViewType` in `src/lib/store.ts`.
- Add `{ view: "team", label: "Team" }` to the `VIEWS` array in `src/components/cockpit/sidebar.tsx`, after "Suppressed". No count badge.

### New files

**`src/components/cockpit/team-view.tsx`**  
Full-width view with four sections rendered top to bottom, each separated by a border:

1. **This Week** — reads current ISO week from a client-side utility, looks it up in the rota query, shows a week badge (`● Week 18 · Apr 28 – May 2`) and one role card per role (name of assigned member or "— unassigned —"). Not editable inline — a small "Edit" button next to the week badge opens the assign modal pre-filled for the current week.

2. **Schedule** — table with columns: Week, Dates, one column per role (dynamic), action column. Rows cover 4 past weeks + current + future assigned weeks + next 3 unassigned weeks. Current week row has a teal left border and highlighted background. Past rows are muted. Each row has an "Edit" button. The "+ Assign Week" button above the table opens the modal with a week picker defaulting to the next unassigned week.

3. **Roles** — pill list of all roles. "+ Add Role" opens an inline input to type a name and confirm. Each pill has a remove (✕) button. Removing a role that has active RotaEntries shows a confirmation before deleting.

4. **Roster** — table with columns: Name, Default Role, Weeks on duty (count of RotaEntries for that member), remove button. "+ Add Person" reveals an inline form: name text input + default role select + confirm button.

**`src/components/cockpit/team-assign-modal.tsx`**  
Modal opened by clicking "Edit" on a schedule row or "+ Assign Week".

- Fetches `["team-roles"]` and `["team-members"]` on open.
- Renders one dropdown per role (in sortOrder). Each dropdown lists members whose `defaultRoleId` matches that role, plus a "— unassigned —" option. A "Show all team members ↓" link expands the dropdown to show everyone.
- "+ Assign Week" variant adds a week-picker select at the top (lists up to 12 upcoming weeks that have no WeeklyRota row, defaults to the earliest one).
- Notes textarea (optional).
- Save calls `POST /api/team/rota` and invalidates `["team-rota"]`.

### TanStack Query keys

| Key | Data |
|---|---|
| `["team-roles"]` | Role list |
| `["team-members"]` | Member list with defaultRole |
| `["team-rota"]` | Rota weeks with entries |

### Current week calculation

A small utility `getIsoWeek(date: Date): { isoYear: number; isoWeek: number }` implemented inline in `team-view.tsx` using standard ISO 8601 logic (no extra dependency).

---

## Behaviour notes

- **Role deletion:** Blocked if any RotaEntry in the current or a future week references that role. Past entries are kept for history. A confirmation dialog explains this before the user deletes.
- **Member deletion:** Same guard — blocked if referenced in the current week or any future rota. Past entries preserved.
- **Unassigned roles per week:** Allowed. A week can have some roles filled and others left blank.
- **"Weeks on duty" counter:** Counts distinct `WeeklyRota` weeks in which the member appears (regardless of how many roles they cover that week). Computed in the `GET /api/team/members` response.
- **No keyboard shortcuts** for this view — it is a planning/admin surface, not a triage surface.
