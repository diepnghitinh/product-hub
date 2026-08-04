---
name: module-my-team
description: Use when working on My Team — the per-person workload view (workload cards, story-point progress, status accordions) at frontend/src/features/my-team, derived client-side from the unified issues list. Related to module-issues, module-teams, module-tasks.
---

# Module: My Team

**Apps/paths:** `frontend/src/features/my-team`

## Purpose
"My Team" is the team's queue seen *by person* — sits right under My Tasks (mine → my team's).
A single **Box** view: a grid of per-person workload cards showing counts, share-complete
(story points and issue count), and their issues grouped by status. The app has no membership
model, so "people" are simply whoever is assigned to the team's issues. Works for any active
team — a QC bug team as much as an Engineering task team — a switcher (`?team=`) lets the user
pick a team or view an "All teams" aggregate of every task team.

## Where it lives
- Frontend only, no dedicated backend module — this is a pure client-side derivation over the
  unified issues API.
  - `MyTeamPage.tsx` — page shell: team switcher (rides `?team=` in the URL), fetches teams
    (`useTeams`), team status columns (`useTeamStatuses`), and issues (`useIssues`), composes
    via `IssueBoardLayout`.
  - `workload.ts` — pure grouping logic: `groupByPerson(issues, columns, unassignedLabel)`
    builds `PersonWorkload[]`; `doneKeyOf` derives the "complete" column (task boards use
    `TaskStatus.DONE`; bug boards use their last column, e.g. `closed`).
  - `TeamWorkloadView.tsx` — masonry/column layout of `WorkloadCard`s plus a `WorkloadSummary`
    bar chart (shown only when >1 person); columns are packed in JS (not CSS `columns`) so one
    card growing never reshuffles others.
  - `WorkloadCard.tsx` — one person's card: `PersonAvatar`, `StatusBar` (stacked bar, colour
    from the column), `ProgressRing`-based stats, a story-points block, and a `StatusGroup`
    accordion per non-empty column that expands in place into `TaskRow`s (link to
    `/issues/:shortId-or-id`, opens in a new tab).
  - `ProgressRing.tsx` — small SVG donut ("share complete"), brand `--primary` arc only.

## Data model & key fields
No new entity/collection — reshapes `IssueDto[]` (from `module-issues`) in memory:
- `PersonWorkload`: `id` (assignee id or `UNASSIGNED_ID`), `name`, `isUnassigned`, `tasks`,
  `doneKey`, `doneCount`/`notDoneCount`/`total`, `donePoints`/`totalPoints`/`remainingPoints`
  (from `issue.estimate`, only counted for `IssueKind.TASK`), `noEstimateCount`, `progressPct`,
  `byColumn: ColumnBucket[]` (`{ col: TeamStatusConfig, tasks: IssueDto[] }`).
- A shared issue (multiple assignees) appears in **each** assignee's queue in full — this view
  answers "what's on your plate", not a per-issue split.

## API surface
None of its own — reads through:
- `useTeams()` / `useTeamStatuses(teamId, issueType)` from `module-teams`.
- `useIssues({ teamId, kind })` or `useIssues({ kind: [IssueKind.TASK] })` (All-teams
  aggregate) from `module-issues`.

## Relationships to other modules
- [[module-issues]] — the only data source; `IssueDto.assignees`, `.status`, `.estimate`,
  `.kind` drive every computed field. Task detail links go to `/issues/:ref`.
- [[module-teams]] — team list, `issueType` (task vs bug), and `TeamStatusConfig` columns
  (key/label/color) that `groupByPerson` buckets issues into; column colours are never
  hardcoded here, always read from the team config.
- [[module-tasks]] — the "All teams" aggregate is a task-only view (`kind: [IssueKind.TASK]`);
  bug teams have no comparable shared column vocabulary so they're viewed one at a time.
- [[module-bugs]] — a bug team's board works identically via `kind=bug`, just with no
  `DONE` column (falls back to the last column) and no story points.

## Gotchas & conventions
- "All teams" (`teamId` undefined) only aggregates **task** teams; picking a specific bug team
  shows that team's bugs. Default lens is "All teams" whenever >1 team exists, else the lone
  team.
- Follows the Kanban-board-layout convention from CLAUDE.md: composes `IssueBoardLayout` for
  the shell/switcher, but does **not** use `KanbanBoard` — this is a card-grid ("Box") view,
  not a column board, since it's grouped by person, not by status.
- Bug issues carry no `estimate`, so `noEstimateCount` and the story-points block deliberately
  only count/apply to `IssueKind.TASK` issues — a QC board isn't flagged for missing points.

## Related skills
[[module-issues]] [[module-teams]] [[module-tasks]] [[module-bugs]] [[module-cycles]]
