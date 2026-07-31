# saas-admin — the product-hub platform console

The **vendor's** console. Not a feature of the product; the app *you* use to run the SaaS.
It lists every workspace on the deployment, holds the plan catalog, assigns subscriptions,
and reports what each workspace actually uses.

```
┌─ tenant app ─────────┐        ┌─ platform console ───┐
│ frontend/   :3001    │        │ saas-admin/  :3003   │
│ workspace users      │        │ you, the vendor      │
└──────────┬───────────┘        └──────────┬───────────┘
           │  /v1/*                        │  /v1/platform/*
           └──────────────┬────────────────┘
                   backend/  :3000          ← one API, one database, one deploy
```

## The one thing to understand

**The console is a separate origin, and that is the security model.**

A workspace user has no URL on the app's origin that serves this bundle — not a route, not a
path, not a feature flag. The two apps also hold different tokens (`ph_platform_token` vs
`ph_token`) signed with **different secrets** (`PLATFORM_JWT_SECRET` vs `JWT_SECRET`), so a
workspace token can't be replayed against `/v1/platform` and vice versa. Operators live in
their own `platformadmins` collection with no `tenantId` at all — they are not users of any
workspace.

Do not "simplify" this into an `/admin` route on the tenant app. Everything below assumes the
separation holds.

## Run it

```bash
ADMIN=1 ./dev.sh                    # from the repo root: db + api + app + console
```

…or on its own, against an API that is already running:

```bash
cp .env.example .env                # VITE_API_URL, VITE_APP_URL
npm install
npm run dev                         # → http://localhost:3003
```

There is **no sign-up**. The first operator is created by a script, which is the only way one
comes into existence:

```bash
cd backend && npm run seed:platform
# → ops@product-hub.io / platform123   (dev default; refuses to invent one in prod)
# also seeds a starter catalog: Free · Pro · Business
```

To create a real operator:

```bash
npm run seed:platform -- --email you@company.com --password '…' --name 'Your Name'
```

Re-running with an existing email **resets that operator's password** — that's the recovery
path, since nobody can reset it for you.

| script | |
|---|---|
| `npm run dev` | Vite dev server on :3003 |
| `npm run build` | production bundle into `dist/` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run preview` | serve the built bundle |

## What's in it

| page | what it's for |
|---|---|
| **Overview** | every workspace at a glance — count, people, MRR, how many are on a plan, trialling, past due, suspended, over a limit |
| **Workspaces** | search/filter every tenant; open one for its plan, usage and capabilities; create one (with its first admin); suspend / reactivate |
| **Plans** | the catalog. Each plan grants *capabilities* and can **build on** another one |
| **Subscriptions** | who is on which plan, what they pay, per-tenant overrides |
| **Usage** | what each workspace actually uses against what its plan allows, worst first |

### Entitlements: flags and meters

A capability is one of two things:

- a **flag** — on or off (`cycles`, `okrs`, `public_sharing`, `collab_editing`, `api_keys`,
  `mcp`, `audit_log`, `custom_storage`, `webhooks`, `priority_support`)
- a **meter** — a number (`users`, `projects`, `issues`, `docs`, `teams`, `roadmaps`), where
  **`-1` = unlimited** and **`0` = not granted**

The catalog is defined once, server-side, in
`backend/src/application/platform/domain/features.ts`, and the console fetches it from
`GET /platform/plans/features`. Add a capability there and it appears in the plan editor by
itself — the editor has no list of its own to drift out of sync.

### Inheritance is live, not copied

A plan stores only the grants it *changes*, plus `extendsCode` pointing at the plan it builds
on. Business → Pro → Free resolves at read time into `effectiveFeatures`. Raise a limit on
Free and every plan above it moves too — nothing was copied at save time, so nothing goes
stale.

A subscription's `featureOverrides` are merged on top for one tenant. An override is
**presence, not value**: the editor shows the inherited number as a placeholder, and the reset
button *removes* the key rather than writing the inherited value back. Setting an override to
the same number it already inherits is not a no-op — it freezes that tenant at that number.

### Limits are reported, not enforced *(V1)*

The tenant API does not reject anything for being over a limit. A workspace past its plan
keeps working, and the console tells you who to talk to. This was a deliberate V1 call — it
makes the whole model observable before it can lock a paying customer out of their own data.

Enforcement, when it comes, belongs in the tenant API next to
`EntitlementService`, **not** here.

## Notes for whoever changes this next

- **The UI primitives in `src/components/ui/` are copies** of the tenant app's, not a shared
  package. Two apps, two `node_modules`, no build wiring between them — copying was the
  lowest-risk answer for a console with five pages. If it grows past that, extract a workspace
  package; until then, a fix worth having in both has to be applied in both.
- **`tailwind.css` and `tailwind.config.cjs` are byte-identical to the tenant app's.** The
  console is on-brand on purpose (same `--primary` purple); what tells you which app you're in
  is the sidebar and the light default theme, not a different hue. Keep the tokens in sync.
- **`src/lib/entitlements.ts` re-does the plan+override merge client-side** so the Usage page
  can rank every workspace from one list request instead of N detail requests. The merge order
  must not drift from the server's (`EntitlementService`).
- **`UsagePage` scans the first 200 workspaces** and the "without a plan" list on
  Subscriptions covers the first 100. Both say so in the UI. Past a few hundred tenants these
  want a server-side ranking endpoint, not a bigger number.
- **MRR assumes one currency** across the catalog. A mixed catalog would need real FX, which
  V1 does not do.
- **There is no delete-tenant endpoint, by design.** Suspend is reversible; deleting a
  workspace's data from a console is not.
- Suspension takes effect **immediately at login** and **within ~30s mid-session** (the API's
  JWT strategy caches the user briefly).

## API surface

Everything lives under `/v1/platform`, guarded by `PlatformAuthGuard` (strategy
`platform-jwt`). Swagger: <http://localhost:3000/swagger>.

```
POST   /platform/auth/login              PATCH  /platform/tenants/:id/suspend
GET    /platform/auth/me                 PATCH  /platform/tenants/:id/activate
POST   /platform/auth/change-password
                                         GET    /platform/plans
GET    /platform/tenants                 GET    /platform/plans/features
GET    /platform/tenants/overview        POST   /platform/plans
GET    /platform/tenants/:id             PATCH  /platform/plans/:id
POST   /platform/tenants                 DELETE /platform/plans/:id
PATCH  /platform/tenants/:id
                                         GET    /platform/subscriptions
                                         GET    /platform/subscriptions/:tenantId
                                         PUT    /platform/subscriptions/:tenantId
                                         POST   /platform/subscriptions/:tenantId/cancel
                                         DELETE /platform/subscriptions/:tenantId
```

Subscriptions are keyed by **tenantId**, not by a subscription id — one workspace has at most
one, so `PUT` is the whole assign/change operation.

## Deploying

`docker compose up --build` brings it up alongside everything else:

- app → <http://localhost:8080>
- **console → <http://localhost:8081>** (`ADMIN_PORT`)

Its container runs its own nginx, which serves the SPA and proxies `/v1` to the `api` service
— so the console is same-origin with the API and needs no CORS. `deploy/nginx.admin.conf` is
the compose variant; the image's own `nginx.conf` has the proxy commented out (nginx resolves
upstreams at config load, so a hard-coded `api` host would stop the container booting
anywhere that name doesn't exist).

In production:

1. Give it **its own hostname** (`admin.yourdomain.com`), never a path under the app.
2. Set a **`PLATFORM_JWT_SECRET` different from `JWT_SECRET`**.
3. Put it behind a VPN or IP allowlist. The login page is the only thing standing between the
   internet and every tenant's data — nginx already sends `X-Robots-Tag: noindex` and
   `X-Frame-Options: DENY`, but that is hygiene, not access control.
4. Seed the operator with an explicit password (the script refuses to invent one when
   `NODE_ENV=prod`).
