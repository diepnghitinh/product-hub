---
name: module-auth
description: Use when working on Auth — JWT login/register/me at backend/src/{presentation,application}/auth (global JwtAuthGuard + RolesGuard) and frontend/src/lib/auth.tsx. Related to module-tenants, module-users, module-teams.
---

# Module: Auth

**Apps/paths:** `backend/src/presentation/auth`, `backend/src/application/auth`, `backend/libs/core/{decorators,presentation/guards,interfaces}`, `frontend/src/features/auth`, `frontend/src/lib/auth.tsx`

## Purpose
Email/password authentication that doubles as workspace bootstrap: `register` creates a brand-new tenant (workspace) plus its first `admin` user in one call, `login` authenticates against an existing tenant, and both return a signed JWT the SPA stores and replays. There is no separate `infrastructure/auth` layer — persistence is delegated to the existing users/tenants repositories.

## Where it lives
- Backend: `presentation/auth/auth.controller.ts` (routes) → `application/auth/use-cases/{register,login,get-me}.use-case.ts` → `IUserRepository`/`ITenantRepository`. JWT signing config in `application/auth/constants.ts` (`JWT_SECRET`, `JWT_EXPIRES_IN` env, defaults `dev-secret-change-me` / `7d`). Passport strategy in `application/auth/services/jwt.strategy.ts`. Cross-cutting guards/decorators live in `backend/libs/core` (shared lib, not this module's own folder): `presentation/guards/jwt-auth.guard.ts`, `presentation/guards/roles.guard.ts`, `decorators/{public,roles,auth-user}.decorator.ts`, `interfaces/{role.enum,jwt-payload}.ts`.
- Frontend: `features/auth/{LoginPage,RegisterPage}.tsx` (forms) drive `lib/auth.tsx`'s `AuthProvider`/`useAuth()`, which calls `/auth/login`, `/auth/register`, `/auth/me` and derives role gates (`isAdmin`, `canWrite`, `canEditDelivery`, `canManageDelivery`) used app-wide instead of components re-checking `user.role`.

## Data model & key fields
No auth-owned collection. `JwtPayload` (`backend/libs/core/interfaces/jwt-payload.interface.ts`): `userId, tenantId, email, name, role` — this is exactly what's signed into the token and exactly what's attached to `request.user`. `Role` enum (`core/interfaces/role.enum.ts`): `admin | tester | guest | product | developer`, shared as the single source of truth by the users domain.

## API surface
- `POST /v1/register` — `@Public()`. `RegisterDto {tenantName, name, email, password(min 6)}` → creates `TenantEntity`, seeds its default teams (`EnsureDefaultTeamsUseCase`), creates the first user as `Role.ADMIN`, returns `AuthResponseDto {token, user}`.
- `POST /v1/login` — `@Public()`. `LoginDto {email, password}` → same invalid-credentials message for unknown email and wrong password (anti-enumeration); fails distinctly if `tenant.isSuspended`. Returns `{token, user}`.
- `GET /v1/me` — requires bearer token; returns `UserResponseDto` for `auth.userId`.

## Relationships to other modules
- [[module-tenants]] — `register` creates the `TenantEntity`; `login` and `JwtStrategy` both re-check `tenant.isSuspended` (login rejects outright, the strategy enforces it mid-session, see Gotchas).
- [[module-users]] — auth use-cases read/write through `IUserRepository`; `Role` on the user entity comes from this module's enum; `GetMeUseCase` + `UserMapper` back `GET /me`.
- [[module-teams]] — registration calls `EnsureDefaultTeamsUseCase` so a new workspace never starts with zero teams.
- Every other protected controller — `JwtAuthGuard` and `RolesGuard` are registered as global `APP_GUARD`s in `backend/src/app.module.ts`, so all routes are locked down by default; `@Public()` opts a route out, `@Roles(...)` narrows it, and `@AuthUser()` reads `JwtPayload` off `request.user` (this is how every other module gets `tenantId`/`role`).
- [[module-collab]] — the Hocuspocus WebSocket server verifies the same access token via `jwt.verify(token, env.jwtSecret)` (`collab/src/auth.ts`), so `collab`'s `JWT_SECRET` must stay byte-identical to this module's (`collab/src/env.ts`); it also mirrors `Role` and the write-role set against this module's `Role` enum and the API's `@Roles(admin, tester, product)` guard on the doc-page `PATCH` route, so the two must be kept in sync by hand.

## Gotchas & conventions
- Global guard order matters: `JwtAuthGuard` runs first (populates `request.user` or short-circuits on `@Public()`), then `RolesGuard` (no `@Roles` metadata = open to any authenticated user).
- Suspension is enforced twice for different reasons: `LoginUseCase` blocks a suspended tenant from getting a new token; `JwtStrategy.isSuspended` re-checks on every request (30s in-memory memo per tenant) because tokens live 7 days — a workspace suspended mid-session is cut off within ~30s, not instantly. A tenant that no longer exists is treated as not-suspended (deletion is a separate concern).
- `AuthResponseDto`/`UserResponseDto` are flat per CLAUDE.md convention — no nested DTO wrapping.
- Frontend never reads `user.role` directly in feature code — it consumes the derived booleans (`isAdmin`, `canWrite`, `canEditDelivery`, `canManageDelivery`) off `useAuth()`, which mirror the backend's `@Roles` matrix and must be kept in sync with it by hand (no shared source between BE guard checks and this FE mirror).
- Session hydration on load is a `GET /auth/me` call gated by a stored token (`lib/api`'s `setToken`); a failed call clears the token rather than erroring the app.

## Related skills
[[module-tenants]] [[module-users]] [[module-teams]] [[module-collab]]
