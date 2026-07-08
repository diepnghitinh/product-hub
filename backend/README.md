# product-hub · Backend

NestJS 11 + TypeORM (PostgreSQL) API, built with a clean/hexagonal **DDD** architecture
(rich domain aggregates → repository ports → adapters → thin controllers). Multi-tenant
(`tenantId` from JWT) with `admin | tester | guest` roles.

See the architecture rationale in `../docs/02-architecture.md` and the plan in
`~/.claude/plans/adaptive-leaping-dusk.md`.

## Layers

| Layer | Path | Holds |
|---|---|---|
| Framework primitives | `libs/core`, `libs/shared` | `Entity`/`AggregateRoot`/`ValueObject`, `Result`, `Guard`, `BaseRepository`, filters, interceptors, guards |
| Application | `src/application/<feature>` | domain aggregate, repository **port** (abstract), use-cases (`Result<T>`), DTOs, mappers |
| Infrastructure | `src/infrastructure/<feature>` | TypeORM ORM entity, repository **adapter**, module binding port→adapter |
| Presentation | `src/presentation/<feature>` | thin controller + module, mounted via router at a path prefix |

## Getting started

```bash
# 1. Start PostgreSQL
docker compose up -d db

# 2. Install deps
yarn        # or npm install

# 3. Configure env
cp .env.example .env

# 4. Run (schema auto-syncs in dev)
yarn start:dev
```

- API: `http://localhost:3000/v1`
- Swagger: `http://localhost:3000/swagger`

## Smoke test

```bash
curl -X POST http://localhost:3000/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"tenantName":"Acme","name":"Aaron","email":"aaron@acme.co","password":"secret123"}'

curl -X POST http://localhost:3000/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"aaron@acme.co","password":"secret123"}'
# → { token }, then send: Authorization: Bearer <token>
```
