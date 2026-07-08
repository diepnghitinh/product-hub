# 00 · Feature Inventory & Statistics (Thống kê)

A complete, counted inventory of the existing product. Everything here is
extracted from `old-report/` source on 2026-07-07.

---

## 1. At a glance

| Metric | Count |
|---|---:|
| Major feature areas | 8 |
| Data models (MongoDB collections) | 13 |
| API route modules | 49 |
| App pages (screens) | ~21 |
| React components | ~55 |
| Roles | 3 |
| Public-share surfaces | 3 (projects, bugs, roadmaps) |
| Background integrations | 1 (Lark webhooks) |
| Data migration scripts | 5 |

**Stack:** Next.js 15 · React 19 · TypeScript 5.6 · MongoDB + Mongoose 8 ·
NextAuth 5 (beta) · Tailwind CSS 3 · Editor.js · Azure Blob Storage · `xlsx` · bcrypt.

---

## 2. The 8 feature areas

| # | Feature area | One-line description | Primary models |
|---|---|---|---|
| 1 | **Projects & Reports** | A project holds grouped "feature reports"; each report is a rich, sectioned QA/feature document. | `Project`, `Group`, `Report` |
| 2 | **Test Cases** | Structured test cases live inside a report's testing section; import from Excel/JSON; track result + coverage. | `Report` (embedded), `AuditLog` |
| 3 | **Bugs** | Kanban bug tracker with severity, configurable statuses, custom fields, attachments, and test-case links. | `Bug`, `AppSettings`, `BugShare` |
| 4 | **Activity & Inbox** | Comment threads (with @-mentions + media) attached to bugs; a personal Inbox of mentions/assignments. | `Activity`, `User` (inboxSeenAt) |
| 5 | **Roadmaps** | Standalone Now/Next/Later boards of backlog items with RICE prioritization. | `Roadmap`, `RoadmapItem` |
| 6 | **Milestones (OKR)** | Time-boxed OKRs: Objective → Key Result → Individual, with progress rollup + Gantt. | `Minestone` |
| 7 | **Public Sharing** | Read-only tokenized links for projects, bugs, and roadmaps. | `Project`, `Roadmap`, `BugShare` |
| 8 | **Admin, API & Integrations** | People management, app settings, archive, global API keys, audit history, Lark webhooks. | `User`, `ApiKey`, `AuditLog`, `AppSettings` |

---

## 3. Data models (13)

| Model | Purpose | Soft-delete | Notable fields |
|---|---|:---:|---|
| `Project` | A workspace of feature reports | ✅ `deletedAt` | `slug`, `owner`, `sharedWith[]`, `pinned`, `publicEnabled`, `publicToken`, `environment` |
| `Group` | A sidebar section within a project | — | `projectId`, `slug`, `title`, `order` |
| `Report` | A feature/QA report page (sections tree) | — | `projectId`, `slug`, `statusVariant`, `sections[]` (Mixed), `order` |
| `Bug` | A bug/issue | — | `shortId`, `severity`, `status`, `type`, `assigneeId`, `cases[]`, `customFields`, `attachments[]`, `order` |
| `BugShare` | The single global bug-board public link | — | `scope:'global'`, `token`, `enabled` |
| `Activity` | 1-to-1 comment thread for an entity | — | `entityType` (`bug`\|`backlog`), `entityId`, `comments[]` |
| `Roadmap` | A Now/Next/Later board | ✅ `deletedAt` | `title`, `projectIds[]`, `pinned`, `publicEnabled`, `publicToken` |
| `RoadmapItem` | A backlog item on a roadmap | — | `phase`, `status`, `difficulty`, `progress`, `reach/impact/confidence/effort` (RICE), `assigneeIds[]` |
| `Minestone` | An OKR milestone (note the spelling) | ✅ `deletedAt` | `roadmapIds[]`, `startDate/endDate`, `status`, `objectives[]` (nested KR → individuals) |
| `User` | An account | — | `email`, `passwordHash`, `name`, `role`, `inboxSeenAt` |
| `ApiKey` | A global API key (hashed) | via `revokedAt` | `name`, `keyHash` (SHA-256), `keyPrefix`, `lastUsedAt`, `revokedAt` |
| `AuditLog` | A test-case / report change entry | — | `entityType`, `field`, `oldValue`, `newValue`, `actorType` (`user`\|`api`), `apiKeyName` |
| `AppSettings` | Singleton app config | — | `webhooks[]`, `bugStatuses[]`, `bugFields[]` |

---

## 4. Enum / value catalog

Every fixed value set in the product. Reuse these — do **not** invent new ones.

### Roles
`admin` · `tester` · `guest`

### Project environment
`development` · `staging` · `production` (default `development`)

### Feature/report status (`statusVariant`)
`testing` · `done` · `info`

### Report section types
`overview` · `screenshot` · `cards` · `steps` · `bullets` · `ordered` · `testing`

### Test result
`Passed` · `Failed` · `Blocked` · `Retest` · `Skipped` · `Untested`

### Test type
`Functional` · `UI` · `API` · `Integration` · `Performance` · `Security` · `Regression` · `Accessibility` · `Other`

### Bug severity
`low` · `medium` · `high` · `critical`

### Bug status (built-in defaults — **admin-configurable**)
`open` · `in-progress` · `in-review` · `resolved` · `closed`
> Statuses are stored config: admins can rename, recolor, reorder, and add their own.
> The 5 built-ins can be edited but never deleted.

### Custom bug field type
`text` · `dropdown` (dropdown may be single- or multi-select)

### Roadmap phase
`now` · `next` · `later` · `done`

### Roadmap item status
`idea` · `planned` · `in-progress` · `done`

### Roadmap item difficulty
`easy` · `medium` · `hard`

### RICE inputs
`reach` · `impact` · `confidence` · `effort` — each an integer **1–5** (default 3).

### Milestone (OKR) status
`active` · `completed` · `archived`

### Milestone individual (task) status
`todo` · `in-progress` · `done`

### Activity host entity
`bug` · `backlog`

### Inbox item kind
`mention` · `assigned-bug` · `assigned-milestone`

### Audit entity / actor
entity: `testcase` · `report` — actor: `user` · `api`

### Webhook channel & events
channel: `lark` — events: `bugCreated` · `bugAssigned` · `commentMention`

---

## 5. API endpoint inventory (49 route modules)

Grouped by area. `[x]` = dynamic path segment. All routes are session-protected
**except** `/api/auth/*`, `/api/register`, and `/api/public/*`.

### Auth & account
- `POST /api/register` — self-service registration
- `/api/auth/[...nextauth]` — NextAuth (login/session)
- `GET /api/users` — list users (for pickers)
- `PUT /api/users/me/password` — change own password

### Projects
- `GET·POST /api/projects` — list / create
- `POST /api/projects/import` — import from JSON export
- `GET·PUT·DELETE /api/projects/[project]` — read / update / soft-delete (archive)
- `POST /api/projects/[project]/duplicate` — deep copy
- `GET /api/projects/[project]/audit-log` — History feed
- `GET·POST /api/projects/[project]/groups` + `PUT·DELETE …/groups/[slug]`
- `GET·POST /api/projects/[project]/reports` + `…/reports/reorder`
- `GET·PUT·DELETE /api/projects/[project]/reports/[slug]`
- `POST /api/projects/[project]/reports/[slug]/duplicate`
- `POST /api/projects/[project]/reports/[slug]/screenshots` — upload report images
- `GET·PUT /api/projects/[project]/roadmap` — the project's embedded roadmap tab
- `PUT /api/projects/[project]/public` — toggle public link
- `GET·POST /api/projects/[project]/share` + `DELETE …/share/[user]` — member sharing

### Reports · public
- `GET·PATCH /api/public/testcases/[project]/[testcase]` — **public test-case API** (API-key auth)

### Bugs
- `GET·POST /api/bugs` — list / create
- `GET /api/bugs/counts` — per-status counts
- `GET·PATCH·DELETE /api/bugs/[bug]`
- `GET·POST /api/bugs/[bug]/activity` + `PATCH·DELETE …/activity/[comment]`
- `POST /api/bugs/[bug]/attachments`
- `POST /api/bugs/share` — toggle the global public bug board
- `GET /api/public/bugs/[token]` — public bug board data
- `GET·PUT /api/bug-statuses` — configurable statuses
- `GET·PUT /api/bug-fields` — configurable custom fields

### Inbox
- `GET·POST /api/inbox` — feed + mark-seen

### Roadmaps
- `GET·POST /api/roadmaps`
- `GET·PUT·DELETE /api/roadmaps/[roadmap]`
- `GET·POST /api/roadmaps/[roadmap]/items` + `…/items/reorder` + `PUT·DELETE …/items/[item]`
- `GET /api/roadmaps/[roadmap]/minestones` — milestones linked to a roadmap
- `PUT /api/roadmaps/[roadmap]/share`

### Milestones (OKR)
- `GET·POST /api/minestones`
- `GET·PUT·DELETE /api/minestones/[minestone]`
- `GET /api/minestones/[minestone]/roadmaps`

### Admin
- `GET·POST /api/admin/users` + `PUT·DELETE /api/admin/users/[id]`
- `GET·PUT /api/admin/settings`
- `GET /api/admin/archived-projects` + `POST·DELETE …/[project]` (restore / hard-delete)
- `GET·POST /api/api-keys` + `DELETE /api/api-keys/[key]` (revoke)

---

## 6. App pages / screens (~21)

### Authenticated app (`app/(app)/`)
- `/` — **Dashboard** (Roadmaps + Projects grids, profile menu, quick links to Bugs/Milestones/Inbox)
- `/[project]` — project **Report** view (default feature)
- `/[project]/[slug]` — a specific feature **Report**
- `/[project]/summary` — **Feature Summary / Overview**
- `/[project]/roadmap` — the project's **Roadmap tab**
- `/[project]/bugs` — the project's **Bugs tab**
- `/bugs` — global **Bug board**
- `/bugs/[bug]` — **Bug detail** (with Activity)
- `/inbox` — **Inbox**
- `/milestones` — **Milestones** list
- `/milestones/[minestone]` — **Milestone detail** (OKR + Gantt)
- `/roadmaps/[roadmap]` — **Roadmap detail** (board + RICE chart)
- `/admin/people` — **People** management
- `/admin/settings` — **Settings** (webhooks, bug statuses, bug fields, API keys, archive)

### Auth
- `/login` · `/register`

### Public (no login)
- `/public/projects/[token]` — read-only project
- `/public/bugs/[token]` — read-only bug board
- `/public/roadmaps/[token]` — read-only roadmap
- `/public/roadmaps/[token]/[item]` — read-only roadmap item

---

## 7. Cross-cutting capabilities

| Capability | Where it appears |
|---|---|
| **Rich text editing** (Editor.js) | Report sections, bug descriptions, comments |
| **Drag-and-drop reorder** | Sidebar features, roadmap items, bug board columns, report sections |
| **Auto-save** with dirty/saving/saved indicator | Report editing (Topbar save indicator) |
| **Import / Export** | Projects (JSON), test cases (Excel `.xlsx` / JSON), report screenshots |
| **PDF export** | Project → print view (browser print-to-PDF), roadmap print view |
| **Media storage** | Azure Blob (bug attachments, comment images/video, report screenshots) |
| **Pin to top** | Projects and roadmaps on the Dashboard |
| **Soft delete + Archive/restore** | Projects (and roadmaps/milestones use `deletedAt`) |
| **Public read-only links** | Projects, bugs, roadmaps |
| **Notifications** | Lark webhooks (bug created / assigned / comment mention) |
| **Audit history** | Test-case & report field changes (user or API actor) |
| **Assignee filter** | Sidebar filter by assignee within a project |
| **Responsive UI** | App shell, boards, and public views adapt to mobile |

---

## 8. Data migration scripts (5)

Found in `old-report/scripts/` — evidence of the schema's evolution:

| Script | Purpose |
|---|---|
| `migrate-orphan-to-project` | Move orphaned reports under a project |
| `migrate-slug-to-id` | Switch project references from slug to ObjectId |
| `migrate-drop-stale-indexes` | Clean up obsolete Mongo indexes |
| `migrate-testcase-shortids` | Backfill human-friendly test-case short IDs |
| `migrate-testcase-status` | Normalize legacy test-case result values |

> These tell you the product has already migrated: **orphan reports → projects**,
> **slug → id addressing**, and **test cases gained short IDs + normalized results**.
> Keep that history in mind when reasoning about older data.
