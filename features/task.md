# Feature · Tasks (engineering execution on backlog items)

**Status:** ✅ **v1 built** (2026-07-16, approved via discovery checkpoint) — backend `Task` module + Tasks panel on the backlog item + "My Tasks" page. Verified by backend/frontend typecheck + `vite build`; **not yet driven live** (needs Mongo + auth). Deferred items → §5 "Later". Build log in `prompt/2026-07-16_HISTORY.md`.
**Area:** New surface — a `Task` that an engineer writes and **links to a backlog item** (roadmap item)
**Models touched:** **new** `Task` collection · `RoadmapItem.progress` (v1 shows a *computed* rollup; the stored field is untouched) · **reuses** the `IndividualStatus` enum, now generalized to **`TaskStatus`**
**Reference:** `docs/specs/04-roadmaps.md` (backlog items) · `docs/specs/02-bugs.md` (top-level execution item + link pattern) · `docs/01-product-overview.md` (glossary: *backlog item = roadmap item*)

---

## 1. One-liner

Give engineers **the missing "how" layer**: a lightweight **Task** they can write and
**link to a backlog item** (a roadmap item), check off as `todo → in-progress → done`,
and — when linked — have those checkoffs **drive the backlog item's progress** instead of
a manually-typed percentage.

## 2. Why (the problem)

Product OS today wires three layers together — but one is missing:

| Layer | Question it answers | Surface today |
|---|---|---|
| **Plan** | *what & why* are we building? | Roadmap **backlog items** (RICE, Now/Next/Later) |
| **Execution** | ***how* — what's the actual work, who's on it, what's left?** | **❌ nothing** |
| **Verify** | *does it work?* | Test cases · Bugs |
| **Align** | *are we on track?* | OKR milestones |

A backlog item's `progress` is a **manual 0–100 slider** (`RoadmapItemData.progress`) — *no
one's real work moves it*. An engineer looking at **"Passkey login — 40%"** can't tell what's
left, who owns what, or what "40%" even means. The two execution surfaces that exist are both
the wrong shape for this:

- **Bugs** are *reactive* — "something is broken," not "here's what to build."
- **OKR "Individual"** is *outcome/OKR-framed* and is currently **stubbed** — `IndividualStatus`
  (`todo · in-progress · done`) is declared in the codebase but **used nowhere**.

So engineers plan build-work **in their heads or in Jira** — exactly the "scatter across Jira +
Confluence + a spreadsheet" that the product overview says this tool exists to collapse. **Tasks
close that gap on the execution side**, symmetric to how Bugs already close it on the verify side.

## 3. Who it's for / user stories

- *As an **engineer** (`tester` role)*, I can **write a task and link it to a backlog item** so
  the plan has a concrete, checkable to-do list attached — not just a title and a percentage.
- *As an **engineer***, I can open **"My Tasks"** and see everything assigned to me across all
  backlog items, grouped by `todo / in-progress / done`, so I have one queue.
- *As a **PM / owner** (`admin`)*, the backlog item's progress **reflects real work** (tasks done ÷
  total) instead of a number someone typed, so status is honest and I can see what's blocking.
- *As a **stakeholder** (guest / public link)*, I see truthful progress, driven by completed tasks.

## 4. Riskiest assumptions (the discovery lens)

| # | Assumption | Category | Impact | Uncertainty | Design implication |
|---|---|---|---|---|---|
| A1 | **Engineers will actually record tasks here** (not in their head / Jira) | Value | **High** | **High** | Adding a task must be **one inline line** (title only); it must **move the progress the PM already watches** and appear in the engineer's own queue. This is the leap of faith — v1 lives or dies here. |
| A2 | Progress computed from tasks beats the manual slider | Value | High | Med | Keep the manual override in v1 (reversible); don't rip out the slider until dogfood proves the rollup. |
| A3 | A tasks panel on the backlog item is discoverable, not buried | Usability | Med | Med | Put it **directly in the item detail** (where engineers already open the item), plus a top-level "My Tasks". |
| A4 | `todo / in-progress / done` is enough (no full Jira workflow) | Usability | Med | Low | Reuse `IndividualStatus`; resist configurable statuses in v1. |
| A5 | A `Task` collection fits the existing patterns cleanly | Feasibility | High | **Low** | Mirror **Bug**: a top-level entity that flat-links via `id + label + parentId`. Proven. |

**How we'll de-risk (lightweight, internal tool):** dogfood on **one real backlog item for a week** —
success = tasks get added and checked off *without anyone being told to*, and the item's progress
tracks reality. No fake-door needed on a tool we control.

## 5. Scope

### ✅ Must-have now (v1)
1. **`Task` entity** — a top-level collection (symmetric to `Bug`) with: `title` (required),
   `description` (optional), `status` (**reuse `IndividualStatus`**: `todo · in-progress · done`),
   `assignee`, optional `dueDate`, and a `shortId` (`T-XXXXX`).
2. **Link to a backlog item** — every task links to exactly one **roadmap item** via the proven
   flat pattern (`roadmapItemId` + denormalized `roadmapItemLabel` + parent `roadmapId`/`projectId`).
3. **Tasks panel on the backlog item** — inside the roadmap item detail (`RoadmapItemDialog`): add a
   task inline (title → Enter), toggle status, assign, delete. Adding here **auto-fills the link**.
4. **"My Tasks" view** — a list of tasks assigned to me, grouped by status; and assigned tasks
   surface in the **Inbox** (mirror `InboxKind.ASSIGNED_BUG` → add `ASSIGNED_TASK`).
5. **Progress rollup** — a backlog item shows *tasks done ÷ total*; this **can drive**
   `RoadmapItem.progress` (with a manual-override escape hatch — see §11).

### 🔜 Later (nice-to-have, not v1)
- **Priority** and **estimate/effort** fields on a task.
- **Activity thread on a task** (reuse the existing bug comment thread once backlog/Activity wiring lands — the model already anticipates this).
- **Sub-tasks / checklist** inside a task; **dependencies** (blocks / blocked-by).
- ~~**Unlinked personal tasks** (a task with no backlog item) for quick capture.~~ ✅ **shipped** — the "New task" button on `/tasks` creates a task with an **optional** backlog-item link (roadmap-item picker), auto-assigned to you.
- **Link a task to a bug** (this task fixes that bug) — the reverse of today's bug→case link.
- **Board view** of a backlog item's tasks (todo/in-progress/done columns).

### ❌ Out of scope
- Configurable task statuses / custom workflow (bugs have configurable statuses; tasks stay the fixed 3).
- Sprints, story points, burndown, time tracking.
- Replacing the OKR **Individual** concept — see §11; v1 does **not** merge them.

## 6. The `Task` — target data model

Flat fields (per project rule: no nested link object — denormalize the label, like `Bug.caseLabel`):

| Field | Type | Notes |
|---|---|---|
| `id` | string | — |
| `shortId` | string | `T-XXXXX`, human id (same convention as `Bug.shortId` / `TC-XXXXX`) |
| `tenantId` | string | — |
| `title` | string | **required** — the one line of work |
| `description` | string | optional details/notes |
| `status` | enum | **`IndividualStatus`**: `todo` \| `in-progress` \| `done` (reused, not new) |
| `roadmapItemId` | string | **the linked backlog item** |
| `roadmapItemLabel` | string | denormalized, e.g. `"Now · Passkey login"` (like `Bug.caseLabel`) |
| `roadmapId` | string | parent roadmap the item belongs to |
| `projectId` | string | from the roadmap/item (roadmaps carry `projectId`) |
| `assigneeId` | string | who's on it |
| `assigneeName` | string | denormalized (like `Bug.assigneeName`) |
| `createdBy` | string | author (the engineer) |
| `dueDate` | string | optional |
| `order` | number | position within its status group |
| `createdAt` / `updatedAt` | Date | — |

**Backlog-item rollup:** `progress = round(doneTasks / totalTasks × 100)` for a roadmap item, derived
from its linked tasks — mirrors how OKR **Individual → Key Result** already rolls up (`avgProgress`).

## 7. UX / UI details (responsive)

- **Tasks panel** lives in the roadmap **item detail** (`RoadmapItemDialog`) as a compact section
  below the fields: a one-line **"+ Add task"** input (title → Enter creates), then rows with a
  **status pill** (the shared `Select` — never a native `<select>`), **assignee** (reuse the bug
  assignee people-picker), optional due date, and a delete affordance. Empty state:
  *"No tasks yet — add the first piece of work."*
- **"My Tasks"** is a top-level list (its own nav item under **Product Delivery** — the engineer/
  build side of the sidebar), grouped by `todo / in-progress / done`, each row showing the task + its
  **backlog-item chip** (click → opens that item). Reuse the Inbox/list layout so it feels native.
- **Status vocabulary & colour** reuse existing tokens — `todo / in-progress / done` should read like
  the rest of the app (muted → accent → success). **No new brand colours are introduced**; if a
  distinct task-status palette is ever wanted, that's an owner decision first (project colour rule).
- **Responsive:** the item dialog goes **full-width / bottom-sheet on mobile**; task rows stack
  (status + assignee wrap under the title) rather than squashing; "My Tasks" is a single scrollable
  column on small screens (same rules as the test-case table & dialogs).
- **i18n:** every label ("Add task", "My Tasks", "Assign", "Due", empty states) goes through `i18n/en.ts`.

## 8. Implementation notes (build phase — reference only)

- **Backend** — new module `backend/src/application/tasks/` following the existing
  `domain / dtos / mappers / repositories / use-cases` layout (copy the **bugs** module as the
  template — closest analog). Reuse `IndividualStatus` for `Task.status` (do **not** declare a new
  status enum). Endpoints mirror bugs: list/create/update/delete + list-by-`roadmapItemId` + list
  assigned-to-me. The roadmap-item progress rollup is a derived read (compute from linked tasks).
- **Frontend**
  - `frontend/src/types/enums.ts` — `IndividualStatus` already exists (todo/in-progress/done); add an
    `INDIVIDUAL_STATUSES` array + `_LABEL`/`_COLOR` maps if not present, reusing existing colour tokens.
  - `frontend/src/types/dto.ts` — add the flat `Task` interface (§6).
  - `frontend/src/features/tasks/` — new feature (`api.ts`, `MyTasksPage.tsx`, `components/TaskRow.tsx`,
    `components/TaskList.tsx`), built on the shared UI primitives (`Dialog`, `Select`, `Input`,
    `Button`, `Field`) — same abstraction layer as the roadmaps/bugs features.
  - `frontend/src/features/roadmaps/components/RoadmapItemDialog.tsx` — add the **Tasks panel** and the
    progress rollup readout.
  - **Inbox** — add `InboxKind.ASSIGNED_TASK` (mirrors `ASSIGNED_BUG`) so assignment notifies.
- **Permissions** — create/edit = `admin` + `tester` (writers); `guest`/public read-only. Same rule as bugs.
- **Enums must match** frontend ↔ backend (project rule) — reusing `IndividualStatus` keeps them aligned by construction.

## 9. Data model impact

- **New collection** `Task` — additive; no change to existing documents.
- `RoadmapItem.progress` stays a stored field; the rollup is layered **on top** (computed value shown;
  manual value retained as fallback/override — see §11). **No migration**; existing roadmap items with
  no tasks render exactly as today (0 tasks → rollup shows the manual value).

## 10. Acceptance criteria

- [ ] From a backlog item, I can add a task with just a title; it persists and shows in the item's Tasks panel.
- [ ] The task carries the link back to its backlog item (`roadmapItemId` + a readable `roadmapItemLabel`); opening the item shows its tasks.
- [ ] I can set status `todo / in-progress / done` and assign a teammate; both persist.
- [ ] "My Tasks" shows every task assigned to me, grouped by status, each linking back to its backlog item.
- [ ] Assigning a task to someone surfaces it in their Inbox (like an assigned bug).
- [ ] A backlog item shows *N of M tasks done*; completing tasks moves that number (and, if enabled, its progress bar).
- [ ] Guests/public can read tasks but not edit; testers/admins can.
- [ ] Tasks panel and "My Tasks" are usable on mobile (bottom-sheet dialog; stacked rows).
- [ ] No new brand colours introduced without approval; statuses reuse existing tokens.

## 11. Open decisions for the owner

1. **What is a "backlog item"?** — This spec reads it as a **roadmap item**, per the product's own
   glossary (*"Roadmap — a board of backlog items"*) and Spec 04 (*"Roadmap items (backlog items)"*).
   ✅ Recommended. Redirect here if you meant something else (e.g. an OKR Key Result, or a bug).
2. **Task storage — own collection vs. embedded?** — Recommend a **top-level `Task` collection**
   (symmetric to `Bug`), because you asked for a *place* engineers write tasks and a **"My Tasks"**
   queue — hard to do if tasks are buried inside each roadmap document. The simpler alternative is
   **embedding `tasks[]` on the roadmap item** (like test cases in a report) — lighter, but no easy
   cross-item "My Tasks". *Recommend: top-level collection.*
3. **Does completing tasks drive backlog-item progress?** — Recommend **yes, computed** (done ÷ total),
   but **keep the manual slider as an override** in v1 so nothing surprising happens to existing
   roadmaps. Switch fully to computed later once dogfooded. *(Ripping out manual now = irreversible surprise; deferring is safe.)*
4. **Task vs. OKR "Individual"** — both are "checkable work" with the *same* status values, but different
   parents (Task → backlog item; Individual → Key Result). v1 keeps them **separate** and just **shares
   the `IndividualStatus` enum**. If you'd rather unify them under one "work item" concept later, that's a
   bigger refactor — flag it and we'll plan it. *Recommend: separate for v1.*
5. **Status enum name** — reusing `IndividualStatus` for a `Task` reads slightly oddly. Option to rename
   it to a neutral `TaskStatus` / `WorkStatus` shared by both. Cosmetic; safe to defer. *Recommend: reuse as-is for v1.*

---

*Convention: follows the `features/*.md` PRD style (`test-case-selections.md`). Once approved, the build
follows the framework in `CLAUDE.md` (staged, reviewable, tested), reusing the UI abstraction layer,
the query pattern, existing enums, and i18n.*
