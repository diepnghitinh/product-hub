---
name: module-users
description: Use when working on Users — accounts, roles, avatar, last-active, and each user's private personal-board columns, at backend/src/*/users and frontend/src/features/users. Related to module-auth, module-tasks, module-favourites.
---

# Module: Users

**Apps/paths:** `backend/src/presentation/users`, `backend/src/application/users`, `backend/src/infrastructure/users`, `frontend/src/features/users`

## Purpose
Manages tenant member accounts: admin CRUD on people, self-service password/avatar changes, and "last online" tracking shown in Settings → People. It also owns each user's private **personal board** columns (`personalStatuses`) — a per-user Kanban config separate from team statuses, used by the `/tasks/personal` board.

## Where it lives
- Backend: `presentation/users/users.controller.ts` (routes), `presentation/users/last-active.interceptor.ts` (fire-and-forget activity stamp on every authenticated HTTP request), use-cases in `application/users/use-cases/` (`create-user`, `get-users`, `get-user`, `update-user`, `update-my-avatar`, `delete-user`, `change-password`, `reset-user-password`, `get-personal-statuses`, `replace-personal-statuses`, `touch-user-activity`), domain entity `application/users/domain/entities/user.entity.ts` + `user.props.ts`, repo port `application/users/repositories/user.repository.ts` (`IUserRepository`), Mongoose impl in `infrastructure/users/repositories/user.repository.ts` + `infrastructure/users/entities/user.schema.ts`.
- Frontend: `features/users/api.ts` (React Query hooks: `useUsers`, `useCreateUser`, `useUpdateUser`, `useDeleteUser`, `useResetUserPassword`, `useChangeMyPassword`, `useUpdateMyAvatar`), `features/users/InvitePersonDialog.tsx` (admin-only "add person" form, shared by Settings → People and the assignee picker's "invite via email" row; there is no email-invite flow — `POST /users` creates the account outright with a password the admin relays out-of-band).

## Data model & key fields
Collection via `UserSchema` (`infrastructure/users/entities/user.schema.ts`):
- `_id` (uuid), `tenantId`, `email` (globally unique across tenants, lowercased — login resolves tenant from the account), `name`, `passwordHash`, `role` (`Role` enum, default `TESTER`), `avatarUrl` (string | null — null renders initials fallback), `inboxSeenAt`, `lastActiveAt` (written **only** by `touchLastActive`, never a normal `save`, to avoid overwrite races), `favourites: FavouriteRef[]` (pinned sidebar entities), `personalStatuses: TaskStatusConfig[]` (empty by default; entity fills in `DEFAULT_TASK_STATUSES` on read for pre-existing accounts), `readInboxKeys: string[]`, timestamps.
- `UserResponseDto` is flat and never includes `passwordHash`.

## API surface
- `GET /users` — list tenant users, paginated (`QueryUserDto`: pagination + optional `role` + free-text `search` matched against `name`/`email`). Roles: ADMIN, PRODUCT, TESTER, DEVELOPER (any member, for @-mentions/assignee names).
- `POST /users` — create user in tenant. ADMIN only.
- `GET /users/:id` — ADMIN, PRODUCT.
- `PATCH /users/:id` — update name/role. ADMIN only.
- `PATCH /users/:id/password` — admin resets another user's password directly (no email infra). ADMIN only.
- `DELETE /users/:id` — ADMIN only.
- `PUT /users/me/password` — change own password. Any authenticated user.
- `PUT /users/me/avatar` — set/clear own avatar URL (image already uploaded via `/uploads`). Any authenticated user.
- `GET /users/me/personal-statuses` / `PUT /users/me/personal-statuses` — read/replace the caller's private personal-board columns. Self-service only, owner read from token.

## Relationships to other modules
- [[module-auth]] — login resolves tenant by global `email` lookup; `JwtPayload` (`auth.userId`, `auth.tenantId`) drives every self-service and tenant-scoped route here.
- [[module-tasks]] — `personalStatuses` are `TaskStatusConfig[]` (same shape as team statuses) and back the `/tasks/personal` board; `DEFAULT_TASK_STATUSES` seeds new/legacy accounts.
- [[module-favourites]] — `favourites: FavouriteRef[]` (pinned sidebar items) is stored inline on the user document.
- [[module-inbox]] — `inboxSeenAt` and `readInboxKeys` track inbox read-state per user.
- [[module-storage]] — avatar upload happens client-side to cloud storage first; `PUT /users/me/avatar` only persists the resulting URL.
- [[module-teams]] — `Role` gates which users can be assigned/see what across team-scoped features; role labels shown via `InvitePersonDialog`'s role select.
- [[module-account]] — the signed-in user's own `/profile` page is a thin frontend feature entirely over this module's `/users/me/password` and `/users/me/avatar` endpoints; it introduces no backend of its own.
- [[module-admin]] — `AdminPeoplePage` is the full user-management table (role, last-online, invite via `InvitePersonDialog` from this module, delete) built directly on `useUsers`/`useUpdateUser`/`useDeleteUser`; `ResetPasswordDialog` calls `useResetUserPassword`.
- [[module-platform]] — `GetTenantDetailUseCase` injects `IUserRepository` and calls `findByTenant(..., {role: Role.ADMIN})` to show a tenant's admin users as contacts; `CreateTenantUseCase` injects `IUserRepository` and calls `existsByEmail`/`save` to provision the tenant's first admin `UserEntity` when a workspace is created from the vendor console.
- [[module-mcp]] — `GetMcpContextUseCase` and `McpCreateIssueUseCase`'s `resolvePerson` resolve assignee names/emails via `IUserRepository.findByTenant`, and every MCP-created record is attributed to the calling key's owner user via `findById(actor.userId)`.

## Gotchas & conventions
- No email-invite flow exists: creating a user sets a real password immediately, and the admin communicates it out-of-band (`InvitePersonDialog` shows an explicit hint so the password field doesn't look optional).
- `DeleteUserUseCase` rejects `id === actingUserId` ("You cannot delete your own account") before it even checks the target exists — an admin can never delete themselves.
- `lastActiveAt` must only be written through `IUserRepository.touchLastActive` (a field-level update, with `timestamps:false` so it never bumps `updatedAt`), never through `save`/`update` on a loaded entity — those would race and overwrite concurrent edits. `LastActiveInterceptor` fires this best-effort (catches and logs, never blocks or fails the request) only when `request.user` is set by the JWT guard — API-key/MCP callers don't count as the human being present. `TouchUserActivityUseCase` additionally throttles to one write per user per 60s via an in-memory `Map` (capped at 10k tracked users, evicted lazily), so "last online" is precise to the minute, not the request.
- `FavouriteRefSchema` and `PersonalStatusSchema` are subdocuments with `_id: false`; any field not declared on them is silently stripped by Mongoose on save.
- `findByEmail`/`existsByEmail` are global (no tenant scoping) since email uniqueness is global; all other reads/writes are tenant-scoped.
- `UserResponseDto` is intentionally flat per CLAUDE.md convention — no nested response types.

## Related skills
[[module-auth]] [[module-tasks]] [[module-favourites]] [[module-inbox]] [[module-storage]] [[module-teams]] [[module-account]] [[module-admin]] [[module-platform]] [[module-mcp]]
