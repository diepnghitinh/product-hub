---
name: module-audit-log
description: Use when working on Audit Log — the append-only change-history record for test-case results and report edits, at backend/src/{presentation,application,infrastructure}/audit-log and frontend/src/features/audit-log (rendered by reports' HistoryDialog). Related to module-reports, module-projects, module-public.
---

# Module: Audit Log

**Apps/paths:** `backend/src/presentation/audit-log`, `backend/src/application/audit-log`, `backend/src/infrastructure/audit-log`, `frontend/src/features/audit-log`

## Purpose
An append-only history of who changed what on a project's test cases and reports —
specifically test-case *result* changes today (pass/fail/etc). Exists so a project's
"History" dialog can show a field-level before/after trail with actor and time, for both
authenticated users and external CI/API callers hitting the public test-case endpoint.

## Where it lives
- Backend: `AuditLogController` (`presentation/audit-log/audit-log.controller.ts`, single
  read endpoint) + `GetAuditLogUseCase` (`application/audit-log/use-cases`) reading through
  `IAuditLogRepository`; writes happen elsewhere (see Relationships) via `IAuditLogRepository.append`.
  Mongoose schema in `infrastructure/audit-log/entities/audit-log.schema.ts`, repo impl in
  `infrastructure/audit-log/repositories/audit-log.repository.ts`.
- Frontend: `frontend/src/features/audit-log/api.ts` exports `useAuditLog(projectId)`
  (react-query, fetches up to 100 entries), consumed by
  `frontend/src/features/reports/components/HistoryDialog.tsx`.

## Data model & key fields
`AuditLogDoc` / `AuditLogEntity` (collection backing `AuditLogSchema`, immutable —
`timestamps: { createdAt: true, updatedAt: false }`, `_id` is a uuid string):
- `tenantId`, `projectId` (both indexed), `reportId`
- `entity: AuditEntity` — `TESTCASE | REPORT` (what kind of thing changed)
- `entityRef` — human label (case shortId/area, or report title)
- `field`, `oldValue`, `newValue` — flat string diff (no nested value objects)
- `actorType: AuditActor` — `USER | API` (authenticated user vs public API key)
- `actorId`, `actorName`
- `createdAt`

`AuditLogResponseDto` mirrors this flatly (no nested objects), per CLAUDE.md convention.

## API surface
- `GET /v1/projects/:projectId/audit-log` — paginated project change history
  (`PaginationDto` query), returns `AuditLogResponseDto[]`. This is the module's only
  controller route; entries are written by other modules calling `IAuditLogRepository.append`
  directly, not through a POST endpoint.

## Relationships to other modules
- [[module-reports]] — the actual write path. `SetTestCaseResultUseCase`
  (`application/reports/use-cases/set-test-case-result.use-case.ts`) builds an
  `AuditLogEntity` and calls `audit.append(...)` whenever a test case's result changes; a
  no-op (same value) is deliberately **not** audited so CI polling doesn't spam History.
  `reports.controller.ts` exposes the authenticated "Set a test case result (audited)"
  endpoint; `presentation/public/public-testcases.controller.ts` exposes the public/CI
  equivalent, tagging entries `AuditActor.API`.
- [[module-projects]] — audit entries are scoped by `projectId`; the History dialog opens
  from a project's Reports context.
- [[module-public]] — the public test-case result endpoint is the other write entry point,
  used by external CI/tooling with `actorType: API`.

## Gotchas & conventions
- **Append-only, no update/delete API** — the repository port only exposes `append` and
  `findByProject`; there is no edit or removal path for entries.
- **No-op changes are not audited** — writing the same value again produces no log entry
  (see `set-test-case-result.use-case.ts` comment), to keep History readable under CI polling.
- Response/props/schema all use flat string fields (`oldValue`/`newValue` as strings, not
  typed diffs) per this repo's flat-DTO convention.
- Frontend fetches a fixed page of up to 100 entries (`limit: 100`) with no pagination UI yet
  — `HistoryDialog` renders the raw list in a scrollable panel.

## Related skills
[[module-reports]] [[module-projects]] [[module-public]]
