# 02 · Architecture

A technical map of how the product is built. Written for someone who will extend
or rebuild it.

---

## 1. Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | **Next.js 15** (App Router) | Server + client components; API routes under `app/api/*`. |
| UI runtime | **React 19** (RC) | Client components for interactive screens. |
| Language | **TypeScript 5.6** | Shared domain types in `types/index.ts`. |
| Database | **MongoDB** via **Mongoose 8** | 13 models in `models/`. |
| Auth | **NextAuth 5 (beta.25)** | JWT sessions, Credentials provider. |
| Styling | **Tailwind CSS 3** + SCSS | Plus a `components/ui/` primitive layer (Radix-based). |
| Rich text | **Editor.js** | Header, list, table, image, code, marker, etc. |
| Object storage | **Azure Blob** (`@azure/storage-blob`) | Attachments, comment media, screenshots. |
| Spreadsheets | **`xlsx`** | Test-case import/export + template generation. |
| Passwords | **bcryptjs** | `passwordHash` on `User`. |
| Notifications | **Lark** (Feishu) webhooks | Outbound `fetch` from `lib/webhook.ts`. |
| Deploy | Docker (`Dockerfile`, `Dockerfile.arm64`, `docker-compose.build.yml`) | Build-and-push script for a `dnt-testing` image. |

---

## 2. Directory layout (`old-report/`)

```
app/                Next.js routes
  (app)/            authenticated app screens (grouped, no URL segment)
  api/              49 API route modules
  public/           unauthenticated read-only share pages
  login/ register/  auth pages
components/          ~55 React components
  ui/               primitive layer (button, dialog, input, label, select, textarea)
context/            React providers (DataContext, AssigneeFilter, PublicDataProvider)
hooks/              useRole, useUsers
lib/                server/domain logic (auth, db, rbac, webhook, importers…)
models/             13 Mongoose schemas
types/              shared TypeScript types + enums (index.ts is the source of truth)
scripts/            5 data migrations + seed
features/           product intent notes + design mockups (not shipped code)
middleware.ts       NextAuth route protection
data.json           seed content for the default "hwave" project
```

---

## 3. Domain model (how the data connects)

```
User ──creates──> Project ──has──> Group ──contains──> Report ──embeds──> Section[]
                    │                                                       └─ testing → TestCase[]
                    ├─ sharedWith[] (member ids)                                        │
                    ├─ publicToken (read-only link)                                     │
                    └─ environment                                       AuditLog <─────┘ (result changes)

Bug ──links──> BugCaseRef { projectId, caseId }        (a bug references test cases / a project)
 │  └─ customFields (keyed by AppSettings.bugFields)
 │  └─ status (keyed by AppSettings.bugStatuses)
 └─ Activity (1-1) ──has──> Comment[] (mentions[], images[])

Roadmap ──has──> RoadmapItem[] (phase, RICE)      Minestone ──has──> Objective[] → KeyResult[] → Individual[]
 └─ projectIds[] (links to projects)               └─ roadmapIds[] (links to roadmaps)

AppSettings (singleton) ── webhooks[] · bugStatuses[] · bugFields[]
ApiKey (global) ──authorizes──> public test-case API ──writes──> AuditLog (actorType: 'api')
```

### Key relationships & rules

- **Project → Report** is 1-to-many; a report belongs to exactly one project (`projectId`) and one group (`groupSlug`). `(projectId, slug)` is unique.
- **Report → Section[]** is stored as a **Mixed** array (a heterogeneous tree). Test cases are embedded inside `testing` sections, not their own collection.
- **Bug → test cases** is a soft reference via `cases[]` of `{ projectId, caseId }`. Deleting a case doesn't cascade.
- **Bug status & custom fields are config-driven** — the valid statuses and fields live in the `AppSettings` singleton, so `Bug.status` is a free string key, and `Bug.customFields` is a Mixed map keyed by field id.
- **Soft delete**: `Project`, `Roadmap`, `Minestone` use `deletedAt` + a Mongoose `pre` hook that auto-excludes deleted docs from every `find`. Archiving a project sets `deletedAt` and frees its slug (renamed to `__deleted__…`).
- **Short IDs**: bugs and test cases carry human-friendly short IDs alongside their Mongo/UUID ids (see `lib/ids.ts`).

---

## 4. Information architecture (routing)

Two route groups plus public:

- **`app/(app)/…`** — everything behind auth. The `(app)` folder is a route group, so it adds no URL segment; `app/(app)/page.tsx` is the Dashboard at `/`.
- **Project shell** — `app/(app)/[project]/layout.tsx` wraps project screens in `DataProvider` + `AssigneeFilterProvider` + `AppShell` (sidebar + topbar). Project tabs: **Report**, **Overview**, **Roadmap**, **Bugs** (see `Topbar.tsx`).
- **`app/public/…`** — tokenized read-only pages, allowed through by middleware.

**Project addressing uses the Mongo `id`**, not the slug (a migration moved off slugs). URLs look like `/{projectId}/{reportSlug}`.

---

## 5. Auth & access control

- **Session:** JWT (`lib/auth.config.ts`). The token carries `id` and `role`; the session exposes them to the client via `useRole()`.
- **Provider:** Credentials (email + password, bcrypt-checked in `lib/auth.ts`).
- **Route protection:** `middleware.ts` runs NextAuth's `authorized` callback on every non-asset path. It allows `/login`, `/register`, `/api/auth/*`, `/api/register`, and anything under `/public/` or `/api/public/`; everything else requires a signed-in user.
- **Role gates:** UI reads `useRole()` (`isAdmin`, `isTester`, `canWrite = admin|tester`). Server routes re-check the session role and project access.
- **Project-level access:** `lib/projectAccess.ts` — a non-admin can edit a project if they **created it** (`createdBy` matches email/name/id) or it's **shared with them** (`sharedWith` includes their id). Guests never edit. Only admins or the creator can manage sharing.
- **Report field-level RBAC:** `lib/rbac.ts` — admins may edit all report fields; **testers may only change `statusVariant` and the `testing` sections** (their edits to other sections are merged out).
- **API-key auth:** the public test-case API accepts `Authorization: Bearer hw_…`; any non-revoked key is valid, and the target project comes from the URL (`lib/apiKeys.ts`).

See [`03-roles-and-permissions.md`](./03-roles-and-permissions.md) for the full matrix.

---

## 6. Storage & media

- **Azure Blob** (`lib/azureBlob.ts`) stores bug attachments, comment images/video, and report screenshots. Each stored object keeps its blob `name` (folder/key) so it can be deleted later. Comment "images" also carry short video clips (distinguished by `contentType`).
- **MongoDB** stores everything else, including the reports' section trees.

---

## 7. The editing & save model

Report editing is **optimistic + auto-saving**, coordinated by `context/DataContext.tsx`:

- Edits mark a report **dirty** (`dirtySlugs`).
- A save indicator in the `Topbar` shows `idle → pending → saving → saved` (or `error`), with the last-saved time.
- Sidebar and section reordering are drag-and-drop and persist via reorder endpoints.
- A **dirty dot** warns of unsaved changes next to the role badge.

Reports are edited section-by-section with Editor.js; the whole `sections` array is
persisted through raw collection writes in some paths to sidestep Mongoose's cached
Mixed schema (a deliberate pattern noted throughout the code).

---

## 8. Seeding & bootstrapping

- `lib/seed.ts` (`ensureSeeded`) runs once: if the DB has no projects/groups/reports, it imports `data.json` into a default project (slug `hwave`) and creates its groups + reports.
- A first **admin** is created from env vars `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` / `SEED_ADMIN_NAME` if none exists.
- `AppSettings` is a lazy singleton (`getAppSettings` upserts it).

---

## 9. Conventions (from `CLAUDE.md` + observed code)

- **Reuse enums** from `types/index.ts` — search before adding a new one.
- **Flat API response interfaces** — the DTO includes nested fields inline rather than referencing sub-interfaces.
- **UI abstraction layer** — build on `components/ui/*` (button, dialog, input, label, select, textarea).
- **Design reference** — mirror the established patterns; keep the Linear dark aesthetic.
- **Responsive first** — every generated screen must work on mobile.
- **Prompt history** — daily prompts are logged to `prompt/yyyy-mm-dd_HISTORY.md`.
- **Denormalize display names** — `authorName`, `actorName`, `apiKeyName` are snapshotted so threads/logs stay readable after a rename or revoke.
- **Config over enums for user-facing taxonomies** — bug statuses and custom fields are admin-editable data, not hardcoded lists.
