---
name: module-reports
description: Use when working on Reports / Test-cases — feature test reports with heterogeneous document sections (overview/screenshot/cards/steps/bullets/ordered/testing) at backend/src/*/reports and frontend/src/features/reports. Related to [[module-bugs]] (bug.reportId links a bug to a test case), [[module-projects]], [[module-audit-log]], [[module-public]].
---

# Module: Reports / Test-cases

**Apps/paths:** `backend/src/presentation/reports`, `backend/src/application/reports`, `backend/src/infrastructure/reports`, `frontend/src/features/reports`

## Purpose
A "report" is a per-feature test document scoped to a project — the artifact a tester fills
in while validating a feature: a title/label/module, free-form document sections (overview
text, screenshots, cards, steps, bullets, ordered lists), and a **testing** section holding a
table of test cases with a result (Passed/Failed/…) each. Reports roll up into a project's
progress bar (`statusVariant` counts) and each test case can be linked to a bug filed against
it.

## Where it lives
- Backend: `ReportsController` (`presentation/reports/reports.controller.ts`, prefix
  `projects/:projectId/reports`) + `ProjectStatsController` (prefix `project-stats`); use-cases
  under `application/reports/use-cases/`; `IReportRepository` interface in
  `application/reports/repositories/report.repository.ts`, Mongoose impl in
  `infrastructure/reports/repositories/report.repository.ts` backed by `ReportSchema`
  (`infrastructure/reports/entities/report.schema.ts`, collection `reports`).
- Frontend: `frontend/src/features/reports/ReportView.tsx` (main editor page, route
  `/testing/:projectId/reports/:reportId`), `api.ts` (`useReports`, `useReport`,
  `useProjectStats`, `useReplaceSections`, `useUpdateReport`, `useCreateReport`,
  `useDeleteReport`, `useReorderReports`, `useImportTestCases`, `useSetResult`, and
  `useImportFeatures` — a client-side fan-out that creates one report per feature then calls
  the per-report import endpoint, not a dedicated bulk API), `components/` (`ReportSections`,
  `SectionBlock` (renders/edits every non-testing section type, incl. `MediaUploader` for
  screenshot images), `TestingTable`, `CaseEditDialog`, `CaseDetailEditor`,
  `ImportTestCasesDialog`, `ImportFeaturesDialog`, `HistoryDialog`, `ReportStats`,
  `OwnerSelect`, `TypeSelect`, `ResultSelect`), plus `parse-features.ts` /
  `parse-test-cases.ts` for xlsx/JSON import parsing.

## Data model & key fields
`ReportDoc` (Mongo collection `reports`, unique index on `tenantId+projectId+slug`, plus an
index on `tenantId+projectId+sections.cases.shortId` for fast case lookups):
- `tenantId`, `projectId`, `groupId` (empty = ungrouped), `slug`, `title`, `subtitle`, `label`,
  `featureId`, `module`, `statusVariant` (`FeatureStatus`: `testing|done|info`), `owner`,
  `reported`, `order` (drag-reorder position), `sections: ReportSection[]` (heterogeneous
  `Mixed[]` document body — cast in the schema since it doesn't type-check 1:1).

`ReportSection` is a discriminated union on `SectionType` (`overview | screenshot | cards |
steps | bullets | ordered | testing`); only `testing` carries test cases:
- `TestingSection`: `banner?`, `coverage: CoverageBar[]`, `cases: TestCaseData[]`.
- `TestCaseData`: `id`, `shortId` (public per-project lookup key), `area`, `type` (`TestType`:
  Functional/UI/UX/API/Integration/Performance/Security/Regression/Accessibility/Other),
  `result` (`TestResult`: Passed/Failed/Blocked/Retest/Skipped/Untested), `owner`,
  `precondition?`, `testSteps?`, `expectedResult?`, `actualResult?`, `note?`.

`ReportResponseDto` is flat per CLAUDE.md convention (no nested DTO types) and adds a computed
`caseCount`.

## API surface
- `GET/POST /projects/:projectId/reports` — list (filter by `groupId`) / create.
- `POST /projects/:projectId/reports/reorder` — reorder via `ids[]`.
- `GET/PATCH/DELETE /projects/:projectId/reports/:id` — fetch full doc / update meta
  (title/label/status/group/…) / delete.
- `PUT /projects/:projectId/reports/:id/sections` — replace the whole `sections` body
  (auto-save from the editor).
- `POST /projects/:projectId/reports/:id/testcases/import` — bulk import normalized
  xlsx/JSON test-case rows.
- `PATCH /projects/:projectId/reports/:id/testcases/:shortId/result` — set one case's result
  (the outer `:id` is unused; the case is located by `shortId` alone), audited (see below).
- `GET /project-stats?ids=a,b,c` — batch rollup (`reportsTotal/Done/Testing/Info`, `progress`)
  per project, used by dashboard/overview cards.

## Relationships to other modules
- **[[module-bugs]] / [[module-issues]]**: a bug is filed *against* a test case. The link is
  `reportId` on the shared issue schema (`issue.schema.ts`), set when creating a bug from
  `ReportView` (`?reportId=` query param → `NewBugPage`) and queried back with
  `useBugs({ reportId })` to show a case's linked bugs; `BugDetail.tsx` renders a "View report"
  link to `/testing/:projectId/reports/:reportId`. Reports do **not** import from bugs — the
  dependency is one-way (bugs point at reports).
- **[[module-projects]]**: reports are scoped 1:1 to `projectId`; `CreateReportUseCase`
  validates the project exists and belongs to the tenant before creating. `ProjectStatsController`
  feeds each project's progress bar/pills on the Projects/Dashboard views. The public-share
  flow also reaches in directly: `GetPublicProjectUseCase`
  (`application/projects/use-cases`) injects `IReportRepository` and calls `findByProject` to
  attach a project's reports to its unauthenticated share payload, bypassing the reports
  controller entirely.
- **[[module-audit-log]]**: `SetTestCaseResultUseCase` writes an `AuditLogEntity`
  (`entity: TESTCASE`, `reportId`, old/new result) on every real change; a no-op set is
  intentionally not audited. `HistoryDialog.tsx` in the FE reads this trail.
- **[[module-groups]]**: `groupId` files a report under a group; empty string means ungrouped.
  `GetReportsUseCase` supports filtering the list by `groupId`.
- **[[module-storage]]**: a `ScreenshotSection`'s images are added via `MediaUploader`
  (`SectionBlock.tsx` → `@/components/MediaUploader` → `uploadMedia`/`/v1/uploads`), the same
  upload pipeline bugs/docs/avatars use — reports have no upload logic of their own.
- **[[module-public]]**: `PublicProjectsController` (`GET /v1/public/projects/:token`) imports
  `ReportMapper` and `ReportResponseDto` directly from `application/reports` to shape the
  reports returned alongside a shared project — the one place outside this module's own
  controller that builds report DTOs.

## Gotchas & conventions
- `sections` is stored as `Mixed[]` — Mongoose/TS can't validate its shape at the schema layer;
  correctness relies on the FE building well-formed `ReportSection` objects and the `PUT
  .../sections` endpoint replacing the array wholesale (no partial section patches).
- Test cases are addressed by `shortId`, not the case's own `id` — `findByCaseShortId` and the
  result-setting endpoint both key off it, and there's a dedicated Mongo index for it.
- Follows CLAUDE.md's flat-DTO rule: `ReportResponseDto` inlines everything instead of nesting
  a separate DTO type.
- `ReportMapper.toResponseDto(s)` is the single place entity → flat DTO conversion happens;
  use it rather than hand-mapping.

## Related skills
[[module-bugs]] [[module-issues]] [[module-projects]] [[module-audit-log]] [[module-groups]]
[[module-storage]] [[module-public]]
