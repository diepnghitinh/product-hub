# Spec 02 · Bugs

A Kanban bug tracker with severity, **admin-configurable statuses**, **admin-defined
custom fields**, attachments, and links to test cases.

Models: `Bug`, `AppSettings` (statuses + fields), `BugShare` (public link).
Screens: `/bugs` (global board), `/[project]/bugs` (project tab), `/bugs/[bug]` (detail).
Components: `BugBoard`, `KanbanBoard`, `CreateBugModal`, `ManageStatusesModal`, `ManageFieldsModal`.

---

## 1. What a bug is

An issue with a title/description, a **severity**, a **status** (config-driven),
a **test type**, an assignee and reporter, optional images/attachments, links to the
test cases it came from, and values for any admin-defined custom fields.

### Fields (`BugDTO`)
| Field | Type | Notes |
|---|---|---|
| `id` | string | Mongo id. |
| `shortId` | string | Human id (e.g. shown as the public/link handle). |
| `title`, `desc` | string | `desc` is rich (Editor.js). |
| `status` | string key | A key from the configurable status set (default `open`). |
| `severity` | enum | `low` \| `medium` \| `high` \| `critical` (default `medium`). |
| `type` | enum | One of the 9 test types (default `Functional`). |
| `assigneeId`, `reporterId` | string | User references. |
| `imageUrls[]` | string[] | Inline images. |
| `attachments[]` | object[] | `{ url, name, originalName, size, contentType, uploadedAt }` in Azure Blob. |
| `cases[]` | object[] | `{ projectId, caseId }` — the test case(s)/project this bug relates to. |
| `customFields` | map | Keyed by field id → string (text/single) or string[] (multi-select). |
| `order` | number | Position within its status column. |
| `createdAt`, `updatedAt` | date | Timestamps. |

---

## 2. The board (Kanban)

- Columns are the **configured statuses**, in their configured order, each rendered with its color.
- Cards can be **dragged between columns** (changes status) and **reordered within a column** (`order`).
- The board exists in two scopes:
  - **Global** `/bugs` — all bugs.
  - **Project** `/[project]/bugs` — bugs linked to that project (via `cases[].projectId`).
- `GET /api/bugs/counts` powers per-status counters.

---

## 3. Severity

Fixed 4-level scale: `low · medium · high · critical`. Rendered as a colored badge.
This is a hardcoded enum (`BUG_SEVERITIES`) — not configurable.

---

## 4. Statuses (configurable)

Bug statuses are **data, not code** — stored in `AppSettings.bugStatuses` and edited by
admins (`ManageStatusesModal`, `GET·PUT /api/bug-statuses`).

### Built-in defaults (`DEFAULT_BUG_STATUSES`)
| Key | Label | Color |
|---|---|---|
| `open` | Open | `#1d4ed8` |
| `in-progress` | In progress | `#f59e0b` |
| `in-review` | In review | `#6d56d8` |
| `resolved` | Resolved | `#16a34a` |
| `closed` | Closed | `#71717a` |

### Rules
- A status is `{ key, label, color, order, builtin }`.
- The 5 built-ins can be **renamed, recolored, reordered** but **not deleted**.
- Admins can **add** their own statuses.
- `Bug.status` is a free string key, so the app stays robust if a status is renamed
  (the key is stable; the label/color are looked up from config).
- Until an admin first saves, the API serves the defaults.

---

## 5. Custom fields (configurable)

Admins can attach extra fields shown on every bug (`AppSettings.bugFields`,
`ManageFieldsModal`, `GET·PUT /api/bug-fields`).

- A field is `{ id, label, type, options[], multiple, order }`.
- **Types:**
  - `text` — free-text box.
  - `dropdown` — single-select, or **multi-select** when `multiple: true` (renders as checkboxes). Each option has its own color: `{ id, label, color }`.
- Values are stored in `Bug.customFields`, keyed by field id: a **string** (text or a single option id) or a **string[]** of option ids (multi-select).

> This is how the team adds things like "Environment found", "Browser", "Squad", or a
> "Root cause" dropdown without a schema change.

---

## 6. Test-case & project links

A bug's `cases[]` is a list of `{ projectId, caseId }`:
- Links the bug to the **project(s)** it belongs to (drives the project bug tab).
- Optionally pins the exact **test case** that surfaced it (`caseId` may be empty for a
  project-only link).
- `bugLookup.ts` / `testCaseLookup.ts` resolve these references for display.

---

## 7. Attachments & media

- **Attachments** — uploaded via `POST /api/bugs/[bug]/attachments` to Azure Blob; each keeps `originalName`, `size`, `contentType`, and its blob `name` for later deletion.
- **Images** — `imageUrls[]` for inline screenshots; the detail view has an image lightbox.
- Comment media is separate — see [`03-activity-and-inbox.md`](./03-activity-and-inbox.md).

---

## 8. Lifecycle & actions

| Action | Endpoint | Notes |
|---|---|---|
| Create | `POST /api/bugs` | Via `CreateBugModal`; can pre-link a project/test case. Fires `bugCreated` webhook. |
| Read | `GET /api/bugs/[bug]` | Detail view with Activity. |
| Update | `PATCH /api/bugs/[bug]` | Status, severity, assignee, fields, order… Reassignment fires `bugAssigned` webhook. |
| Delete | `DELETE /api/bugs/[bug]` | Removes the bug. |
| Counts | `GET /api/bugs/counts` | Column counters. |
| Public share | `POST /api/bugs/share` | Toggles the single global public board. |

Writes go through raw collection updates in the API to stay robust against a stale
cached Mongoose schema (same pattern as reports).

---

## 9. Notifications

If a Lark webhook is configured and enabled (Admin → Settings):
- **Bug created** → posts a message with title, severity, type, status, reporter, assignee, and a link.
- **Bug (re)assigned** → pings the new assignee (real `@` if they have a Lark mapping).
- **Comment @-mention** → see Activity spec.

Each event has its own on/off toggle per channel. Webhook failures never block the bug
operation. See [`08-admin-settings-and-webhooks.md`](./08-admin-settings-and-webhooks.md).

---

## 10. Public bug board

The global board can be exposed read-only at `/public/bugs/[token]`:
- Controlled by the singleton `BugShare` (`scope: 'global'`, `token`, `enabled`).
- Toggling `enabled` on/off (or rotating the token) grants/revokes access.
- The public view (`PublicBugBoard`) is read-only — no create/edit/drag.
