---
name: product-os-architecture
description: Use when you need the big-picture map of product-os — the 4-app topology, the DDD layer convention, how the domain modules connect (issue-centric), and which module-* skill to open for any feature. Start here, then jump to a [[module-x]] skill.
---

# Module: product-os Architecture (master map)

**Apps/paths:** `backend/` · `frontend/` · `saas-admin/` · `collab/` (monorepo root `/Users/lucasngucii/Workspaces/D3/product-hub`)

## Purpose
product-os is a multi-tenant Scrum/JTBD product-management tool: unified issues (tasks + bugs),
test-cases/reports, roadmaps (RICE backlog), OKRs, docs, and cycles. This skill is the **entry
point** — it explains the app topology, the backend DDD layering, the issue-centric module
relationship map, and indexes every per-module skill so you can route to the right one.

## 4-app topology
- **backend** — NestJS 11 API, MongoDB via Mongoose. All routes are URI-versioned under `/v1/*`.
  Global guards: `JwtAuthGuard` → `RolesGuard` (workspace JWT); the vendor console under
  `/v1/platform` uses a **separate** platform-jwt and is unreachable with a workspace token.
- **frontend** — React + Vite workspace app. One folder per feature under
  `frontend/src/features/*` (account, admin, issues, bugs, tasks, roadmaps, docs, …).
- **saas-admin** — React + Vite **vendor operator** console (`saas-admin/src/features/*`:
  overview, plans, subscriptions, tenants, usage, auth). Talks only to `/v1/platform`.
- **collab** — standalone Hocuspocus/Yjs WebSocket server (`collab/src`) that CRDT-syncs doc
  page bodies and mirrors them back to Mongo. Not part of the NestJS process.
- **MongoDB** — single datastore; every aggregate carries a `tenantId` for isolation.
- **Storage** — tenant-configured S3/Azure upload pipeline behind `POST /v1/uploads`
  (credentials live in App Settings).

## DDD layer convention (backend)
Each feature is a vertical slice split across three layers, mounted in
`presentation/presentation.module.ts` (routes at `/v1/<prefix>`):
- `presentation/<feature>` — controllers, DTOs, guards.
- `application/<feature>` — use-cases / services (business logic).
- `infrastructure/<feature>` — Mongoose entities + repositories.

Some features are thinner: bugs/tasks/labels/custom-fields have **no dedicated backend
module** — they are facets of Issues/Teams. Favourites/inbox have no infra layer (embedded on
User / computed live). Cross-cutting concerns live in `core/` and `shared/`.

## Module relationship map (issue-centric)
**[[module-issues]] is the hub** — the unified record everything foreign-keys into.
- **[[module-bugs]]** and **[[module-tasks]]** are the two `kind` facets of Issues (served via
  `/v1/issues`, not separate APIs). They fill the shared Kanban board slots.
- **[[module-teams]]** owns each issue list plus its **board columns/statuses**, **[[module-labels]]**,
  **[[module-custom-fields]]**, and **[[module-cycles]]** rhythm — read by every board and by
  [[module-my-team]]. Statuses are edited only in Settings ([[module-admin]]).
- **[[module-cycles]]** (sprints) schedule/roll-over issues via `cycleId`.
- **[[module-roadmaps]]** is the RICE backlog/timeline; its columns are **not** team statuses.
  Links to **[[module-milestones]]** (OKRs) and issues.
- **[[module-milestones]]** (OKRs) roll up weighted progress; link to roadmaps; shown in
  **[[module-planning]]** (the Roadmaps + OKRs tab shell).
- **[[module-issue-links]]** — typed relations (blocks/parent-of/related/duplicate) between issues.
- **[[module-activity]]** — shared comment engine for issues, docs, roadmap items; feeds
  **[[module-inbox]]** (mentions + assigned bugs) and **[[module-webhooks]]** (Lark/Telegram).
- **[[module-reactions]]** — emoji bar on issue/roadmap-item detail.
- **[[module-favourites]]** — per-user sidebar pins for issues/roadmaps/docs (embedded on User).
- **[[module-reports]]** (test-cases) live under **[[module-projects]]** (the "Testing" container)
  organized by **[[module-groups]]**; `bug.reportId` links a bug to a test case; edits recorded
  in **[[module-audit-log]]**.
- **[[module-docs]]** — page-tree knowledge base, realtime co-edited via **[[module-collab]]**.
- **[[module-users]]** / **[[module-auth]]** — accounts, roles, JWT; **[[module-account]]** is the
  self-profile page. **[[module-storage]]** backs avatars, attachments, doc uploads.
- **[[module-tenants]]** is the isolation boundary, managed from **[[module-saas-admin]]** through
  the **[[module-platform]]** console API (plans/subscriptions/entitlements).
- **[[module-app-settings]]** — per-tenant singleton (webhooks, storage creds, legacy status
  defaults). **[[module-api-keys]]** + **[[module-mcp]]** expose programmatic/AI access.
- **[[module-public]]** — token-based read-only sharing of boards/roadmaps/projects/docs.

## Frontend feature → backend module map
| Frontend `features/*` | Backend `/v1/<prefix>` | Skill |
|---|---|---|
| issues, bugs, tasks, my-team | `/v1/issues` (+teams) | [[module-issues]] [[module-bugs]] [[module-tasks]] [[module-my-team]] |
| teams, labels, custom-fields | `/v1/teams` | [[module-teams]] [[module-labels]] [[module-custom-fields]] |
| cycles | `/v1/teams/.../cycles` | [[module-cycles]] |
| roadmaps, milestones, planning | `/v1/roadmaps`, `/v1/milestones` | [[module-roadmaps]] [[module-milestones]] [[module-planning]] |
| issue-links, reactions, activity, inbox, favourites | resp. prefixes | [[module-issue-links]] [[module-reactions]] [[module-activity]] [[module-inbox]] [[module-favourites]] |
| projects, groups, reports, audit-log | `/v1/projects` (groups/reports/audit-log nested under `/v1/projects/:projectId/...`) | [[module-projects]] [[module-groups]] [[module-reports]] [[module-audit-log]] |
| docs (+ collab server) | `/v1/docs` + collab WS | [[module-docs]] [[module-collab]] |
| account, users, auth | `/v1/users`, `/v1/auth` | [[module-account]] [[module-users]] [[module-auth]] |
| uploads | `/v1/uploads` | [[module-storage]] |
| admin, settings | `/v1/teams`, `/v1/settings` (app-settings), `/v1/api-keys`, `/v1/mcp` | [[module-admin]] [[module-app-settings]] [[module-api-keys]] [[module-mcp]] |
| public | `/v1/public/*` | [[module-public]] |
| (saas-admin app) overview/plans/subscriptions/tenants/usage | `/v1/platform` | [[module-saas-admin]] [[module-platform]] [[module-tenants]] |
| — | (no HTTP route — outbound only, fired internally; configured via `/v1/settings`) | [[module-webhooks]] |

## Gotchas & conventions
- **Kanban boards are shared** — all boards compose `IssueBoardLayout` + `KanbanBoard`; never
  hand-roll board chrome, and creating from a team board must pass its `teamId` (see CLAUDE.md).
- Team statuses/columns are owned **only** by Settings → Teams; a board can't mint a status.
- Bugs/tasks have **no** `/bugs` or `/tasks` API — everything routes through `/v1/issues`.
- Multi-tenancy is pervasive: every aggregate has `tenantId`; platform routes use a separate token.

## Related skills (full index)
[[module-issues]] [[module-bugs]] [[module-tasks]] [[module-cycles]] [[module-milestones]]
[[module-roadmaps]] [[module-projects]] [[module-reports]] [[module-issue-links]] [[module-teams]]
[[module-groups]] [[module-users]] [[module-auth]] [[module-docs]] [[module-inbox]]
[[module-activity]] [[module-reactions]] [[module-favourites]] [[module-mcp]] [[module-api-keys]]
[[module-audit-log]] [[module-storage]] [[module-app-settings]] [[module-public]] [[module-webhooks]]
[[module-platform]] [[module-tenants]] [[module-custom-fields]] [[module-labels]] [[module-planning]]
[[module-my-team]] [[module-account]] [[module-admin]] [[module-saas-admin]] [[module-collab]]
