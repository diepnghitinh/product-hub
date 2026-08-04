---
name: module-saas-admin
description: Use when working on SaaS Admin (Billing & Usage) — the vendor operator console at saas-admin/src/features/{overview,plans,subscriptions,usage,auth} that manages workspaces, plans, subscriptions and entitlement limits against backend/src/*/platform. Related to module-platform, module-tenants, module-auth.
---

# Module: SaaS Admin (Billing & Usage)

**Apps/paths:** `saas-admin/src/features/{overview,plans,subscriptions,usage,auth}`, `saas-admin/src/lib/{queries,types,auth,entitlements}.ts`, `backend/src/{presentation,application,infrastructure}/platform`, `backend/src/{presentation,application,infrastructure}/tenants`

## Purpose
A separate React app (`saas-admin`) is the platform vendor's own back office — a "console" for operators, not for workspace end-users. It lets an operator see every workspace (tenant) on the deployment, define pricing plans with inheritable feature entitlements, assign/change/cancel a tenant's subscription, layer per-tenant overrides on top of a plan, and monitor usage against limits. It explicitly does not enforce limits — going over is "a conversation, not a wall".

## Where it lives
- Backend: `backend/src/presentation/platform/{platform-tenants,platform-plans,platform-subscriptions,platform-auth}.controller.ts`, use-cases under `application/platform/use-cases/{platform-tenant,plan,subscription,platform-auth}.use-cases.ts`, mongoose entities under `infrastructure/platform/entities/{plan,subscription,platform-admin}.schema.ts` and `infrastructure/tenants/entities/tenant.schema.ts`.
- Frontend (saas-admin, its own Vite app, not the main `frontend`):
  - `features/overview/OverviewPage.tsx` — platform-wide stat rollup (tenants, MRR, trial/past-due/suspended/over-limit counts).
  - `features/plans/{PlansPage,PlanEditorDialog}.tsx` — plan CRUD, card grid showing effective entitlements.
  - `features/subscriptions/{SubscriptionsPage,AssignPlanDialog,FeatureOverrideEditor}.tsx` — assign/change/cancel/remove a tenant's plan, per-tenant feature overrides.
  - `features/usage/UsagePage.tsx` — ranks tenants by usage-vs-limit for one resource at a time (client-computed, no server usage endpoint).
  - `features/auth/LoginPage.tsx` — operator-only login; no sign-up, operators seeded via `npm run seed:platform`.
  - Data layer: `lib/queries.ts` (React Query hooks, broad `useInvalidateAll` on every mutation), `lib/types.ts` (flat DTO mirrors), `lib/auth.tsx` (token + `/platform/auth/me` verification), `lib/entitlements.ts` (client-side plan+override merge and usage math, mirrors server merge in `GET /platform/tenants/:id`).

## Data model & key fields
- **Plan** (`plans` collection): `code` (permanent, immutable after create), `name`, `description`, `priceMonthly`/`priceYearly`/`currency`, `features` (own sparse `FeatureMap` grants only), `extendsCode` (live inheritance base — changing the base later moves every plan that doesn't override), `effectiveFeatures` (server-computed: own grants merged over the full inheritance chain), `isActive`, `sortOrder`, `subscriberCount`.
- **FeatureMap**: `Record<key, { enabled?, limit?, name?, type? }>` — sparse by design; presence of a key is the override signal, not any particular value. `-1` limit = unlimited, `0` = off. Catalog served from `GET /platform/plans/features` (`FeatureCatalogItem`: key/name/type `'flag'|'metered'`/unit/group `'limits'|'capabilities'`/**`resourceKey`** — the countable tenant field a metered feature is checked against, `null` for operator-only numbers with no live usage figure) so the editor can't drift from server-known features. The catalog is fixed: 6 metered `limits` (`users`/`projects`/`issues`/`docs`/`teams`/`roadmaps`, one per `UsageResource`) and 10 `capabilities` flags gating other modules — `cycles`, `okrs`, `public_sharing`, `collab_editing`, `api_keys`, `mcp`, `audit_log`, `custom_storage`, `webhooks`, `priority_support`.
- **Subscription** (`subscriptions` collection): one per tenant, keyed by `tenantId` (not its own id) everywhere in the API. `planCode`, `status` (`trial|active|past_due|canceled`), `billingCycle` (`monthly|yearly`), `monthlyEquivalent`, `currentPeriodEnd`, `cancelAt`, `featureOverrides` (FeatureMap, per-tenant deviations layered on the plan), `notes`.
- **Tenant** (`tenant.schema.ts`, read via `/platform/tenants`): `status` (`active|suspended`), `planCode`/`planName`/`subscriptionStatus`/`billingCycle`/`currentPeriodEnd` (denormalized for list display), usage counters `userCount/projectCount/issueCount/docCount/teamCount/roadmapCount`. `TenantDetail` adds `usage: TenantUsageLine[]`, `entitlements`, `adminEmails`.
- **PlatformAdmin** (`platformadmins` collection): operator account — `email`, `name`, `isActive`, `lastLoginAt`; separate identity space from workspace `Users` ([[module-users]]) and its own JWT (`PlatformJwtPayload`, guarded by `PlatformAuth()`/`platform-auth.guard`).

## API surface
All under `/v1/platform/*`, guarded by `@PlatformAuth()` except login:
- `POST /platform/auth/login` (public), `GET /platform/auth/me`, `POST /platform/auth/change-password`
- `GET /platform/tenants`, `GET /platform/tenants/overview`, `GET /platform/tenants/:id`, `POST /platform/tenants`, `PATCH /platform/tenants/:id`, `PATCH /platform/tenants/:id/suspend`, `PATCH /platform/tenants/:id/activate`
- `GET /platform/plans`, `GET /platform/plans/features`, `GET /platform/plans/:id` (id or code), `POST /platform/plans`, `PATCH /platform/plans/:id`, `DELETE /platform/plans/:id` (fails if a plan has subscribers or another plan extends it)
- `GET /platform/subscriptions`, `GET /platform/subscriptions/:tenantId`, `PUT /platform/subscriptions/:tenantId` (upsert — same call to assign or change), `POST /platform/subscriptions/:tenantId/cancel`, `DELETE /platform/subscriptions/:tenantId`

## Relationships to other modules
- **[[module-platform]]** — this frontend app IS the sole consumer of the `/v1/platform` API and its `PlatformAuth` guard; every page here maps 1:1 to a controller/use-case owned by that module.
- **[[module-tenants]]** — saas-admin *is* the operator-facing UI onto the platform/tenants backend layer; `Tenant` is the same entity module-tenants owns, just read here for billing/ops purposes (suspend/activate, usage counters).
- **[[module-auth]]** — parallels the workspace JWT auth pattern but is a wholly separate identity space (`PlatformAdmin`/`PlatformJwtPayload` vs regular `User`); workspace accounts cannot sign in to this console.
- **[[module-teams]] / [[module-issues]] / [[module-docs]] / [[module-roadmaps]]** — the usage counters (`issueCount`, `docCount`, `teamCount`, `roadmapCount`, `projectCount`) this app displays are rollups produced by those modules inside a tenant; saas-admin only reads/ranks them, never edits them.
- **[[module-projects]]** — `projectCount` on a tenant reflects that module's "Testing" workspace containers.
- **[[module-app-settings]]** — a distant cousin: both are tenant-scoped configuration, but app-settings is per-tenant self-service config, while plans/subscriptions here are vendor-controlled and cross-tenant.

## Gotchas & conventions
- Inheritance is **live**, not a snapshot: editing a base plan's grant changes every plan/tenant that doesn't override it. `effectiveFeatures` is always server-computed for a `Plan`; the client only replicates the *plan+subscription-override* merge (`lib/entitlements.ts`) for the Usage page's bulk ranking, and that merge order (plan chain first, overrides last) must not drift from the server's `GET /platform/tenants/:id` logic.
- A plan's `code` is permanent — immutable once created (used as the FK from `Subscription.planCode` and `Plan.extendsCode`).
- Subscriptions are addressed by `tenantId`, never their own `id` — a tenant has exactly one, so `PUT /platform/subscriptions/:tenantId` is both "assign" and "change".
- Removing a subscription (`DELETE`) makes every metered limit read as zero for that tenant, distinct from "cancel" (`POST .../cancel`), which is bookkeeping only and leaves the workspace fully working.
- V1 **reports limits, does not enforce them** — an over-limit tenant is never blocked; this is stated explicitly in both Overview and Usage pages' copy.
- All mutations call a broad `useInvalidateAll()` (overview + tenants + tenant + plans + subscriptions) rather than surgical cache updates — deliberate, since this is low-traffic and a stale MRR figure is judged worse than one extra request.
- No self sign-up; operators are created only via `npm run seed:platform` in the backend.
- `UsagePage.tsx` only ranks the first `SCAN_LIMIT = 200` tenants (one `useTenants({ page: 1, limit: 200 })` call, client-sorted) — a deployment past 200 workspaces silently has a partial ranking, flagged to the operator via a "Showing the first N of total" footnote rather than paginated.

## Related skills
[[module-platform]] [[module-tenants]] [[module-auth]] [[module-teams]] [[module-issues]] [[module-projects]] [[module-app-settings]]
