---
name: module-platform
description: Use when working on Platform (vendor console) — the /v1/platform API for platform operators (tenants, plans, subscriptions, entitlements) with its own platform-jwt auth, backend/src/{presentation,application,infrastructure}/platform. Related to module-tenants, module-saas-admin, module-app-settings.
---

# Module: Platform (Vendor Console)

**Apps/paths:** `backend/src/presentation/platform`, `backend/src/application/platform`, `backend/src/infrastructure/platform`

## Purpose
The backend for the vendor's own admin surface (`saas-admin` app), separate from any tenant workspace. Platform operators sign in with a dedicated credential, manage the tenant list (create/suspend/activate workspaces), define pricing plans with feature entitlements, and put tenants on subscriptions. It also computes each tenant's live usage against their plan limits and rolls the whole platform up into an overview (MRR, tenant counts, over-limit tenants).

## Where it lives
- Backend controllers: `presentation/platform/platform-auth.controller.ts` (`/auth`), `platform-tenants.controller.ts` (`/tenants`), `platform-plans.controller.ts` (`/plans`), `platform-subscriptions.controller.ts` (`/subscriptions`) — all mounted under `platform` prefix (`/v1/platform/...`) by `PlatformPresentationModule`, wired in `presentation.module.ts`.
- Use-cases: `application/platform/use-cases/{platform-auth,platform-tenant,plan,subscription}.use-cases.ts`.
- Domain: `application/platform/domain/entities/{platform-admin,plan,subscription}.{entity,props}.ts`, `domain/features.ts` (entitlement catalog/merge logic), `domain/platform-jwt-payload.ts`.
- Services: `application/platform/services/entitlement.service.ts` (resolves plan-chain + override → effective `FeatureMap`), `platform-jwt.strategy.ts` + `platform-auth.guard.ts` (`@PlatformAuth()` decorator), `platform-admin.decorator.ts` (`@CurrentPlatformAdmin()`).
- Infra: `infrastructure/platform/entities/{platform-admin,plan,subscription}.schema.ts` (Mongoose), `repositories/*.repository.ts`, plus `platform-usage.repository.ts` for live counts.
- Frontend: the vendor console lives in the separate `saas-admin/` app (see [[module-saas-admin]]) — not part of this module's read scope.

## Data model & key fields
- `platformadmins` collection (`PlatformAdminDoc`): `email` (unique), `name`, `passwordHash`, `isActive`, `lastLoginAt`.
- `plans` collection (`PlanDoc`): `code` (unique), `name`, `priceMonthly`/`priceYearly`, `currency`, `features: FeatureMap` (sparse grants), `extendsCode` (inheritance chain), `isActive`, `sortOrder`.
- `subscriptions` collection (`SubscriptionDoc`): `tenantId` (unique — one subscription per tenant), `planCode`, `status` (`SubscriptionStatus`: active/trial/past_due/…), `billingCycle` (`monthly`/`yearly`), `currentPeriodEnd`, `cancelAt`, `featureOverrides: FeatureMap` (per-tenant overrides on top of the plan).
- `FeatureMap` (`domain/features.ts`): keyed by feature `key`, either `flag` (`enabled`) or `metered` (`limit`, -1 = unlimited). Built-in `FEATURES` catalog spans `limits` (users, projects, issues, docs, teams, roadmaps — each with a `resourceKey` counted by `IPlatformUsageRepository`) and `capabilities` (cycles, okrs, public_sharing, collab_editing, api_keys, mcp, audit_log, custom_storage, webhooks, priority_support).

## API surface
- `POST /v1/platform/auth/login` (public), `GET /v1/platform/auth/me`, `POST /v1/platform/auth/change-password`
- `GET /v1/platform/tenants`, `GET /v1/platform/tenants/overview`, `GET /v1/platform/tenants/:id`, `POST /v1/platform/tenants`, `PATCH /v1/platform/tenants/:id`, `PATCH /v1/platform/tenants/:id/suspend`, `PATCH /v1/platform/tenants/:id/activate`
- `GET /v1/platform/plans`, `GET /v1/platform/plans/features` (feature catalog), `GET /v1/platform/plans/:id`, `POST /v1/platform/plans`, `PATCH /v1/platform/plans/:id`, `DELETE /v1/platform/plans/:id`
- `GET /v1/platform/subscriptions`, `GET /v1/platform/subscriptions/:tenantId`, `PUT /v1/platform/subscriptions/:tenantId` (upsert), `POST /v1/platform/subscriptions/:tenantId/cancel`, `DELETE /v1/platform/subscriptions/:tenantId`

All controllers except `auth/login` carry `@PlatformAuth()`.

## Relationships to other modules
- [[module-tenants]] — `PlatformTenantsController`'s `CreateTenantUseCase` builds a real `TenantEntity` (same shape self-serve registration produces), calls `EnsureDefaultTeamsUseCase`, and creates the first admin `UserEntity` with `Role.ADMIN`; `SetTenantStatusUseCase` toggles `TenantStatus.SUSPENDED`/`ACTIVE`, which tenant-side login enforces.
- [[module-saas-admin]] — the frontend console (separate Vite app `saas-admin/`) that consumes this entire API surface; this module is purely its backend.
- [[module-app-settings]] — a distinct, older per-tenant settings singleton (webhooks, storage config); not to be confused with plan-level entitlements here.
- [[module-users]] — `GetTenantDetailUseCase` fetches a tenant's admin users to show as contacts; `CreateTenantUseCase` provisions the first user.
- [[module-teams]] — new tenants get default teams via `EnsureDefaultTeamsUseCase` at creation time.

## Gotchas & conventions
- Fully separate auth: `platform-jwt` passport strategy with its own secret (`PLATFORM_JWT_SECRET`, falls back to `${JWT_SECRET}::platform`) and a `scope: 'platform'` claim checked on every validate — a stolen tenant JWT can never authenticate here even if replayed.
- `@PlatformAuth()` applies `@Public()` *and* `UseGuards(PlatformAuthGuard)` together: `@Public()` only opts out of the global tenant `JwtAuthGuard`; the platform guard is what actually authenticates.
- Entitlements resolve at **read time**, not write time (`EntitlementService.resolve`/`effective`): a plan's `extendsCode` chain is walked fresh each call so a base plan change propagates to everything extending it; a subscription's `featureOverrides` are applied last. Cycle-safe by construction in `resolve` (dedupes visited codes); `wouldCycle` guards writes.
- Route-order matters: `GET /tenants/overview` and `GET /plans/features` are declared before their `:id`/`:tenantId` siblings since Nest matches literal segments only if they come first.
- One subscription per tenant is a DB-level invariant (`unique: true` index on `tenantId`), not just app logic.
- `DeletePlanUseCase` refuses to delete a plan with active subscribers or any plan that `extendsCode`s it — both would otherwise silently zero out entitlements rather than error anywhere.
- `GET /plans/:id` accepts either the plan's id or its `code` (`GetPlanUseCase` tries id first, falls back to code) — the console links by id, an operator types the code.
- `/v1/platform` is a documented dead-end for workspace JWTs ("nothing under /v1/platform is reachable with a workspace JWT" — comment in `presentation.module.ts`).

## Related skills
[[module-tenants]] [[module-saas-admin]] [[module-app-settings]] [[module-users]] [[module-teams]]
