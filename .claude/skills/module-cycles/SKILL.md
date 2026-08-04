---
name: module-cycles
description: Use when working on Cycles (Sprints) — Scrum sprint scheduling and history for a team, at backend/src/application/cycles (+ presentation/teams/team-cycles.controller.ts) and frontend/src/features/cycles. Related to module-teams (rhythm config lives on TeamEntity), module-issues (cycleId, rollover), module-admin (TeamCyclesEditor is the only UI for the rhythm).
---

# Module: Cycles (Sprints)

**Apps/paths:**
`backend/src/application/cycles`, `backend/src/infrastructure/cycles`, `backend/src/presentation/teams/team-cycles.controller.ts`, `frontend/src/features/cycles`

## Purpose
A team's Scrum sprint rhythm: fixed-length dated windows ("Cycle 1", "Cycle 2"…) that issues are planned into. A team runs either **auto** (a scheduler mints cycles on a cadence and rolls unfinished work forward) or **manual** (the team hand-plans each window). Every cycle tracks live scope/completed rollups while open and freezes them at close, plus a burn-up chart reconstructed from issue timestamps.

## Where it lives
- Backend: `presentation/teams/team-cycles.controller.ts` (`TeamCyclesController`, routes nested under `/teams` — "a cycle only exists as part of a team's rhythm"); use-cases in `application/cycles/use-cases/cycle.use-cases.ts`; domain entity/rules in `application/cycles/domain/entities/cycle.entity.ts` + `cycle.props.ts`; date math in `domain/cycle-dates.ts`; burn-up reconstruction in `domain/cycle-burndown.ts`; the no-cron scheduler in `services/cycle-scheduler.service.ts`; Mongoose schema in `infrastructure/cycles/entities/cycle.schema.ts` (collection via `CycleDoc`, `_id` uuid).
- Frontend: `TeamCyclesPage.tsx` (row-per-cycle history + plan view), `CycleControls.tsx` (per-row controls, carry-over badge, unfinished-issue ghosts), `CycleInsights.tsx` (goal-editing drawer), `CycleBurnupChart.tsx`, `components/CycleFormDialog.tsx` (manual create/edit), `components/TeamCyclePlanner.tsx`, `usePlanCycles.ts`, `api.ts` (React Query hooks), `dates.ts` (display helpers), `CycleIcon.tsx`.

## Data model & key fields
`CycleDoc` / `CycleProps` (collection `cycles`, unique index `{teamId, number}`):
- `teamId`, `number` (auto-incremented per team, identity + fallback label "Cycle N")
- `name` (`''` = show "Cycle N"), `startDate`/`endDate` (ISO `YYYY-MM-DD`, inclusive)
- `description` (sprint goal, plain text, `null` unset; editable on any cycle incl. closed; **lost on a rhythm rebuild**)
- `scopeCount`/`scopePoints`/`completedCount`/`completedPoints` — 0 until close (frozen), live-computed on read while open
- `unfinishedIds: string[]` — issue ids the boundary sweep moved away at close; `[]` while open or if closed before this field existed
- `closedAt: Date | null` — set once by the boundary sweep (also a write-once concurrency claim)
- `CycleStatus` enum (`upcoming`/`active`/`completed`) — **derived from dates on read, never stored**
- Filter sentinels: `CYCLE_FILTER_CURRENT`/`_UPCOMING`/`_NONE`, resolved server-side (`CycleSchedulerService.resolveCycleFilter`) so saved links like `?cycle=current` never go stale
- On `TeamEntity`: `cyclesEnabled`, `cycleMode` (`CycleMode.AUTO`/`MANUAL`), `cycleLengthWeeks` (1–4), `cycleCooldownWeeks` (0–2), `cycleStartDay`, `cycleStartDate`, `cycleAutoRollover`
- On `IssueEntity`: `cycleId: string` — the join field; `''` means no cycle

## API surface
All nested under `/teams` (`TeamCyclesController`):
- `GET /teams/:teamId/cycles` — list, newest-window-first; **this read advances the lazy scheduler**
- `GET /teams/:teamId/cycles/:cycleId/burndown` — burn-up series + assignee/label/project breakdowns
- `POST /teams/:teamId/cycles` — manual-cadence only; dates must not overlap a sibling cycle
- `PATCH /teams/:teamId/cycles/:cycleId` — goal/description on any cycle; name/dates manual-only
- `DELETE /teams/:teamId/cycles/:cycleId` — manual-cadence only; issues fall back to no-cycle
- `PATCH /teams/:teamId/cycle-config` — patch the rhythm (`UpdateTeamCycleConfigDto`); returns `TeamResponseDto`

## Relationships to other modules
- **[[module-teams]]**: the rhythm config (`cyclesEnabled`, `cycleMode`, length/cooldown/start day) lives entirely on `TeamEntity` and is edited via `PATCH /teams/:teamId/cycle-config`; a cycle never exists without a team and is never cross-team.
- **[[module-issues]]**: issues carry `cycleId`; rollups, burn-up reconstruction, and rollover/no-cycle detachment all key off it. `completedStatusKeysFor(team.issueType)` reads the issue domain's `COMPLETED_STATUS_KEYS` so "done" agrees everywhere. The dependency also runs in reverse: `CreateIssueUseCase` reads `ICycleRepository` directly to auto-join a new issue to its team's ACTIVE cycle, and `GetIssuesUseCase` calls `CycleSchedulerService.ensureCyclesCurrent`/`resolveCycleFilter` itself on every team-scoped list read — so cycle generation/boundary-processing is also driven from outside this module. A rolled-over issue's `carryOverCount` (incremented by `moveUnfinishedIssues`, reset to 0 on a fresh `cycleId`) drives the FE's "Carried over ×N" badge.
- **[[module-projects]] / [[module-labels]]**: `GetCycleBurndownUseCase`'s breakdown reads `issue.projectId` (project bucket, label/color resolved client-side) and `team.labels` (to resolve each `labelKeys` bucket's name/color) alongside the assignee bucket.
- **Team board views**: the `cycleId` list filter (with `current`/`upcoming`/`none` sentinels) is how a team board scopes to a sprint; new-issue auto-add and "the current cycle" answer all resolve through `CycleSchedulerService.resolveCycleFilter`. (Not [[module-my-team]] — that view has no cycle filter at all; it's a person-workload derivation from the unrestricted issue list.)
- **[[module-planning]]**: manual-cadence teams plan cycles by hand (`CreateCycleUseCase`/`UpdateCycleUseCase`), the same flow that seeds a Scrum backlog into a sprint.
- **[[module-admin]]**: `TeamCyclesEditor` (in `AdminSettingsPage.tsx`) is the only UI for a team's sprint rhythm — auto vs. manual, cadence, cooldown — and calls `useUpdateCycleConfig`; when the team is manual it embeds this module's own `TeamCyclePlanner` for hand-planning.

## Gotchas & conventions
- No cron: every read that touches cycles calls `ensureCyclesCurrent` first (lazy scheduler) — idempotent, cheap when nothing's due, safe under concurrency (unique `(teamId, number)` index for generation, write-once `closedAt` for stat-freezing).
- A **rhythm change** on a team that stays enabled AND stays auto wipes and renumbers *every* cycle (closed history included) from Cycle 1 — description/goal is lost with it. Disabling cycles is gentler: only not-yet-started cycles are deleted.
- Auto team: hand-editing name/dates is rejected (`CYCLES_NOT_MANUAL`); the scheduler owns that team's calendar.
- Cycle numbers are never reused after delete; list order is by `startDate` (newest window first), not by number — a manual team can create cycle 5 for a window before cycle 4's.
- `unfinishedIds` + frozen stats satisfy `completedCount + unfinishedIds.length === scopeCount` by construction (one aggregation pass at close).
- Follow CLAUDE.md's flat-DTO rule: `CycleResponseDto`/`CycleBurndownResponseDto` are flat, no nested objects.

## Related skills
[[module-teams]] [[module-issues]] [[module-planning]] [[module-projects]] [[module-labels]] [[module-admin]]
