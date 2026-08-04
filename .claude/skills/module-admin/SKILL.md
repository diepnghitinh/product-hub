---
name: module-admin
description: Use when working on Admin (frontend) — the in-workspace Settings/People console at frontend/src/features/admin (teams, per-team statuses/cycles/labels/custom fields, API keys, MCP, webhooks, storage, user roles). Related to module-teams, module-app-settings, module-api-keys.
---

# Module: Admin (frontend)

**Apps/paths:** `frontend/src/features/admin`

## Purpose
The workspace's own Settings and People screens — no backend of its own. It composes other
modules' APIs into one admin console: creating/archiving teams, editing a team's board columns
(statuses), sprint cadence, labels and custom fields, generating API keys, connecting the MCP
assistant, configuring outbound webhooks and cloud storage, and managing user accounts (role,
last-online, password reset, invite, delete).

## Where it lives
- Frontend only (no `backend/src/*/admin`). Pages:
  - `AdminSettingsPage.tsx` — the Settings shell: left-nav tab strip (`?tab=`) plus one entry
    per active team (`?tab=team:<id>`). Also defines `StatusColumnsEditor`,
    `TeamSettingsSection`, `TeamCyclesEditor`, `TeamLabelsEditor`, `CustomFieldsEditor`, and
    `ApiKeysSection` inline.
  - `AdminPeoplePage.tsx` — the People table: role select, last-online, invite, reset password,
    remove.
  - `TeamsSection.tsx` — create/rename/archive teams (the `?tab=teams` tab).
  - `ResetPasswordDialog.tsx` — admin sets another user's password (random-generate or type),
    shown once with copy.
  - `CloudStorageSection.tsx`, `McpSection.tsx`, `WebhooksSection.tsx` — thin per-tab wrappers
    over other modules' settings (see Relationships).

## Data model & key fields
No admin-owned entity. It reads/writes:
- `TeamDto` (from [[module-teams]]): `statuses`, `labels`, `customFields`, `cyclesEnabled`,
  `cycleMode`, `cycleLengthWeeks`, `cycleCooldownWeeks`, `cycleStartDate`,
  `cycleAutoRollover`, `isDefault`, `archived`, `issueType`.
- `UserDto` (from [[module-users]]): `role`, `lastActiveAt`, `avatarUrl`.
- `StatusColumn = { key, label, color }` — local shape shared by the bug/task board-columns
  editor; `builtinKeys` come from `builtinStatusKeys(issueType)` and can't be deleted, only
  relabeled/recolored/reordered.
- `TaskLabelConfig { key, name, color }` and `CustomFieldConfig { id, name, type, required?,
  options? }` (`@/types/enums`) — no built-ins, empty list is valid.

## API surface
None directly — every save goes through another feature's hooks: `useUpdateTeamStatuses`,
`useUpdateTeamLabels`, `useUpdateTeamCustomFields`, `useCreateTeam`, `useUpdateTeam` (teams
API), `useUpdateCycleConfig` (cycles API), `useApiKeys`/`useGenerateApiKey`/`useRevokeApiKey`
(api-keys API), `useSettings`/`useUpdateWebhooks`/`useUpdateStorage`/`useTestStorageConnection`
(app-settings API), `useUsers`/`useUpdateUser`/`useDeleteUser`/`useResetUserPassword` (users
API).

## Relationships to other modules
- [[module-teams]] — the tab list under "Teams" in the left nav is literally each active team;
  `TeamSettingsSection` renders that team's statuses/cycles/labels/custom-fields editors and
  saves via the teams API. Team CRUD (create/rename/archive) lives in `TeamsSection.tsx` here.
- [[module-cycles]] — `TeamCyclesEditor` is the only UI for a team's sprint rhythm (auto vs.
  manual) and embeds `TeamCyclePlanner` from the cycles feature when manual.
- [[module-app-settings]] — `WebhooksSection` and `CloudStorageSection` are admin-only tabs
  that edit the tenant's single `AppSettings` document (outbound webhooks, S3/Azure storage).
- [[module-api-keys]] — `ApiKeysSection` (inline in `AdminSettingsPage.tsx`) generates/revokes
  keys; `McpSection` reuses the same `useGenerateApiKey` hook to hand a key to an AI assistant.
- [[module-mcp]] — `McpSection` shows the MCP endpoint URL, connection snippet, and recent
  MCP-created-entity history (`useMcpEvents`).
- [[module-users]] — `AdminPeoplePage` is the full user-management table (role, last-online,
  invite via `InvitePersonDialog` from the users feature, delete); `ResetPasswordDialog` calls
  `useResetUserPassword`.
- [[module-auth]] — every section is gated: `canManageDelivery` (ADMIN or PRODUCT) is required
  just to see `AdminSettingsPage`; `adminOnly` tabs (API Keys, MCP, Webhooks, Storage) further
  require `isAdmin` since their data comes from an `@Roles(ADMIN)` endpoint. `AdminPeoplePage`
  requires `isAdmin` outright.
- [[module-labels]] / custom fields — `TeamLabelsEditor` and `CustomFieldsEditor` are the only
  place a team's labels and custom fields are defined; every task/bug in that team shares them.

## Gotchas & conventions
- Which tab is open lives in the URL (`?tab=`), same pattern as boards' `?view=` — so it
  survives reload and is linkable.
- `adminOnly` tabs are filtered out for non-admin PRODUCT users because their backing endpoint
  (`GET /settings`, which also carries webhook config) is `@Roles(ADMIN)`; a hand-typed
  `?tab=webhooks` for a non-admin falls back to the first visible tab rather than 403ing.
- Built-in status columns/teams (`isDefault`) can be relabeled/recolored/reordered but never
  deleted/archived — enforced client-side here and again by the backend.
- Per CLAUDE.md's Kanban-board rule: a team's statuses (columns) are owned *only* by this
  Settings → Teams → team settings screen (`useUpdateTeamStatuses`) — boards themselves never
  mint or edit columns.
