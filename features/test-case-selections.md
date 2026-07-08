# Feature · Test-case selections (UX & UI)

**Status:** Proposed — awaiting owner approval before build
**Area:** Reports → Testing section → test-case table
**Models touched:** `TestCase` (embedded in `Report.sections[].cases[]`) — no migration needed
**Reference UX:** `old-report` (`components/Sections.tsx` testing table + case-detail modal)

---

## 1. One-liner

Make each test case's **selectable fields** — the small dropdowns/pickers on a
case row — match the richer UX/UI of the old report, and add **UX** as a first-class
test **type** alongside the existing **UI** type.

## 2. Why (the problem)

Today a test case in Product OS (`TestingTable.tsx`) exposes four selections per row:

| Selection | Control today | Gap vs. old report |
|---|---|---|
| **Area** | free-text input | ok |
| **Type** | dropdown over 9 types | **no "UX"** — testers can't distinguish a *user-experience* concern (flow, copy, friction) from a *visual* **UI** concern (spacing, colour, alignment) |
| **Owner** | free-text input | old report used a **people picker** (known users + "Unassigned"), so owners stay consistent and filterable |
| **Result** | coloured dropdown | ok |

And the old report let a tester open a **case detail** (precondition, steps, expected,
actual, note) — those fields already exist on our `TestCase` model but there is **no UI
to edit them yet**. So testers currently record *what* passed/failed but not *how* it was
tested or *what actually happened*.

The headline ask: **"selections within a test case like UX/UI"** → add **UX** so a case
can be tagged as a UX concern, and bring the case selections up to old-report parity.

## 3. Who it's for / user stories

- *As a tester*, I can tag a case as **UX** or **UI** so design/flow bugs are separated from visual bugs and can be filtered and reported on.
- *As a tester*, I can pick a case **Owner** from my teammates instead of retyping a name, so ownership is consistent.
- *As a tester*, I can open a case and fill in **precondition, steps, expected, actual, note**, and attach a **screenshot** (stored in Azure), so the evidence lives next to the result.
- *As a reporter/PM*, coverage and result roll-ups stay accurate because the type vocabulary is controlled (a fixed enum), not free text.

## 4. Scope

### ✅ Must-have now (v1)
1. **Add `UX` test type** alongside `UI` (10 types total). Appears in the Type dropdown and in Excel/JSON import mapping.
2. **Owner picker** — swap the free-text owner input for a people dropdown (known project users + "— Unassigned —"), preserving any legacy free-text value as a read-only "(not a user)" entry, exactly like the old report's `OwnerSelect`.
3. **Case detail editor** — a dialog opened from the row (chevron/"Edit detail") to edit the already-modelled fields: `precondition`, `testSteps[]`, `expectedResult`, `actualResult`, `note`. Image evidence uploads to **Azure Blob** (same store the app uses for report screenshots & bug attachments).

### 🔜 Later (nice-to-have, not v1)
- **Per-type colour** chips on the Type dropdown (old report styled each type with a `type-{slug}` colour). Needs a `TEST_TYPE_COLOR` map + a colour chosen for UX.
- **Drag-to-reorder** cases within a section.
- **Case ↔ Bug linkage** cell (count of bugs raised from a case + "raise bug" shortcut).
- **Move case** to another feature/group.

### ❌ Out of scope
- Turning test cases into their own collection (they stay embedded in the report's testing section — see `docs/specs/01`).
- Changing the **Result** vocabulary or the public result-update API.

## 5. The selections — target spec

Row controls, left→right (mirrors old report, minus the "later" items):

| Field | Control | Values / source | Notes |
|---|---|---|---|
| `shortId` | read-only mono text | auto (`TC-XXXXX`) | click-to-copy (nice-to-have) |
| `area` | text input | free text | the case "title"; required-ish |
| `type` | **dropdown** | `Functional · UI · **UX** · API · Integration · Performance · Security · Regression · Accessibility · Other` + a "Clear" option | controlled enum; empty allowed |
| `owner` | **people dropdown** | project users + "— Unassigned —" | preserves unknown legacy value as "(not a user)" |
| `result` | coloured dropdown | `Passed · Failed · Blocked · Retest · Skipped · Untested` | unchanged; every change is audited |

**Detail editor** (dialog), all optional and already on the model:
`precondition` · `testSteps[]` · `expectedResult` · `actualResult` · `note` · **image evidence → Azure Blob**.

### Where UX sits in the type list
Insert **UX** immediately after **UI** so the two "surface" concerns read together:
`Functional, UI, UX, API, Integration, …`.

## 6. UX / UI details (responsive)

- **Inline selects stay compact** — `h-8`, min-width per column, consistent with the current table.
- **Type dropdown** uses our shared `Select` primitive; UX appears automatically once added to `TEST_TYPES`.
- **Owner picker** uses the shared `Select`/dropdown primitive with a search-free list (small teams); "— Unassigned —" is the default/empty state.
- **Detail editor** is a shared `Dialog`. On desktop it opens centred; on mobile it should go **full-width / bottom-sheet style** and the row table should **horizontally scroll** rather than squash the selects (per project rule: all UI must be responsive).
- **Image evidence**: drag-drop or file-pick inside the dialog → uploads to Azure → thumbnail with remove; keep the blob key for later deletion (same pattern as bug attachments).

## 7. Implementation notes (for the build phase — reference only)

Adding **UX** is a controlled-enum change; it's backward compatible (existing cases keep their value; empty stays valid). Touch-points:

- **Frontend**
  - `frontend/src/types/enums.ts` — add `UX = 'UX'` to `enum TestType`; add `TestType.UX` to `TEST_TYPES` (after `UI`). Reuse this enum everywhere (project rule) — the Type dropdown in `TestingTable.tsx` renders from `TEST_TYPES`, so no change there.
  - `frontend/src/features/reports/components/TestingTable.tsx` — replace the owner `<Input>` with the owner picker; add the "Edit detail" trigger + detail `Dialog`.
  - `frontend/src/i18n/en.ts` — any new labels ("Edit detail", "Unassigned", evidence copy) go through i18n (project rule).
- **Backend**
  - `backend/src/application/reports/domain/enums/test-type.enum.ts` — mirror `UX` in the domain enum + `TEST_TYPES` (frontend/backend enums must match).
  - `backend/src/application/reports/services/normalize-case.ts` — add import aliases so spreadsheets map correctly: `ux → UX`, `user experience → UX`, and keep `ui → UI`. Decide how `ui/ux` (combined cell text) should resolve (recommend → `UX`).
- **Azure** — image evidence reuses the app's existing Azure Blob object store (the store used for report screenshots & bug attachments). If the NestJS backend has no upload endpoint yet, that endpoint is a **dependency** for the detail-editor image feature (flagged, not assumed built).

**Bugs are unaffected:** Product OS `Bug.type` is a free string, not the `TestType` enum, so adding UX does not ripple into the bug board.

## 8. Data model impact

None structural. `TestCase` already carries `precondition`, `testSteps[]`, `expectedResult`,
`actualResult`, `note` (see `docs/specs/01` §6). This feature *surfaces* them. No migration;
old cases render exactly as before.

## 9. Acceptance criteria

- [ ] Type dropdown shows **UX** between UI and API; selecting it persists and reloads correctly.
- [ ] Importing a sheet with `type = "UX"` (or "user experience") maps to `UX`; unknown types still fall back gracefully.
- [ ] Owner is chosen from a people list; picking "Unassigned" clears it; a pre-existing non-user owner is still shown and preserved.
- [ ] A case can be opened; precondition/steps/expected/actual/note edit and persist.
- [ ] An image attached in the detail editor uploads to Azure and shows a thumbnail; removing it deletes the blob.
- [ ] Table + dialog are usable on mobile (horizontal scroll for the row; full-width dialog).
- [ ] Result changes remain audited (no regression to the history log).

## 10. Open decisions for the owner

1. **UX colour** (if/when we add per-type colours later) — suggest a violet/`--info` accent so UX vs. UI is visible at a glance. OK to defer.
2. **Import ambiguity** — when a spreadsheet cell literally says "UI/UX", should it map to **UX**, **UI**, or leave blank? (Recommend **UX**.)
3. **Owner source** — people list = project members only, or all workspace users? (Recommend project members.)

---

*Convention: this doc follows the `features/*.md` PRD style used in `old-report`. Once approved, the build follows the framework in `CLAUDE.md` (staged, reviewable, tested).*
