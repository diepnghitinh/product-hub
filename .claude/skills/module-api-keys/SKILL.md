---
name: module-api-keys
description: Use when working on API Keys — per-tenant programmatic access tokens (generate/list/revoke, `x-api-key` header auth via ApiKeyGuard) at backend/src/{presentation,application,infrastructure}/api-keys, surfaced in the frontend's Settings → API Keys and Settings → MCP sections. Related to module-mcp, module-public, module-teams.
---

# Module: API Keys

**Apps/paths:** `backend/src/presentation/api-keys`, `backend/src/application/api-keys`, `backend/src/infrastructure/api-keys`, `frontend/src/features/api-keys` (+ UI in `frontend/src/features/admin/AdminSettingsPage.tsx`'s `ApiKeysSection` and `frontend/src/features/admin/McpSection.tsx`)

## Purpose
Lets an admin mint a per-tenant secret token (`phk_...`) that lets an external client — chiefly an AI assistant over MCP, or a public API caller — authenticate as a real user of the tenant without a JWT session. The plaintext is shown exactly once, at creation; only its SHA-256 hash is ever stored. Revoking deletes the key outright.

## Where it lives
- Backend: `ApiKeysController` (`/api-keys`, admin-only CRUD) + `ApiKeyGuard` (`x-api-key` header auth, used by other modules) in `presentation/api-keys`; use-cases `GenerateApiKeyUseCase`/`GetApiKeysUseCase`/`RevokeApiKeyUseCase`/`AuthenticateApiKeyUseCase` in `application/api-keys/use-cases/api-key.use-cases.ts`; `ApiKeyEntity`/`ApiKeyProps` domain; `IApiKeyRepository` port + Mongoose `ApiKeyRepository` in infrastructure; `ApiKeySchema` (collection `ApiKey`, via `InjectModel('ApiKey')`).
- Frontend: `frontend/src/features/api-keys/api.ts` — `useApiKeys`, `useGenerateApiKey`, `useRevokeApiKey` (React Query, key `['api-keys']`). There are two UI surfaces, both tabs inside `AdminSettingsPage.tsx`: `ApiKeysSection` (Settings → API Keys) is the actual key-management page — name+generate, a list with prefix/last-used/revoke, and a one-time reveal dialog — plus a reference cURL snippet for the public test-case update endpoint; `frontend/src/features/admin/McpSection.tsx` (Settings → MCP) has its own, separate generate-only flow (only calls `useGenerateApiKey`, not `useApiKeys`/`useRevokeApiKey`): step 1 names+generates a key, step 2 builds a `claude mcp add ... --header "x-api-key: <key>"` command, and its own one-time reveal dialog shows the plaintext.

## Data model & key fields
`ApiKeyDoc` (Mongo collection `ApiKey`, `_id` = uuid, `timestamps: { createdAt: true, updatedAt: false }`):
- `tenantId` (indexed), `name`, `keyHash` (SHA-256, unique+indexed), `prefix` (masked display, first 12 chars of the plaintext e.g. `phk_ab12cd34…`), `createdBy` (user id), `lastUsedAt` (nullable, set on each successful auth), `createdAt`.
Plaintext format: `phk_` + 24 random bytes hex (`generateApiKey()` in `@module-shared/utils/api-key.util`). Never persisted — only `hashApiKey()` output is stored.

## API surface
All under `/v1/api-keys`, `@Roles(Role.ADMIN)`, tenant-scoped from JWT:
- `GET /api-keys` — list masked keys (`ApiKeyResponseDto[]`: id, name, prefix, lastUsedAt, createdAt — no secret).
- `POST /api-keys` — body `CreateApiKeyDto { name }`; returns `CreatedApiKeyResponseDto` = masked fields + `key` (plaintext, once).
- `DELETE /api-keys/:id` — revoke (hard delete), 404s if the key isn't in the caller's tenant.

`ApiKeyGuard` (not a controller route) reads `x-api-key`, calls `AuthenticateApiKeyUseCase`, and on success attaches `req.apiAuth: { tenantId, name, keyId, userId }` — `userId` is the key's `createdBy`, so a write made through the key is attributed to the real admin who generated it, not a nameless robot.

## Relationships to other modules
- [[module-mcp]] — `mcp.controller.ts` and `mcp-http.controller.ts` both `@UseGuards(ApiKeyGuard)` on every request (including session-bearing ones) and read `req.apiAuth` for `tenantId`/`userId`/`keyId` to attribute MCP-created entities and log history events.
- [[module-public]] — `public-testcases.controller.ts` also guards with `ApiKeyGuard` and destructures `req.apiAuth` for `tenantId`/`name`.
- [[module-teams]]/admin settings — surfaced as two tabs inside `AdminSettingsPage.tsx`: a dedicated "API Keys" tab (`ApiKeysSection`, `adminOnly`) for full key management, and the "MCP" tab (`McpSection`, `adminOnly`) for generating a key as part of MCP setup.

## Gotchas & conventions
- `ApiKeysPresentationModule` does not export `ApiKeyGuard` — it only exports `useCases` transitively via `ApplicationApiKeysModule`. Every consuming module (`McpPresentationModule`, `PublicPresentationModule`) must import `ApplicationApiKeysModule` itself (for `AuthenticateApiKeyUseCase`) and list `ApiKeyGuard` in its own `providers` array before it can `@UseGuards(ApiKeyGuard)`.
- Repository `save()` is an upsert (`findByIdAndUpdate` with `upsert: true`), used both to create and to persist `markUsed()` timestamp bumps on every authenticate call.
- Revoke checks tenant ownership manually in the use-case (`key.tenantId !== tenantId`) rather than scoping the Mongo query — a cross-tenant `:id` fails closed with "API key not found".
- The frontend never stores/refetches the plaintext: `CreatedApiKeyDto` only exists transiently in each section's own local `created` state (`ApiKeysSection` and `McpSection` each keep and clear their own) for the one-time reveal dialog; the list view always uses the masked `prefix`.
