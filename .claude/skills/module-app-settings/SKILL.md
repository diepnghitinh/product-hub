---
name: module-app-settings
description: Use when working on App Settings — the per-tenant settings singleton (outbound webhooks config, cloud-storage config, legacy workspace-wide bug/task status defaults) at backend/src/{presentation,application,infrastructure}/app-settings and frontend/src/features/admin/{WebhooksSection,CloudStorageSection}.tsx. Related to module-webhooks (which sends), module-storage (which uploads), module-teams (real per-team board columns), module-bugs, module-tasks.
---

# Module: App Settings

**Apps/paths:** `backend/src/presentation/app-settings`, `backend/src/application/app-settings`, `backend/src/infrastructure/app-settings`, `frontend/src/features/settings/api.ts`, `frontend/src/features/admin/{WebhooksSection,CloudStorageSection}.tsx`

## Purpose
One document per tenant holding workspace-wide configuration that doesn't belong to any single domain: outbound chat webhooks (Lark/Telegram notifications on bug events), the cloud-storage provider used for media/doc uploads, and legacy default bug/task status lists. It is lazily created on first read (`AppSettingsEntity.create({ tenantId })`) — no explicit provisioning step.

## Where it lives
- Backend: `AppSettingsController` (`presentation/app-settings/app-settings.controller.ts`) → `GetAppSettingsUseCase` / `UpdateWebhooksUseCase` / `UpdateBugStatusesUseCase` / `UpdateTaskStatusesUseCase` / `UpdateStorageUseCase` (`application/app-settings/use-cases/app-settings.use-cases.ts`) → `AppSettingsEntity` (`application/app-settings/domain/app-settings.entity.ts`) → `IAppSettingsRepository` implemented in `infrastructure/app-settings/repositories/app-settings.repository.ts` against the `AppSettingsSchema` (`infrastructure/app-settings/entities/app-settings.schema.ts`).
- Frontend: `frontend/src/features/settings/api.ts` (`useSettings`, `useUpdateWebhooks`, `useUpdateStorage`, `useTestStorageConnection`), consumed by `frontend/src/features/admin/WebhooksSection.tsx` and `CloudStorageSection.tsx`. **Not** used by `AdminSettingsPage.tsx`'s team-status editor — that page calls `useUpdateTeamStatuses` from `frontend/src/features/teams/api.ts` instead (see Gotchas). `useTestStorageConnection` calls `POST /uploads/test-connection`, owned by [[module-storage]]'s `UploadsController` — not a `/v1/settings` route.

## Data model & key fields
`AppSettingsDoc` (Mongoose, `_id` uuid, unique index on `tenantId`):
- `tenantId: string`
- `webhooks: WebhookConfig[]` — `{ id, provider: WebhookProvider(lark|telegram), name, url, botToken?, chatId?, events: WebhookEvent[](bug-created|bug-assigned|comment-mention), enabled, memberMappings?: { userId, providerUserId, displayName }[] }`
- `bugStatuses: BugStatusConfig[]`, `taskStatuses: TaskStatusConfig[]` — legacy workspace-wide default status lists (see Gotchas)
- `taskLabels?: TaskLabelConfig[]` — legacy only; the repository still exposes `findLegacyTaskLabels`/`clearLegacyTaskLabels` for a one-time seed-then-unset migration to per-team labels, but no current use-case or bootstrap process calls them — the field is effectively orphaned. No API writes it.
- `storage?: CloudStorageConfig` — `{ provider: StorageProvider(none|s3|azure), s3Region?, s3Bucket?, s3AccessKeyId?, s3SecretAccessKey?(secret), s3Endpoint?, s3PublicBaseUrl?, azureConnectionString?(secret), azureContainer?, maxVideoMb, maxImageMb, maxDocMb? }`
- `createdAt`, `updatedAt`

## API surface
All under `/v1/settings`, `Role.ADMIN` except the two read endpoints:
- `GET /settings` — full blob, admin only, storage secrets masked to booleans
- `GET /settings/bug-statuses` — any authenticated user
- `GET /settings/task-statuses` — any authenticated user
- `PUT /settings/webhooks` — replace `webhooks[]`
- `PUT /settings/bug-statuses` / `PUT /settings/task-statuses` — replace the list; built-in status keys (`BUG_STATUSES`/`TASK_STATUSES`) must all remain, keys unique, labels non-empty
- `PUT /settings/storage` — merge; secrets are write-only (blank = keep existing), non-secret fields are a straight replace

## Relationships to other modules
- [[module-teams]] owns the **real, per-team** board columns (`TeamEntity.statuses`, edited via `AdminSettingsPage` → `useUpdateTeamStatuses`). The `bugStatuses`/`taskStatuses` here are a separate, older workspace-wide default list — per CLAUDE.md's Kanban rule, a board never reads columns from here; it reads its team's statuses.
- [[module-bugs]] / [[module-tasks]] define `BugStatusConfig`/`TaskStatusConfig` and the `BUG_STATUSES`/`TASK_STATUSES` built-in key enums this module validates against; `WebhookEvent.BUG_CREATED`/`BUG_ASSIGNED` fire from bug lifecycle events.
- [[module-webhooks]] owns *sending*: this module only stores/validates `webhooks: WebhookConfig[]` (the `PUT /settings/webhooks` CRUD); `WebhookNotifier` (`infrastructure/webhooks/webhook-notifier.service.ts`) reads that same `AppSettings.webhooks` array via `IAppSettingsRepository.findByTenant` to decide which hooks fire on an event — this module has no outbound-send code of its own.
- [[module-storage]] reads `CloudStorageConfig` fresh on every upload via `IAppSettingsRepository` — this module is the single source of truth for the S3/Azure credentials and size caps the upload pipeline enforces, but has no upload logic itself.
- [[module-admin]] is the sole frontend consumer: `WebhooksSection.tsx` and `CloudStorageSection.tsx` are admin-only tabs that edit this tenant's single `AppSettings` document via `useSettings`/`useUpdateWebhooks`/`useUpdateStorage`/`useTestStorageConnection`.
- [[module-platform]] is a separate, newer plan/subscription entitlement system (FeatureMap on Plan/Subscription) — not to be confused with this module's legacy `bugStatuses`/`taskStatuses` or webhook/storage config.

## Gotchas & conventions
- `bugStatuses`/`taskStatuses` on this entity look like board columns but are **not** wired into `AdminSettingsPage`, which manages the authoritative per-team statuses instead — treat these two fields as legacy/vestigial unless you find a live caller.
- Storage secrets (`s3SecretAccessKey`, `azureConnectionString`) never leave the server; `AppSettingsController.maskStorage` collapses them to `s3SecretConfigured`/`azureConnectionConfigured` booleans, and `mergeStorageConfig` keeps the stored secret when the client sends blank — a masked form round-trips safely.
- `taskLabels` on the schema is legacy-only (superseded by per-team labels); `IAppSettingsRepository.findLegacyTaskLabels`/`clearLegacyTaskLabels` exist for a migration that isn't currently invoked anywhere in the codebase — treat as dead code unless you find a live caller.
- Missing settings doc is not an error — `loadOrDefault` synthesizes an in-memory `AppSettingsEntity` with defaults (`DEFAULT_BUG_STATUSES`, `DEFAULT_TASK_STATUSES`, `defaultStorageConfig()`) so `GET` never 404s.

## Related skills
[[module-teams]] [[module-bugs]] [[module-tasks]] [[module-webhooks]] [[module-storage]] [[module-admin]] [[module-platform]]
