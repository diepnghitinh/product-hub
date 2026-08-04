---
name: module-tenants
description: Use when working on Tenants — the top-level multi-tenant isolation boundary (every aggregate carries a tenantId), managed exclusively from saas-admin via the platform console API. Related to module-auth (JWT tenant-suspension check), module-platform (the console guard/use-cases that own this controller), module-saas-admin.
---

# Module: Tenants

**Apps/paths:** `backend/src/application/tenants`, `backend/src/infrastructure/tenants`, `backend/src/presentation/platform/platform-tenants.controller.ts`, `saas-admin/src/features/tenants`

## Purpose
A Tenant is a single workspace ("Acme Product Team") — the isolation boundary every other aggregate (issues, docs, teams, projects, roadmaps, users...) belongs to via `tenantId`. There is **no self-service tenant admin UI inside the main app**: tenants are created, edited, suspended, and inspected only from the vendor-facing `saas-admin` console, which talks to a separate platform-auth-guarded API. Creating a tenant always creates its first admin user in the same operation, so a tenant with no one able to sign in never exists.

## Where it lives
- Backend domain/persistence: `backend/src/application/tenants/domain/entities/{tenant.entity.ts,tenant.props.ts}`, `backend/src/application/tenants/repositories/tenant.repository.ts` (port `ITenantRepository`), `backend/src/infrastructure/tenants/{tenants.module.ts,repositories/tenant.repository.ts,entities/tenant.schema.ts}`.
- Backend controller/use-cases: **not** under `presentation/tenants` — the HTTP surface lives under the platform console module, `backend/src/presentation/platform/platform-tenants.controller.ts` (route prefix `tenants`, guarded by `@PlatformAuth()`), backed by use-cases in `backend/src/application/platform/use-cases/platform-tenant.use-cases.ts` and DTOs in `backend/src/application/platform/dtos/tenant.dtos.ts`.
- Frontend (saas-admin only): `saas-admin/src/features/tenants/{TenantsPage.tsx,TenantDetailPage.tsx,CreateTenantDialog.tsx,EditTenantDialog.tsx}`, using `useTenants`/`useTenant`/`useCreateTenant`/`useUpdateTenant`/`useSetTenantStatus` from `saas-admin/src/lib/queries` (all hit `/platform/tenants`, i.e. the `/v1/platform` + `tenants` prefix combined).
- The main `frontend` app has no tenants feature — a signed-in user only ever operates inside their own tenant, never lists or switches tenants.

## Data model & key fields
`Tenant` collection (`backend/src/infrastructure/tenants/entities/tenant.schema.ts`), `_id` a uuid string:
- `name` (required, ≤120), `slug` (optional, lowercase/dash pattern `^[a-z0-9][a-z0-9-]*$`, unique-sparse index — nothing routes on it yet, it's a shorter label for the console)
- `status`: `TenantStatus.ACTIVE | SUSPENDED` (enum in `tenant.props.ts`). Missing/legacy rows default to `active` in both the schema default and the entity factory (`TenantEntity.create` treats `undefined` as active rather than failing validation).
- `contactEmail`, `notes` (operator-only scratchpad, never shown to the tenant), `createdAt`/`updatedAt`.
- Entity behaviors: `rename`, `update(patch)`, `suspend()`, `activate()`, `isSuspended` getter.
- `TenantResponseDto` (console API) is intentionally flat: alongside the core fields it inlines subscription (`planCode`, `planName`, `subscriptionStatus`, `billingCycle`, `currentPeriodEnd`) and usage counts (`userCount`, `projectCount`, `issueCount`, `docCount`, `teamCount`, `roadmapCount`) rather than nesting sub-objects — matches the flat-DTO house style.

## API surface
All under `@PlatformAuth()` (platform-console operator JWT, distinct from the tenant-app JWT), prefix `/tenants` on the platform API:
- `GET /tenants` — list/search (`name`/`slug`/`contactEmail`) + status filter, paginated (`ListTenantsUseCase`)
- `GET /tenants/overview` — platform-wide rollup for the console home (declared before `:id` since Nest matches literal segments first)
- `GET /tenants/:id` — tenant detail: base fields + `usage` (per-feature used/limit/
  overLimit lines), `entitlements` (plan chain + subscription overrides), and
  `adminEmails` (`GetTenantDetailUseCase`)
- `POST /tenants` — create tenant **and** its first admin in one call (`name`, optional `slug`/`contactEmail`/`notes`/`planCode`, plus `adminName`/`adminEmail`/`adminPassword`)
- `PATCH /tenants/:id` — update name/slug/contactEmail/notes
- `PATCH /tenants/:id/suspend` and `PATCH /tenants/:id/activate` — toggle `status` (`SetTenantStatusUseCase`)

`ITenantRepository` also exposes `findManyByIds`, `existsBySlug` (slug-uniqueness check, excludable by id), `countAll`, and `allIds()` — "every tenant id, drives one-off backfills."

## Relationships to other modules
- [[module-auth]]: `jwt.strategy.ts` and `login.use-case.ts` read `tenant.isSuspended` on every login and on every authenticated request (cached lookup in the strategy) — a suspended tenant's users are signed out and blocked from signing back in, even mid-session, without any data being deleted.
- [[module-teams]]: `CreateTenantUseCase` (`platform-tenant.use-cases.ts`) calls `EnsureDefaultTeamsUseCase.execute({ tenantId })` right after saving the new tenant — creating a tenant always seeds its two locked default teams (`qc`/`engineering`), same idempotent use-case that also runs at login-time backfill.
- [[module-users]]: `CreateTenantUseCase` also creates the tenant's first admin `UserEntity` in the same call (checked for email collision via `IUserRepository.existsByEmail` first) — a tenant with no one able to sign in never exists.
- module-platform (the saas-admin backend surface — not in this skill set's list but is where `platform-tenants.controller.ts`, `PlatformAuth`, `entitlement.service.ts`, and plan/subscription use-cases live): owns the entire tenant-management HTTP surface; this module supplies only the domain entity + repository underneath it.
- module-saas-admin: the only UI that lists, creates, edits, or suspends tenants (`TenantsPage`, `TenantDetailPage`, `CreateTenantDialog`, `EditTenantDialog`); also where plan assignment (`AssignPlanDialog`) and usage bars for a tenant are shown.
- Every tenant-scoped module ([[module-issues]], [[module-teams]], [[module-projects]], [[module-users]], etc.) foreign-keys its documents to a `tenantId`, making this the outermost isolation boundary the rest of the schema hangs off of — but none of those modules query the `Tenant` collection directly except for usage rollups and the auth/suspension check above.

## Gotchas & conventions
- There is no tenant switcher or tenant-scoped admin page inside the main app by design — all tenant lifecycle operations are operator actions from saas-admin, authenticated by a separate platform-admin JWT (`PlatformAuth`), not the regular tenant JWT.
- `status` must tolerate legacy documents with no field at all: the schema default, the entity factory's fallback, and the repository's `findAll` status filter (`{ $in: [ACTIVE, null] }` when filtering for active) all independently treat missing status as active — don't add a stricter check without preserving that.
- `slug` is optional and not currently used for routing/lookup anywhere else in the codebase — it exists purely as an operator-facing shorter label; its uniqueness is enforced via a sparse index plus `existsBySlug`.
- Suspending is reversible and non-destructive ("kept intact, but nobody in it can sign in") — never treat suspend as a soft-delete or vice versa.

## Related skills
[[module-auth]] [[module-issues]] [[module-teams]] [[module-users]] [[module-projects]]
