---
name: module-planning
description: Use when working on Planning — the tabbed shell page at frontend/src/features/planning/PlanningPage.tsx that combines Roadmaps and OKRs behind a "/roadmaps"/"/okrs" tab strip. Related to module-roadmaps, module-milestones.
---

# Module: Planning

**Apps/paths:** `frontend/src/features/planning`

## Purpose
Planning is a thin page shell, not its own data domain. It puts Roadmaps ("what
we're betting on") and OKRs/Milestones ("what worked would look like") on one
page behind a tab strip, so switching between a bet and its outcome is a tab
click instead of a sidebar round trip. There is no dedicated backend for this
module — it renders panels owned by `module-roadmaps` and `module-milestones`.

## Where it lives
- Backend: none — no `planning` folder in `backend/src`. All data comes from
  the Roadmaps and Milestones APIs.
- Frontend: `frontend/src/features/planning/PlanningPage.tsx` (only file in the
  feature). It renders `RoadmapsPanel` (`frontend/src/features/roadmaps/RoadmapsPanel.tsx`)
  or `MilestonesPanel` (`frontend/src/features/milestones/MilestonesPanel.tsx`)
  depending on the active tab.

## Data model & key fields
None owned here — no entity, no query hooks. The page derives its tab purely
from `location.pathname` (`'/okrs'` vs default `'/roadmaps'`); there is no
component-state tab and no separate "planning" URL.

## API surface
None — `PlanningPage` calls no API itself. Endpoints are those documented
under `module-roadmaps` and `module-milestones`.

## Relationships to other modules
- **[[module-roadmaps]]** — one of the two tabs; `RoadmapsPanel` supplies its
  own title/primary action via `PageHeader` (portalled into the topbar), so
  `PlanningPage` doesn't need to know what a roadmap panel can create.
- **[[module-milestones]]** — the other tab (OKRs), same `PageHeader` pattern
  via `MilestonesPanel`.
- No relationship to `module-teams` / `module-my-team` — `MilestonesPanel` is
  only rendered here, on the workspace-level `/roadmaps`/`/okrs` page; there is
  no team-scoped planning page or OKRs tab elsewhere in the app.

## Gotchas & conventions
- **The tab is the URL, not component state.** Both `/roadmaps` and `/okrs`
  route to this same `PlanningPage` (registered twice in `App.tsx`); the tab
  is computed from `pathname.startsWith('/okrs')`. This keeps every existing
  link/favourite/breadcrumb to `/okrs` or `/roadmaps` working as a real,
  bookmarkable, Back-button-safe navigation — don't refactor this into a
  `useState` tab, it would silently break deep links.
- Detail routes (`/roadmaps/:roadmapId`, `/roadmaps/:roadmapId/items/:itemId`,
  `/okrs/:milestoneId`) are separate pages (`RoadmapBoardPage`,
  `RoadmapItemDetailPage`, `MilestoneDetailPage`) — `PlanningPage` only
  renders the two list-level panels, not detail views.
- Uses `ViewTabs` from `components/IssueBoardLayout` for the tab strip — the
  same sub-header tab chrome the Kanban boards use, per the "Compose them;
  never hand-roll board chrome" convention in CLAUDE.md — so a tabbed page
  reads the same wherever it appears in the app.
- Layout: `FullScreenLayout` + a manually inlined centred column (mirrors
  `CenteredPageLayout`'s max-width shape) because the full-bleed `ViewTabs`
  strip can't sit inside that column itself.

## Related skills
[[module-roadmaps]] [[module-milestones]]
