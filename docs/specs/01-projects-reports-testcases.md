# Spec 01 · Projects, Reports & Test Cases

The core of the product: a **project** contains **groups** of **feature reports**;
each report is a sectioned document, and its **testing** sections hold **test cases**.

Models: `Project`, `Group`, `Report` (+ embedded sections/cases), `AuditLog`.
Screens: Dashboard, `/[project]`, `/[project]/[slug]`, `/[project]/summary`.

---

## 1. Projects

### What a project is
A workspace that groups feature reports, owned by a creator, optionally shared with
members, taggable by environment, and optionally exposed via a public read-only link.

### Fields (`ProjectDTO`)
| Field | Type | Notes |
|---|---|---|
| `id` | string | Mongo ObjectId — the canonical address in URLs. |
| `slug` | string | Legacy human slug (unique). Freed on archive. |
| `title`, `subtitle` | string | Display. |
| `generated`, `owner` | string | Header meta ("Generated … · Owner: …"). |
| `defaultSlug` | string | Which feature opens by default. |
| `createdBy` | string | Creator identity (email/name/id). Drives ownership. |
| `sharedWith` | string[] | User ids granted edit access. |
| `pinned` | boolean | Pins the card to the top of the Dashboard. |
| `publicEnabled` + `publicToken` | boolean + string | Read-only public link. |
| `environment` | enum | `development` \| `staging` \| `production`. |

### Behaviours
- **Create** — `+ Project` on the Dashboard (writers only) → prompts for a title → opens the new project.
- **Import** — `↥ Import` accepts a JSON project export (`lib/importProject.ts`) and recreates it.
- **Duplicate** — deep-copies the project with all groups, reports, and cases (`/duplicate`). New case ids are minted so public-API updates never bleed across copies.
- **Rename / Pin / Set environment** — inline from the project card kebab menu.
- **Archive (soft delete)** — sets `deletedAt`, renames the slug to `__deleted__…` to free it, and hides it from all normal queries. Restorable by an admin in **Settings → Archive**; can be permanently deleted there.
- **Export** — from the project Topbar: **Export project** (JSON) and **Export PDF** (browser print of the print view).
- **Share** — members + public link (see [`06-public-sharing.md`](./06-public-sharing.md)).

### Dashboard card
Each project card shows: title, subtitle, environment badge, a **progress bar**
(`done / total` reports), **status pills** (done / testing / info counts), owner, and
"Updated … ago". Pinned projects sort first, then by most-recently-updated.

---

## 2. Groups

A **group** is a titled section in the project sidebar (e.g. "1 · Auth", "Billing").

- Fields: `projectId`, `slug`, `title`, `order`. `(projectId, slug)` is unique.
- Admins can **add / rename / remove** groups from the sidebar; removing a group deletes its features too (confirmed dialog).
- Groups are **collapsible** and remember their collapsed state per-user (localStorage).
- The sidebar is **resizable** (drag handle, 200–560px, persisted).

---

## 3. Reports (features)

A **report** is one feature's page. In the sidebar it appears as a menu **item**
(label + short id + a status dot); the page itself is the report.

### Fields (`ReportDTO`)
`slug, title, subtitle, groupSlug, label, featureId, module, statusVariant, reported, owner, sections[]`.
Plus `order` for sidebar position.

### Status (`statusVariant`)
| Value | Meaning | Dashboard rollup |
|---|---|---|
| `testing` | Under test | counts toward "testing" |
| `done` | Complete | counts toward "done" (drives the progress bar) |
| `info` | Informational / not a testable feature | counts toward "info" |

### Behaviours
- **Add feature** — from a group in the sidebar (admins) → prompts for a label → creates an empty report and opens it.
- **Import feature** — import a single feature from a JSON file into a chosen group.
- **Duplicate feature** — copies a report under a new label.
- **Rename / Remove** — inline sidebar actions (admins). Removing deletes the report.
- **Reorder** — drag-and-drop features within/between groups (admins; disabled while an assignee filter is active).
- **Edit** — sectioned editing with auto-save (see Architecture §7). Testers are limited to status + testing sections.

---

## 4. Report sections (the document body)

A report's `sections[]` is an ordered, heterogeneous list. **7 section types**:

| Type | Shape | Renders as |
|---|---|---|
| `overview` | `title`, `paragraphs[]` | Intro prose block. |
| `screenshot` | `title`, `images[] {src, alt, caption}` | Image gallery (with lightbox); images uploaded to Azure Blob via `…/screenshots`. |
| `cards` | `title`, `intro?`, `cards[] {name, desc}` | Grid of labeled cards. |
| `steps` | `title`, `steps[] {num, name, desc}` | Numbered step-by-step. |
| `bullets` | `title`, `intro?`, `items[]` | Unordered list. |
| `ordered` | `title`, `intro?`, `items[]` | Ordered list. |
| `testing` | `title`, `banner {title, description}`, `coverage[]`, `cases[]` | **The QA block** — coverage bars + a test-case table. |

Rich content is edited with **Editor.js** (headers, lists, tables, code, images, markers…).

---

## 5. Feature Summary / Overview (`/[project]/summary`)

A project-wide rollup across all reports:
- Aggregate **status counts** (done / testing / info) and completion %.
- A scannable list/table of features with their status.
- Acts as the project's "executive summary" tab (`FeatureSummary.tsx`).

---

## 6. Test cases

Test cases live **inside** a report's `testing` section (`TestingSection.cases[]`) — they
are not a separate collection. This keeps a feature's test evidence next to its spec.

### Fields (`TestCase`)
| Field | Notes |
|---|---|
| `id` | Internal UUID (minted on create/import). |
| `shortId` | Human-friendly id shown in the UI and usable in the public API. |
| `area` | What's being tested (required-ish; the "title"). |
| `type` | One of the 9 **test types** (below), or empty. |
| `result` | One of the 6 **test results** (below). |
| `owner` | Tester name (optional). |
| `precondition`, `testSteps[]`, `expectedResult`, `actualResult`, `note` | Optional detail. |

### Test types (9)
`Functional · UI · API · Integration · Performance · Security · Regression · Accessibility · Other`

### Test results (6)
`Passed · Failed · Blocked · Retest · Skipped · Untested`

### Coverage
Each testing section also has `coverage[] { label, percent }` — labeled progress bars
(e.g. "Happy path 90%", "Edge cases 40%") shown above the case table.

---

## 7. Importing test cases

`lib/parseTestCases.ts` + `ImportTestCasesModal.tsx` support **Excel (`.xlsx`) and JSON**.

### How it parses
- **Excel**: reads the first sheet. If the header row matches known column names it maps by header; otherwise it falls back to fixed column order (Area, Type, Result, Owner, Precondition, Steps, Expected, Actual, Note).
- **JSON**: accepts a top-level array, or an object wrapping `cases` / `testCases` / `rows`, or a single case object.
- **Fuzzy mapping** — headers, types, and results are normalized through alias tables. Examples:
  - Header aliases: `feature/scenario/case/title → area`, `status → result`, `assignee/tester → owner`, `expected/expectation → expectedResult`, `steps/test step → testSteps`.
  - Type aliases: `function/feature → Functional`, `e2e/end-to-end → Integration`, `perf/load/stress → Performance`, `a11y → Accessibility`, `smoke → Regression`.
  - Result aliases: `pass/ok/success/done → Passed`, `fail → Failed`, `na/n/a → Skipped`, `pending/todo/wip/in progress → Untested`, `reopen → Retest`.
- **Steps** split on newlines, `|`, or `1. 2. …` numbering.
- Fully-blank rows are **skipped** and counted; every imported case gets **fresh** `id` + `shortId` (incoming ids are ignored).
- The modal reports `{ imported, skipped, totalRows }`.

### Templates
The app can generate a starter **Excel** template and a starter **JSON** template
(`buildTemplateBlob`, `buildTemplateJson`) with example rows, so users know the shape.

---

## 8. Updating results (UI + API + History)

- In the UI, a case's **result** is a dropdown; changing it marks the report dirty and auto-saves.
- Externally, the **public test-case API** can set a case's result (see [`07-api-keys-and-audit-log.md`](./07-api-keys-and-audit-log.md)).
- **Every result change is audited** (`AuditLog`): old→new value, who (user or API key), when. Viewable via the project **History** dialog and `GET …/audit-log`. A no-op change (same value) is intentionally *not* logged, so polling CI doesn't spam History.

---

## 9. Notable rules & edge cases

- **Case ids are copied on project/feature duplication**, but result-updates are project-scoped, so an update to a case in one copy never affects the same-id case in another.
- **Testers can't rewrite narrative sections** — only testing sections + status (RBAC §3 in roles doc).
- **Reports store `sections` as Mixed** — some writes go through the raw Mongo collection to avoid stale schema caching; keep that in mind when adding section types.
- **Assignee filter** (sidebar) narrows the feature list to those with matching test-case owners; while active, drag-reorder and the add-row are disabled to avoid confusing indices.
